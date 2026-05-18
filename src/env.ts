import { config } from 'dotenv';

/**
 * `.env` is authoritative for the pipeline.
 *
 * Neither dotenv nor Next.js override variables already present in the process
 * environment. A stray PostHog *project* key (`phc_…`) exported in the dev
 * shell — natural to have around, since the sibling extension uses it for
 * ingestion — otherwise shadows the correct *personal* key (`phx_…`) in
 * `.env`, and the PostHog query API rejects project keys with a 403.
 *
 * `override: true` makes `.env` win locally regardless of the ambient
 * environment. On Vercel there is no `.env` file, so this is a no-op and the
 * platform-configured env vars stand.
 *
 * Import this module (for its side effect) before any code reads
 * `process.env`. It must be imported by every entry point — the CLI
 * (`src/index.ts`) and the Next pipeline modules (`posthog.ts`, `ga4.ts`),
 * since the dashboard/cron route imports `runPipeline` directly and never
 * goes through the CLI.
 */
config({ override: true });
