import '../src/env.js';

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * One-off migration helper: dump every table from the Supabase Data API into
 * `data/supabase-dump/<table>.json` as a backup and as the import source for
 * the local SQLite database. Uses plain fetch (no supabase-js dependency) and
 * Range-header pagination. Safe to re-run: each run overwrites the dump.
 */
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
] as const;

const PAGE_SIZE = 1000;
const OUT_DIR = resolve(process.cwd(), 'data', 'supabase-dump');

async function fetchPage(table: string, offset: number) {
  const url = new URL(`${process.env.SUPABASE_URL}/rest/v1/${table}`);
  url.searchParams.set('select', '*');
  const res = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      Prefer: 'count=exact',
      Range: `${offset}-${offset + PAGE_SIZE - 1}`,
    },
  });
  return res;
}

function isMissingTable(res: Response, body: string): boolean {
  // PGRST205 = "Could not find the table" (never created on this project).
  return res.status === 404 || /PGRST205|relation .* does not exist|could not find the table/i.test(body);
}

async function dumpTable(table: string): Promise<unknown[]> {
  const rows: unknown[] = [];
  let offset = 0;
  for (;;) {
    const res = await fetchPage(table, offset);
    if (!res.ok) {
      const body = await res.text();
      if (rows.length === 0 && isMissingTable(res, body)) {
        console.log(`  ${table}: table does not exist — recording as empty`);
        return [];
      }
      throw new Error(
        `${table}: HTTP ${res.status} — ${body.slice(0, 300)}` +
          (res.status === 540 || /paused/i.test(body)
            ? '\nThe Supabase project appears to be PAUSED. Restore it in the Supabase dashboard (Settings → Infrastructure) and re-run.'
            : ''),
      );
    }
    const page = (await res.json()) as unknown[];
    rows.push(...page);
    const contentRange = res.headers.get('content-range'); // e.g. "0-999/4321"
    const total = contentRange ? Number(contentRange.split('/')[1]) : rows.length;
    if (page.length < PAGE_SIZE || (Number.isFinite(total) && rows.length >= total)) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required in .env');
  }
  await mkdir(OUT_DIR, { recursive: true });
  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    const rows = await dumpTable(table);
    await writeFile(resolve(OUT_DIR, `${table}.json`), JSON.stringify(rows, null, 2));
    counts[table] = rows.length;
    console.log(`  ${table}: ${rows.length} rows`);
  }
  await writeFile(resolve(OUT_DIR, 'manifest.json'), JSON.stringify({ dumpedAt: new Date().toISOString(), counts }, null, 2));
  console.log(`\nDone. Dump written to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
