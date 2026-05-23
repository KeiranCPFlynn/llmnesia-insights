# LLMnesia Insights

A self-hosted dashboard for LLMnesia product metrics. It pulls PostHog + GA4 data, runs it through Claude for analysis, stores the result in Supabase, and presents it as a simple weekly dashboard — summary, findings, recommended actions, and trend charts. Replaces the old weekly email entirely.

The pipeline runs on demand from a button in the dashboard, and automatically once a week via Vercel Cron.

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
> alter table public.weekly_insights add column if not exists strategy_decisions jsonb not null default '[]';
> alter table public.weekly_insights add column if not exists strategy_chat jsonb not null default '[]';
> ```

### 1b. Traffic Growth Planner schema (`/growth`)

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
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (gsc_property)
);

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
insert into public.sites (name, root_url, gsc_property, sitemap_url) values
  ('LLMnesia',   'https://llmnesia.com',   'sc-domain:llmnesia.com',   'https://llmnesia.com/sitemap.xml'),
  ('LunaCradle', 'https://lunacradle.com', 'sc-domain:lunacradle.com', 'https://lunacradle.com/sitemap.xml')
on conflict (gsc_property) do nothing;
```

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
| `ANTHROPIC_MODEL` | Optional — override the Claude model (default `claude-sonnet-4-6`) |
| `DEEPSEEK_API_KEY` | platform.deepseek.com — required only when DeepSeek is selected |
| `DEEPSEEK_MODEL` | Optional — override the DeepSeek model (default `deepseek-v4-pro`) |
| `LLM_PROVIDER` | Optional — default provider when none is chosen in the UI: `claude` (default), `deepseek` or `openai`. The Vercel Cron run uses this. |
| `OPENAI_API_KEY` | platform.openai.com — required for the PM strategist (and if `openai` is selected anywhere) |
| `STRATEGY_MODEL` | Optional — override the strategist model (default `gpt-5.5`) |
| `STRATEGY_PROVIDER` | Optional — default provider for the `/strategy` PM: `openai` (default), `claude` or `deepseek` |
| `STRATEGY_REASONING_EFFORT` | Optional — GPT-5.x reasoning spend / cost lever: `minimal`, `low`, `medium` (default), `high` |
| `GOOGLE_APPLICATION_CREDENTIALS` | **Local only** — absolute path to the GA4 service-account JSON, **outside this repo**. Website property only. |
| `GOOGLE_CREDENTIALS_JSON` | **Vercel** — the entire contents of that key JSON (Vercel has no file path). Takes precedence over the path above. |
| `GA4_PROPERTY_ID_WEBSITE` | Numeric GA4 property ID for llmnesia.com (read via the service account) |
| `GA4_PROPERTY_ID_EXTENSION` | Optional — GA4 property ID for the Chrome Web Store listing. Read via OAuth, **not** the service account — see §2b. Leave blank to skip. |
| `GA4_OAUTH_CLIENT_ID` / `GA4_OAUTH_CLIENT_SECRET` / `GA4_OAUTH_REFRESH_TOKEN` | Only for the extension property — see §2b. Leave blank to skip it. |
| `GSC_OAUTH_CLIENT_ID` / `GSC_OAUTH_CLIENT_SECRET` / `GSC_OAUTH_REFRESH_TOKEN` | Google Search Console for the Traffic Growth Planner — see §2c. Leave blank to disable `/growth`. |
| `GROWTH_PROVIDER` | Optional — default provider for the `/growth` plan + briefs: `claude` (default), `openai` or `deepseek`. Falls back to `LLM_PROVIDER`. |
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

- **Main view** — the most recent week's summary, key stats (with week-over-week deltas), findings (colour-coded by severity), recommended actions (by priority), and trend charts across every tracked week.
- **Week selector** — top right, jump to any past week.
- **Run analysis now** — runs the full pipeline for the current week and refreshes. Takes ~1 minute (PostHog + GA4 + the selected LLM).
- **Model selector** — next to "Run analysis now" and in the chat panel: choose **Claude** or **DeepSeek**. The choice is remembered in your browser and controls the weekly run, the chat, and report regeneration after a correction. The weekly Vercel Cron run uses the `LLM_PROVIDER` env default.

## The Traffic Growth Planner (`/growth`)

A multi-site SEO/content planner that answers **"what are the highest-leverage
traffic actions this week?"** It combines Google Search Console (queries,
pages, impressions, clicks, position) with the existing GA4 data and your
prior action history, and proposes a **balanced** weekly plan — not just
"10 new posts".

How it works:

- **Site switcher** — every row in `public.sites` shows up as a pill in the
  page header. The data model is multi-site from day 1; adding LunaCradle or
  any other property is just another row.
- **GSC sync** — manual on first run (the **Backfill 16 months** button) and
  then a **Sync last 7 days** button to catch up the rolling window. No cron
  yet; sync before generating the weekly plan.
- **Opportunity queues** (deterministic — pure rules over the data, no LLM):
  - **Near-wins** — already ranks page 2–3 with real impressions: push to page 1.
  - **High-impression, low-CTR** — page 1 listings that under-click vs benchmark.
  - **Content gaps** — real demand but no page ranks well: new content.
  - **Declining pages** — losing clicks vs the prior 28 days.
  - **Proven traffic expanders** — pages already pulling consistent clicks.
  Each opportunity shows the raw GSC numbers it was built from and a
  transparent 0–100 score — no opaque AI ranking.
- **Weekly plan** — one LLM call (`GROWTH_PROVIDER`, default Claude) composes
  a balanced plan over the top 25 ranked opportunities + your project brief
  + prior plans + in-flight actions. The plan declares a one-line thesis, a
  balance object (create / improve / link / fix / distribute / measure), and
  5–10 ranked recommendations — each with action type, target, why,
  expected impact, effort/confidence, source-data line, and the next concrete
  step.
- **Action board** — accepting a recommendation (or an opportunity directly)
  materialises a row in `growth_actions` with a status workflow:
  `idea → planned → briefed → drafted → published → updated → monitoring →
  completed` (plus `ignored`). Each card lets you set status, paste the
  published URL, add notes, and click **Generate brief** for a tight,
  decision-ready content brief.

Runs entirely on owned data — no paid keyword or SERP APIs needed for v1.
Schema (`sites`, `gsc_rows`, `growth_opportunities`, `growth_plans`,
`growth_actions`) lives in §1b above and must be applied manually before
opening `/growth`.

## The Strategy page (`/strategy`)

A separate, week-aware page (header tab, or the "Strategy" link on the dashboard) where a PM/revenue strategist (GPT-5.5 by default) turns the week's analysis into a money-making plan. It is **on-demand** (not in the weekly cron) and never edits code itself.

- **Generate PM strategy** — reads `PROJECT_BRIEF.md` + the week's analysis/metrics + prior theses + your past decisions, and proposes a revenue thesis, a monetization model, and ranked recommendations. Reasoning model — takes a few minutes (progress bar shown).
- **Each recommendation** carries a one-click **Copy coding-agent prompt** (paste straight into Claude Code / Codex with the named repo open) and/or a founder step checklist, plus **Accept / Defer / Reject / Mark shipped** (+ note). Decisions persist and feed the *next* strategy so it stops re-pitching rejected items and tracks what shipped.
- **Discuss the strategy** — a chat (like the analytics one) to refine: ask for a cheaper price, different gating, a fresh handoff prompt, or a new idea; "Apply" splices a revision into the saved strategy.
- **`PROJECT_BRIEF.md`** (repo root) is the only thing you hand-maintain — keep product/positioning/pricing current; the strategist reads it verbatim each run.
- Requires the `strategy*` columns (see migration) and `OPENAI_API_KEY`.

## Running the pipeline from the CLI

The pipeline is still available headless (used for backfills):

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
4. Deploy. [vercel.json](vercel.json) registers a weekly cron (`Mon 07:00 UTC → /api/run`) and sets the function `maxDuration` to 300s.

> **Timeout note:** the pipeline takes ~30–90s. `maxDuration: 300` requires a Vercel plan that allows it (Pro). On Hobby the limit is lower (~60s) — usually still enough, but tight. If runs time out, trigger via the CLI instead.

## How it's wired

- [src/pipeline.ts](src/pipeline.ts) — `runPipeline()`: collect → analyse → save. Shared by the CLI and the API route.
- [app/api/run/route.ts](app/api/run/route.ts) — `POST` (button, cookie-auth) and `GET` (cron, `RUN_SECRET`/`CRON_SECRET` bearer).
- [app/page.tsx](app/page.tsx) — the dashboard. [lib/dashboard.ts](lib/dashboard.ts) reads Supabase once and flattens metrics for charts.
- [middleware.ts](middleware.ts) + [app/login](app/login) — the password gate (no-op when `DASHBOARD_PASSWORD` is unset).

## Iterating on the analysis prompt

The system prompt lives in [src/prompts/analysis-prompt.ts](src/prompts/analysis-prompt.ts). To add output fields, update it, the `submit_analysis` tool schema in [src/analyse.ts](src/analyse.ts), `AnalysisResult` in [src/types.ts](src/types.ts), and surface the field in [app/page.tsx](app/page.tsx). Use `npm run pipeline -- --dry-run` to test without writing.

## Adding new metrics

1. Add a query function in [src/posthog.ts](src/posthog.ts)
2. Call it inside `collectMetrics`
3. Add the field to `MetricsSnapshot` in [src/types.ts](src/types.ts)
4. Surface it in [app/page.tsx](app/page.tsx) and/or as a chart in [lib/dashboard.ts](lib/dashboard.ts) + [components/TrendCharts.tsx](components/TrendCharts.tsx)
