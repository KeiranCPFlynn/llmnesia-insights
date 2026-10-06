/**
 * Print the location and per-table row counts of the local database — a quick
 * health check after a migration import or before a review run.
 *
 *   npx tsx scripts/db-status.ts
 */
import '../src/env.js';
import { resolveDbPath } from '../src/db/client.js';
import { getDb } from '../src/db/client.js';

const TABLES = [
  'weekly_insights',
  'standing_caveats',
  'strategy_ledger',
  'evidence_deltas',
  'ledger_entries',
  'context_sources',
  'source_sync_state',
  'source_snapshots',
  'sites',
  'gsc_rows',
  'bing_rows',
  'growth_opportunities',
  'growth_plans',
  'growth_actions',
];

const db = getDb();
console.log(`database: ${resolveDbPath()}\n`);
let total = 0;
for (const table of TABLES) {
  const { c } = db.prepare(`SELECT count(*) AS c FROM "${table}"`).get() as { c: number };
  total += c;
  console.log(`  ${table.padEnd(22)} ${c}`);
}
console.log(`\n  ${total} rows total`);
