# LLMnesia insights

Weekly metrics digest for LLMnesia. Runs every Monday 07:00 UTC via GitHub Actions: pulls PostHog data, runs it through Claude, stores analysis in Supabase, emails a digest.

## Setup

### 1. Supabase schema

Run this in your Supabase SQL editor:

```sql
create table public.weekly_insights (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  week_end date not null,
  metrics_snapshot jsonb not null,
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

### 2. Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable | Where to find it |
|---|---|
| `POSTHOG_PROJECT_ID` | PostHog → Project settings → Project ID |
| `POSTHOG_API_KEY` | PostHog → Project settings → Personal API keys (read-only scope is fine) |
| `SUPABASE_URL` | Supabase → Project settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | Supabase → Project settings → API → service_role key |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `RESEND_API_KEY` | resend.com → API keys |
| `RESEND_FROM_EMAIL` | A sender address on your verified Resend domain, e.g. `insights@yourdomain.com` |

### 3. Install dependencies

```bash
npm install
```

## Local run

```bash
# Full run for the current week
npm run dev

# Dry run — prints metrics and analysis, skips Supabase write and email
npm run dev -- --dry-run

# Backfill a specific week (pass the Monday date)
npm run dev -- --week=2026-04-20

# Combine both
npm run dev -- --dry-run --week=2026-04-20
```

## GitHub Actions

Add the six secrets above to your repo (Settings → Secrets and variables → Actions). The workflow runs automatically every Monday at 07:00 UTC. You can also trigger it manually from the Actions tab via `workflow_dispatch`.

## Manual trigger via CLI

```bash
gh workflow run weekly.yml
```

## Iterating on the analysis prompt

The system prompt and user prompt template live in [src/prompts/analysis-prompt.ts](src/prompts/analysis-prompt.ts). Edit `SYSTEM_PROMPT` to change the analyst's framing, or `RESPONSE_SCHEMA` to add new output fields (also update `AnalysisResult` in [src/types.ts](src/types.ts) and the email template in [src/email.ts](src/email.ts)).

Use `--dry-run` to test prompt changes without writing to Supabase or sending email.

## Adding new metrics

1. Add a query function in [src/posthog.ts](src/posthog.ts)
2. Call it inside `collectMetrics` (parallel with the existing calls)
3. Add the field to `MetricsSnapshot` in [src/types.ts](src/types.ts)
4. Add it to the email summary in [src/email.ts](src/email.ts)

## Future event capture (not yet in PostHog)

These additions would unlock more precise analytics:

- **`search_id`** on both `search_performed` and `result_opened` — enables true per-search CTR instead of aggregate ratio
- **Hashed or sampled query string** on `search_performed` — enables search theme analysis
- **Install source** on `extension_installed` — `referrer`, `OnInstalledReason`, UTM params — enables channel attribution

## Out of scope (v1)

- Uninstall rate (tracked in Chrome Web Store dashboard, manual)
- Source breakdown on installs (not yet captured in events)
- Search query themes (query strings not captured)
- Slack delivery
- Dashboard UI
