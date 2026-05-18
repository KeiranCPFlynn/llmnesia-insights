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
| `GOOGLE_APPLICATION_CREDENTIALS` | Absolute path to the GA4 service-account JSON, **outside this repo**. Used for the **website** property only. |
| `GA4_PROPERTY_ID_WEBSITE` | Numeric GA4 property ID for llmnesia.com (read via the service account) |
| `GA4_PROPERTY_ID_EXTENSION` | Optional — GA4 property ID for the Chrome Web Store listing. Read via OAuth, **not** the service account — see §2b. Leave blank to skip. |
| `GA4_OAUTH_CLIENT_ID` / `GA4_OAUTH_CLIENT_SECRET` / `GA4_OAUTH_REFRESH_TOKEN` | Only for the extension property — see §2b. Leave blank to skip it. |
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
2. Add every variable from the table above as a Project Environment Variable. **`GOOGLE_APPLICATION_CREDENTIALS` won't work as a file path on Vercel** — so the *website* GA4 property needs the credentials supplied another way (e.g. switch `src/ga4.ts` to read a `GOOGLE_CREDENTIALS_JSON` env var) or it's skipped in the hosted run. The *extension* property is unaffected: it's OAuth/token-based (`GA4_OAUTH_*`), so it works on Vercel as-is. (`.env` override is a no-op there — there's no `.env` file, so the platform env vars stand.)
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
