# LLMnesia Insights

A self-hosted evidence store, durable Strategy Ledger, and read-oriented
dashboard for LLMnesia. PostHog, GA4, Google Search Console, and Bing evidence
is collected without an analysis-model call. Codex or Claude Code researches
the code and prior decisions, reasons over the prepared evidence, and publishes
a validated review to Supabase.

To run a review, open this repository in Codex or Claude Code and say:

> **Run the Insights review.**

The shared workflow is in [`INSIGHTS_AGENT.md`](INSIGHTS_AGENT.md). The two
commands it uses are:

```bash
npm run insights:prepare
npm run insights:publish -- .insights/review.json
```

For the founder-facing weekly loop, dashboard freshness meanings, and the
manual fallback, see [`USING_INSIGHTS.md`](USING_INSIGHTS.md).

Vercel Cron calls the evidence-only route. No dashboard control or scheduled
job invokes an analysis or strategy model. The older `npm run pipeline` and
LLM-backed routes remain temporarily for rollback and are not part of the
primary workflow.

## Setup

### 1. Supabase schema

Run this in your Supabase SQL editor (unchanged from before):

```sql
create table public.weekly_insights (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  week_end date not null,
  metrics_snapshot jsonb not null,
  headline text,
  corrections jsonb not null default '[]',
  revisions jsonb not null default '[]',
  chat jsonb not null default '[]',
  strategy jsonb,
  strategy_goal text,
  strategy_decisions jsonb not null default '[]',
  strategy_chat jsonb not null default '[]',
  summary text not null,
  findings jsonb not null,
  action_items jsonb not null,
  open_threads jsonb not null,
  resolved_threads jsonb not null,
  model_used text not null,
  created_at timestamptz not null default now()
);

create index on public.weekly_insights (week_start desc);
```

> **Migration (existing databases):** the `headline` column was added after launch. If your table predates it, run this once before the next pipeline run or the insert will fail:
>
> ```sql
> alter table public.weekly_insights add column if not exists headline text;
> alter table public.weekly_insights add column if not exists corrections jsonb not null default '[]';
> alter table public.weekly_insights add column if not exists chat jsonb not null default '[]';
> alter table public.weekly_insights add column if not exists revisions jsonb not null default '[]';
> alter table public.weekly_insights add column if not exists strategy jsonb;
> alter table public.weekly_insights add column if not exists strategy_goal text;
> alter table public.weekly_insights add column if not exists strategy_decisions jsonb not null default '[]';
> alter table public.weekly_insights add column if not exists strategy_chat jsonb not null default '[]';
> ```
>
> **Migration (Known facts / standing caveats):** persistent caveats & context
> notes that apply to *every* week's analysis (so a confirmed non-issue — e.g.
> the PostHog vs GA4 install gap — stops being re-flagged). Managed from the
> "Known facts" panel on the Insights page. Run once:
>
> ```sql
> create table if not exists public.standing_caveats (
>   id uuid primary key,
>   created_at timestamptz not null default now(),
>   updated_at timestamptz,
>   kind text not null default 'caveat',   -- 'caveat' | 'context'
>   affected_metric text not null,
>   note text not null,
>   active boolean not null default true
> );
> alter table public.standing_caveats enable row level security;  -- service key bypasses RLS; no policies = anon locked out (safe)
> ```

### 1b. Stateful Strategy Ledger schema

Run this once to enable the persistent ledger, evidence history, and audit
trail. The existing weekly report table remains unchanged and is still written
for backwards compatibility.

```sql
create table if not exists public.strategy_ledger (
  id integer primary key default 1 check (id = 1),
  state jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.evidence_deltas (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  week_end date not null,
  delta jsonb not null,
  raw_snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists evidence_deltas_week_start on public.evidence_deltas (week_start desc);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  entry_type text not null,
  target text,
  operation text not null,
  patch jsonb,
  evidence text,
  confidence text,
  model_used text not null,
  created_at timestamptz not null default now()
);
create index if not exists ledger_entries_week_start on public.ledger_entries (week_start desc);
create index if not exists ledger_entries_entry_type on public.ledger_entries (entry_type);

create table if not exists public.context_sources (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  source_type text not null,
  repo text,
  digest jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists context_sources_week_start on public.context_sources (week_start desc);

alter table public.strategy_ledger enable row level security;
alter table public.evidence_deltas enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.context_sources enable row level security;

-- These tables are server-only. Current Supabase projects may require Data API
-- grants explicitly; keep browser roles locked out and grant only the server.
revoke all on table public.strategy_ledger, public.evidence_deltas,
  public.ledger_entries, public.context_sources from anon, authenticated;
grant select, insert, update, delete on table public.strategy_ledger,
  public.evidence_deltas, public.ledger_entries, public.context_sources
  to service_role;
```

Then run `npm run seed-ledger` once. It uses the newest legacy strategy and
metrics snapshot as a starting point, and leaves an existing ledger untouched.

`npm run check-schema` verifies these four tables as well as the legacy report
schema. A permission error means the tables exist but the `service_role` Data
API grant above is missing.

### 1b(ii). Incremental analytics ingestion

Apply [`supabase/insights-ingestion.sql`](supabase/insights-ingestion.sql).
It stores every PostHog, GA4, GSC and Bing response used in a review and keeps
a per-source freshness cursor. The daily collector updates recent data; an
Insights review reads the stored evidence and only triggers ingestion when that
cursor is behind.

### 1c. Traffic Growth Planner schema (`/growth`)

The Growth Planner (Google Search Console + opportunity detection + weekly
action plan) lives in its own tables, **NOT** as more jsonb on
`weekly_insights` — GSC data is row-per-query-per-day and multi-site, so it
needs proper relational storage. Run this block once before opening `/growth`:

```sql
create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  root_url text not null,
  gsc_property text not null,
  sitemap_url text,
  brief_override text,
  -- Current objective for /growth. Keep this stage-specific, e.g.
  -- "Build qualified organic traffic and product discovery; avoid monetization
  -- recommendations until the product has a larger active base."
  growth_goal text,
  -- Code repo this site's content lives in. Used in handoff prompts so the
  -- LLM can name the right repo for the founder to open in Claude Code /
  -- Codex (e.g. "llmnesia-site njs"). Plain text — name it however the
  -- folder is on disk.
  repo text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (gsc_property)
);

-- Existing-DB migration for the new column:
alter table public.sites add column if not exists repo text;
alter table public.sites add column if not exists growth_goal text;

create table if not exists public.gsc_rows (
  site_id uuid not null references public.sites(id) on delete cascade,
  query text not null,
  page text not null,
  date date not null,
  country text not null default 'zzz',
  device text not null default 'all',
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr double precision not null default 0,
  position double precision not null default 0,
  synced_at timestamptz not null default now(),
  primary key (site_id, query, page, date, country, device)
);
create index if not exists gsc_rows_site_date on public.gsc_rows (site_id, date desc);
create index if not exists gsc_rows_site_query on public.gsc_rows (site_id, query);
create index if not exists gsc_rows_site_page on public.gsc_rows (site_id, page);

create table if not exists public.growth_opportunities (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  week_start date not null,
  type text not null,
  target_query text,
  target_page text,
  evidence jsonb not null,
  score double precision not null,
  created_at timestamptz not null default now()
);
create index if not exists growth_opps_site_week on public.growth_opportunities (site_id, week_start desc);

create table if not exists public.growth_plans (
  site_id uuid not null references public.sites(id) on delete cascade,
  week_start date not null,
  plan jsonb not null,
  model_used text not null,
  generated_at timestamptz not null default now(),
  primary key (site_id, week_start)
);

create table if not exists public.growth_actions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  week_start date not null,
  recommendation_id uuid,
  opportunity_id uuid,
  action_type text not null,
  target_query text,
  target_page text,
  suggested_title text,
  brief jsonb,
  status text not null default 'planned',
  status_updated_at timestamptz not null default now(),
  published_url text,
  follow_up_date date,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists growth_actions_site_status on public.growth_actions (site_id, status);
create index if not exists growth_actions_recommendation on public.growth_actions (recommendation_id);

-- Sites seed. The gsc_property string MUST match exactly what Search Console
-- shows (top-left dropdown). Use `sc-domain:example.com` for a Domain property
-- (the modern default), or `https://example.com/` for a URL-prefix property
-- (note the trailing slash — must match GSC verbatim).
insert into public.sites (name, root_url, gsc_property, sitemap_url, repo) values
  ('LLMnesia',   'https://llmnesia.com',   'sc-domain:llmnesia.com',   'https://llmnesia.com/sitemap.xml',   'llmnesia-site njs')
on conflict (gsc_property) do nothing;

-- Backfill repo for sites already seeded before the `repo` column existed:
update public.sites set repo = 'llmnesia-site njs' where name = 'LLMnesia'   and repo is null;
```

> **Migration (Bing Webmaster Tools):** if you are adding Bing to an existing
> database, run this block once before syncing:
>
> ```sql
> -- Optional override when the URL registered in Bing WMT differs from root_url:
> alter table public.sites add column if not exists bing_site_url text;
>
> create table if not exists public.bing_rows (
>   site_id  uuid not null references public.sites(id) on delete cascade,
>   query    text not null,
>   date     date not null,
>   country  text not null default 'all',
>   clicks   integer not null default 0,
>   impressions integer not null default 0,
>   ctr      double precision not null default 0,
>   position double precision not null default 0,
>   synced_at timestamptz not null default now(),
>   primary key (site_id, query, date, country)
> );
> create index if not exists bing_rows_site_date  on public.bing_rows (site_id, date desc);
> create index if not exists bing_rows_site_query on public.bing_rows (site_id, query);
> ```
>
> After that, set `BING_WEBMASTER_API_KEY` and click **Sync** in `/growth` to
> backfill. If the site URL in Bing WMT differs from `root_url` (e.g. it has a
> trailing slash), update the row:
> `update public.sites set bing_site_url = 'https://llmnesia.com/' where name = 'LLMnesia';`
>
> **Migration (Bing opportunity detection):** run once to let opportunity
> detection tag which engine a candidate came from (existing rows default to
> 'google'):
>
> ```sql
> alter table public.growth_opportunities add column if not exists source text not null default 'google';
> ```
>
> **Bing + Google feed two places:** (1) the `/growth` planner, where the raw
> multi-site query data drives opportunity detection and the weekly SEO plan,
> and (2) the **weekly insights** analysis, which gets a combined Google + Bing
> search-visibility digest for **llmnesia.com only** (impressions, top queries,
> ranking, week-over-week) under `metrics_snapshot.search_performance`. That's
> the top-of-funnel demand layer GA4/PostHog can't see. It's `jsonb` so no extra
> DDL is needed; it simply appears once `gsc_rows` / `bing_rows` have data, and
> the pipeline omits it (and never fails) when they don't.

> Run as-is. If a later sync returns "property not found", that site's GSC
> entry is URL-prefix instead of Domain — update just that row in the `sites`
> table (e.g. `update public.sites set gsc_property = 'https://llmnesia.com/' where name = 'LLMnesia';`).
> Changing the `gsc_property` value is safe: existing `gsc_rows` reference the
> row's `id`, not the property string.

### 2. Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable | Where to find it |
|---|---|
| `POSTHOG_PROJECT_ID` | PostHog → Project settings → Project ID |
| `POSTHOG_API_KEY` | PostHog → Project settings → **Personal** API keys (starts `phx_`, read-only is fine). The query API rejects *project* keys (`phc_`). `.env` is authoritative — `src/env.ts` loads it with `override: true`, so a stray `phc_` exported in your shell can't shadow it. |
| `SUPABASE_URL` | Supabase → Project settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | Supabase → Project settings → API → service_role key |
| `ANTHROPIC_API_KEY` | console.anthropic.com (required for the Claude provider) |
| `ANTHROPIC_MODEL` | Optional — override the Claude model (default `claude-sonnet-5`) |
| `DEEPSEEK_API_KEY` | platform.deepseek.com — required only when DeepSeek is selected |
| `DEEPSEEK_MODEL` | Optional — override the DeepSeek model (default `deepseek-v4-pro`) |
| `LLM_PROVIDER` | Legacy/Growth only — optional default for the retained rollback pipeline and LLM-backed Growth tools. The Insights cron does not read it. |
| `OPENAI_API_KEY` | platform.openai.com — required for the PM strategist (and if `openai` is selected anywhere) |
| `STRATEGY_MODEL` | Optional — override the strategist model (default `gpt-5.6-terra`) |
| `STRATEGY_PROVIDER` | Optional — default provider for the Strategy Ledger: `openai` (default), `claude`, `deepseek`, or `qwen` |
| `STRATEGY_REASONING_EFFORT` | Optional — GPT-5.6 reasoning spend / cost lever: `minimal`, `low`, `medium` (default), `high`, `xhigh`, or `max` |
| `GOOGLE_APPLICATION_CREDENTIALS` | **Local only** — absolute path to the GA4 service-account JSON, **outside this repo**. Website property only. |
| `GOOGLE_CREDENTIALS_JSON` | **Vercel** — the entire contents of that key JSON (Vercel has no file path). Takes precedence over the path above. |
| `GA4_PROPERTY_ID_WEBSITE` | Numeric GA4 property ID for llmnesia.com (read via the service account) |
| `GA4_PROPERTY_ID_EXTENSION` | Optional — GA4 property ID for the Chrome Web Store listing. Read via OAuth, **not** the service account — see §2b. Leave blank to skip. |
| `GA4_OAUTH_CLIENT_ID` / `GA4_OAUTH_CLIENT_SECRET` / `GA4_OAUTH_REFRESH_TOKEN` | Only for the extension property — see §2b. Leave blank to skip it. |
| `GSC_OAUTH_CLIENT_ID` / `GSC_OAUTH_CLIENT_SECRET` / `GSC_OAUTH_REFRESH_TOKEN` | Google Search Console for the Traffic Growth Planner — see §2c. Leave blank to disable `/growth`. |
| `BING_WEBMASTER_API_KEY` | Optional — Bing Webmaster Tools API key for Bing search data in `/growth`. Get it from Bing WMT → Settings → API Access. Leave blank to skip. |
| `GROWTH_PROVIDER` | Optional — default provider for the `/growth` plan + briefs: `claude` (default), `openai` or `deepseek`. Falls back to `LLM_PROVIDER`. |
| `GIT_REPOS` / `MCP_CONTEXT_URL` | Legacy rollback pipeline only. Agent-driven reviews use the coding agent’s own Git and LLMnesia MCP tools. |
| `REPORTING_TIME_ZONE` | Optional IANA timezone used to decide “today” and the current Monday-to-today window. Defaults to `Asia/Bangkok`. |
| `DASHBOARD_PASSWORD` | Password to view the dashboard once deployed. **Leave blank to disable the gate locally.** |
| `RUN_SECRET` | Shared secret the weekly cron uses to authorise `/api/run` |

### 2b. GA4 extension property (Chrome Web Store) — optional

The website property is read with the service account. The **extension** property
is different: when you "Enable GA4" from the Chrome Web Store dev dashboard,
Google auto-creates a property it administers itself — **a service account can
never be added to it**. It's read as your own Google account via OAuth instead.
Skip this whole section (leave the four extension vars blank) if you don't need
Chrome Web Store install counts or per-version user data.

One-time setup:

1. In the **same Google Cloud project** as the service account:
   - **APIs & Services → OAuth consent screen**: External, then **Publish**
     ("In production"). Leaving it in "Testing" makes the refresh token expire
     after 7 days and the weekly cron will break.
   - **APIs & Services → Credentials → Create OAuth client ID → Desktop app**.
     Copy the Client ID and Client secret.
   - Confirm the **Google Analytics Data API** is enabled.
2. Put `GA4_PROPERTY_ID_EXTENSION`, `GA4_OAUTH_CLIENT_ID`, and
   `GA4_OAUTH_CLIENT_SECRET` in `.env`.
3. Run the consent helper and approve read-only Analytics as the Google account
   that can see the property:

   ```bash
   npx tsx scripts/ga4-oauth-consent.ts
   ```

4. Paste the printed token into `.env` as `GA4_OAUTH_REFRESH_TOKEN`.

This surfaces `ga4.extension.store_installs` (the Chrome Web Store `install`
event — real store installs, distinct from PostHog `extension_installed` which
fires on in-product first run). Note: that property cannot provide uninstalls
(the CWS GA4 integration never emits one) or extension version — version data
comes from PostHog instead (`version_adoption`).

### 2c. Google Search Console (Traffic Growth Planner — `/growth`) — optional

`/growth` reads GSC data via OAuth (a service account would need to be added
to every GSC property manually — OAuth gives access to every property the
signing-in account already owns, which is the multi-site default). Skip this
section if you don't need `/growth`.

One-time setup:

1. In the **same Google Cloud project** as the GA4 OAuth client:
   - **APIs & Services → Library** — enable the **Google Search Console API**.
   - **APIs & Services → Credentials → Create OAuth client ID → Desktop app**.
     You can reuse the GA4 desktop client by re-running consent with the GSC
     scope, or create a separate one — the script just needs *some* client id
     + secret it can drive the consent loop with.
   - The OAuth consent screen must already be **published** ("In production")
     from the GA4 setup (otherwise the refresh token expires in 7 days).
2. Put `GSC_OAUTH_CLIENT_ID` and `GSC_OAUTH_CLIENT_SECRET` in `.env`.
3. Run the consent helper and sign in as the Google account that owns the GSC
   properties for your sites:

   ```bash
   npx tsx scripts/gsc-oauth-consent.ts
   ```

4. Paste the printed token into `.env` as `GSC_OAUTH_REFRESH_TOKEN`.

Then run the migration block in §1b above to create `sites`, `gsc_rows`,
`growth_opportunities`, `growth_plans`, `growth_actions`. Edit the `insert
into public.sites` block in that SQL to match the GSC properties for your
real sites (use `sc-domain:example.com` for Domain properties, or the full
`https://example.com/` URL for URL-prefix properties — match GSC exactly).

### 3. Install & run

```bash
npm install
npm run dev          # dashboard at http://localhost:3000
```

With `DASHBOARD_PASSWORD` blank the dashboard is open (fine for local). Set it before deploying.

## Using the dashboard

- **Main view** — the latest published agent review, Strategy Ledger, findings,
  recommendations, decisions, provenance, source dates, and historical trends.
- **Evidence freshness** and **agent-review freshness** are shown separately so
  a collected-but-not-yet-reviewed period is explicit.
- The dashboard has no review, refresh, or model-selection control. To publish
  the next review, open the repository in Codex or Claude Code and say
  **Run the Insights review.**

## The Traffic Growth Planner (`/growth`)

A multi-site SEO/content planner that answers **"what are the highest-leverage
traffic actions this week?"** It combines Google Search Console (queries,
pages, impressions, clicks, position) with the existing GA4 data and your
prior action history, and proposes a **balanced** weekly plan — not just
"10 new posts".

How it works:

- **Site switcher** — every row in `public.sites` shows up as a pill in the
  page header. The data model is multi-site from day 1; adding a new site is
  just another row.
- **GSC sync** — manual on first run (the **Backfill 90 days** button) and
  then a **Sync latest data** button that refreshes only the latest seven-day
  correction window. No cron
  yet; sync before generating the weekly plan.
- **Opportunity queues** (deterministic — pure rules over the data, no LLM):
  - **Near-wins** — already ranks page 2–3 with real impressions: push to page 1.
  - **High-impression, low-CTR** — page 1 listings that under-click vs benchmark.
  - **Content gaps** — real demand but no page ranks well: new content.
  - **Declining pages** — losing clicks vs the prior 28 days.
  - **Proven traffic expanders** — pages already pulling consistent clicks.
  Each opportunity shows the raw GSC numbers it was built from and a
  transparent 0–100 score — no opaque AI ranking.
- **Weekly plan** — one bounded LLM call (`GROWTH_PROVIDER`, default Claude)
  composes a balanced plan over the top 25 candidates from the persisted weekly
  opportunity snapshot + your project brief + prior plans + in-flight actions.
  Regeneration reuses that snapshot; it does not re-read and rewrite the full
  historical query corpus. The plan declares a one-line thesis, a
  balance object (create / improve / link / fix / distribute / measure), and
  5–10 ranked recommendations — each with action type, target, why,
  expected impact, effort/confidence, source-data line, and the next concrete
  step.
- **Action board** — accepting a recommendation (or an opportunity directly)
  materialises a row in `growth_actions`. The board keeps the workflow simple:
  `planned`, `monitoring` (actioned), `needs_adjustment`, or `ignored`.
  Each card lets you mark the work actioned, paste the published URL, and add
  notes about monitoring results or follow-up adjustments.

Runs entirely on owned data — no paid keyword or SERP APIs needed for v1.
Schema (`sites`, `gsc_rows`, `growth_opportunities`, `growth_plans`,
`growth_actions`) lives in §1b above and must be applied manually before
opening `/growth`.

## Strategy reviews

`/strategy` redirects to the unified dashboard. Reviews are produced by the
coding agent following `INSIGHTS_AGENT.md`, never by a hosted Strategy button.
Each published recommendation keeps its coding handoff plus **Accept / Defer /
Reject / Mark shipped** controls, and historical decisions remain readable.

## Legacy rollback pipeline

The former embedded-LLM pipeline remains temporarily for backfills and
rollback, but is not linked from the dashboard and is not used by cron:

```bash
npm run pipeline                          # current week
npm run pipeline -- --dry-run             # no DB write; prints metrics + analysis
npm run pipeline -- --week=2026-04-20     # backfill a specific Monday
npm run pipeline -- --provider=deepseek   # use DeepSeek instead of Claude (default from LLM_PROVIDER)
```

## Deploying to Vercel

1. Import the repo into Vercel.
2. Add every variable from the table above as a Project Environment Variable. **`GOOGLE_APPLICATION_CREDENTIALS` is a local file path and won't resolve on Vercel** (no `/Users` — the error is `ENOENT … lstat '/Users'`). Instead set **`GOOGLE_CREDENTIALS_JSON`** to the entire contents of the key file; `src/ga4.ts` parses it and uses it inline (it takes precedence over the path). The *extension* property is unaffected — it's OAuth/token-based (`GA4_OAUTH_*`) and works on Vercel as-is. (`.env` override is a no-op there — there's no `.env` file, so the platform env vars stand.)
3. Set `DASHBOARD_PASSWORD` and `RUN_SECRET` (and optionally Vercel's built-in `CRON_SECRET`).
4. Deploy. [vercel.json](vercel.json) registers a daily cron (`07:00 UTC → /api/run`) that refreshes evidence only, and sets the function `maxDuration` to 300s.

> **Timeout note:** source collection can take a few minutes while GSC pages
> through its delta window. No model call occurs in the function.

## How it's wired

- [src/evidence.ts](src/evidence.ts) — analytics collection, delta calculation,
  freshness, and evidence persistence; imports no LLM or strategy module.
- [scripts/insights-prepare.ts](scripts/insights-prepare.ts) — writes the ignored
  local evidence pack and review template.
- [scripts/insights-publish.ts](scripts/insights-publish.ts) — validates and
  idempotently publishes the agent review, ledger patches, and provenance.
- [app/api/run/route.ts](app/api/run/route.ts) — evidence-only manual/cron route.
- [app/page.tsx](app/page.tsx) — the dashboard. [lib/dashboard.ts](lib/dashboard.ts) reads Supabase once and flattens metrics for charts.
- [middleware.ts](middleware.ts) + [app/login](app/login) — the password gate (no-op when `DASHBOARD_PASSWORD` is unset).

## Adding new metrics

1. Add a query function in [src/posthog.ts](src/posthog.ts)
2. Call it inside `collectMetrics`
3. Add the field to `MetricsSnapshot` in [src/types.ts](src/types.ts)
4. Surface it in [app/page.tsx](app/page.tsx) and/or as a chart in [lib/dashboard.ts](lib/dashboard.ts) + [components/TrendCharts.tsx](components/TrendCharts.tsx)
