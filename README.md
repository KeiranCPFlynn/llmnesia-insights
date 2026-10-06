# LLMnesia Insights

A self-hosted evidence store, durable Strategy Ledger, and read-oriented
dashboard for LLMnesia. PostHog, GA4, Google Search Console, and Bing evidence
is collected without an analysis-model call. Codex or Claude Code researches
the code and prior decisions, reasons over the prepared evidence, and publishes
a validated review to the local database.

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

### 1. Local database (automatic)

The app runs on a single local SQLite database file — no server, no cloud
account, nothing to pause. The file and its full schema are created
automatically on first use:

- Default location: `data/insights.db` (gitignored). Back it up with Time
  Machine or by copying the file; it is the only state the app keeps.
- Set `INSIGHTS_DB_PATH` in `.env` to relocate it.
- Schema source of truth: [`src/db/ddl.ts`](src/db/ddl.ts). Adding a table or
  column means editing that file; it is applied on every startup, so code and
  schema cannot drift apart.

**Migrating from the old Supabase project** (wipe-and-reload per table, safe
to re-run, but do not run it after writing new local data):

```bash
# 1. Restore the Supabase project in its dashboard if it is paused, then:
npm run db:dump-supabase      # writes data/supabase-dump/*.json
# 2. Load the dump into the local database:
npm run db:import-sqlite
```

**Fresh start** (no Supabase data to import): seed the site row the Growth
Planner needs, then initialise the Strategy Ledger:

```bash
npx tsx scripts/seed-sites.ts
npm run seed-ledger
```

`seed-ledger` uses the newest legacy strategy and metrics snapshot as a
starting point and leaves an existing ledger untouched.

The Supabase-era `npm run check-schema` is gone: the schema is created by
code, so it can never silently drift.

The `/growth` tables (sites, gsc_rows, bing_rows, growth_opportunities,
growth_plans, growth_actions) live in the same database and are created
together with the rest. Sites are rows in `sites` (not code) — add another
site by inserting a row (`npx tsx scripts/seed-sites.ts` shows the shape).

### 2. Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable | Where to find it |
|---|---|
| `POSTHOG_PROJECT_ID` | PostHog → Project settings → Project ID |
| `POSTHOG_API_KEY` | PostHog → Project settings → **Personal** API keys (starts `phx_`, read-only is fine). The query API rejects *project* keys (`phc_`). `.env` is authoritative — `src/env.ts` loads it with `override: true`, so a stray `phc_` exported in your shell can't shadow it. |
| `INSIGHTS_DB_PATH` | Optional — path of the SQLite database file. Defaults to `data/insights.db`, created automatically. |
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
- [app/page.tsx](app/page.tsx) — the dashboard. [lib/dashboard.ts](lib/dashboard.ts) reads the database once and flattens metrics for charts.
- [middleware.ts](middleware.ts) + [app/login](app/login) — the password gate (no-op when `DASHBOARD_PASSWORD` is unset).

## Adding new metrics

1. Add a query function in [src/posthog.ts](src/posthog.ts)
2. Call it inside `collectMetrics`
3. Add the field to `MetricsSnapshot` in [src/types.ts](src/types.ts)
4. Surface it in [app/page.tsx](app/page.tsx) and/or as a chart in [lib/dashboard.ts](lib/dashboard.ts) + [components/TrendCharts.tsx](components/TrendCharts.tsx)
