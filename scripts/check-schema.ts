/**
 * Guards against Supabase schema drift. This repo has no migration files — the
 * schema is hand-applied in the dashboard — so a column added in TypeScript
 * lives only in code until someone runs the DDL. When they forget, the app
 * throws "Could not find the 'X' column ... in the schema cache" at runtime,
 * often long after the code shipped (a write-only column like
 * `standing_caveats.updated_at` only fails on the first edit).
 *
 * This script is the source of truth for the columns the code depends on. It
 * probes each one against the live DB and prints a ready-to-run ALTER for any
 * that are missing. Exits non-zero if anything is missing, so it can gate a
 * deploy.
 *
 * Usage:  npx tsx scripts/check-schema.ts   (or: npm run check-schema)
 *
 * When you add a column in code, add it here too.
 */
import '../src/env.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { auth: { persistSession: false } },
);

/**
 * Expected columns per table, with the Postgres type used in the suggested
 * ALTER. Keep this in sync with src/types.ts and the reads/writes in
 * src/supabase.ts. `nullable: false` columns get a `default` so the ALTER is
 * safe to run against a table that already has rows.
 */
interface Col {
  name: string;
  type: string;
  /** Appended verbatim to the ALTER (e.g. "not null default '{}'::jsonb"). */
  constraint?: string;
}

const SCHEMA: Record<string, Col[]> = {
  weekly_insights: [
    { name: 'id', type: 'uuid' },
    { name: 'week_start', type: 'date' },
    { name: 'week_end', type: 'date' },
    { name: 'metrics_snapshot', type: 'jsonb' },
    { name: 'headline', type: 'text' },
    { name: 'summary', type: 'text' },
    { name: 'findings', type: 'jsonb' },
    { name: 'action_items', type: 'jsonb' },
    { name: 'open_threads', type: 'jsonb' },
    { name: 'resolved_threads', type: 'jsonb' },
    { name: 'corrections', type: 'jsonb' },
    { name: 'revisions', type: 'jsonb' },
    { name: 'chat', type: 'jsonb' },
    { name: 'strategy', type: 'jsonb' },
    { name: 'strategy_goal', type: 'text' },
    { name: 'strategy_decisions', type: 'jsonb' },
    { name: 'strategy_chat', type: 'jsonb' },
    { name: 'strategy_recommendation_chats', type: 'jsonb', constraint: "not null default '{}'::jsonb" },
    { name: 'model_used', type: 'text' },
    { name: 'created_at', type: 'timestamptz' },
  ],
  standing_caveats: [
    { name: 'id', type: 'uuid' },
    { name: 'created_at', type: 'timestamptz' },
    { name: 'updated_at', type: 'timestamptz' },
    { name: 'kind', type: 'text' },
    { name: 'affected_metric', type: 'text' },
    { name: 'note', type: 'text' },
    { name: 'active', type: 'boolean' },
  ],
};

/** True if the error is PostgREST's "column does not exist" signal. */
function isMissingColumn(error: { code?: string; message?: string }): boolean {
  // 42703 = undefined_column; schema-cache misses phrase it differently.
  return (
    error.code === '42703' ||
    /column .* does not exist/i.test(error.message ?? '') ||
    /could not find the '.*' column/i.test(error.message ?? '')
  );
}

async function columnExists(table: string, column: string): Promise<boolean> {
  // limit(1), no head: we only care whether selecting the column errors, but a
  // HEAD request returns the error in headers only (empty body/code), so we ask
  // for the body — that's where PostgREST puts the 42703 "column does not exist".
  const { error } = await supabase.from(table).select(column).limit(1);
  if (!error) return true;
  if (isMissingColumn(error)) return false;
  // A different error (missing table, bad auth, RLS) — surface it, don't mask it.
  throw new Error(`Probing ${table}.${column} failed: ${error.message}`);
}

async function main() {
  const missing: { table: string; col: Col }[] = [];

  for (const [table, cols] of Object.entries(SCHEMA)) {
    for (const col of cols) {
      if (!(await columnExists(table, col.name))) missing.push({ table, col });
    }
  }

  if (missing.length === 0) {
    console.log('✓ Schema OK — every expected column exists.');
    return;
  }

  console.error(`✗ ${missing.length} missing column(s):\n`);
  for (const { table, col } of missing) {
    const constraint = col.constraint ? ` ${col.constraint}` : '';
    console.error(
      `  ${table}.${col.name}\n` +
        `    alter table ${table} add column if not exists ${col.name} ${col.type}${constraint};\n`,
    );
  }
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
