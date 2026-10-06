import '../src/env.js';

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getClient } from '../src/db/query.js';

/**
 * One-off migration: load `data/supabase-dump/*.json` (written by
 * scripts/dump-supabase.ts) into the local SQLite database. Each table is
 * wiped and reloaded, so the script is idempotent — but it REPLACES local
 * rows, so don't run it after you've written new data locally.
 *
 *   1. Restore the Supabase project (if paused) and run:
 *        node --import tsx scripts/dump-supabase.ts
 *   2. Then:
 *        node --import tsx scripts/import-sqlite.ts
 */
const DUMP_DIR = resolve(process.cwd(), 'data', 'supabase-dump');

/** Import order satisfies foreign keys (sites first). */
const TABLES = [
  'sites',
  'gsc_rows',
  'bing_rows',
  'growth_opportunities',
  'growth_plans',
  'growth_actions',
  'weekly_insights',
  'standing_caveats',
  'strategy_ledger',
  'evidence_deltas',
  'ledger_entries',
  'context_sources',
  'source_snapshots',
  'source_sync_state',
] as const;

async function main() {
  const db = getClient();
  const summary: { table: string; imported: number }[] = [];
  let total = 0;

  for (const table of TABLES) {
    const path = resolve(DUMP_DIR, `${table}.json`);
    let rows: Record<string, unknown>[];
    try {
      rows = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>[];
    } catch {
      throw new Error(
        `Missing or unreadable ${path}. Run scripts/dump-supabase.ts first (the Supabase project must be restored if paused).`,
      );
    }
    if (!Array.isArray(rows)) throw new Error(`${path} does not contain a JSON array.`);

    const wipe = await db.from(table).delete();
    if (wipe.error) throw new Error(`${table} wipe failed: ${wipe.error.message}`);

    if (rows.length) {
      // The dump's jsonb columns arrive as parsed objects and booleans as
      // true/false; the query facade re-encodes both for SQLite, so insert
      // through it rather than raw SQL.
      const insert = await db.from(table).insert(rows);
      if (insert.error) throw new Error(`${table} import failed: ${insert.error.message}`);
    }

    const check = await db.from(table).select('*', { count: 'exact', head: true });
    const imported = check.count ?? 0;
    if (imported !== rows.length) {
      throw new Error(`${table}: imported ${imported} rows but the dump has ${rows.length}.`);
    }
    summary.push({ table, imported });
    total += imported;
  }

  for (const { table, imported } of summary) console.log(`  ${table}: ${imported} rows`);
  console.log(`\nDone. ${total} rows imported.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
