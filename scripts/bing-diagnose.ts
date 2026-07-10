/**
 * One-off diagnostic for the Growth Planner. Prints the state of the `sites`
 * and `bing_rows` tables, then probes Bing Webmaster Tools directly for each
 * site to confirm the API key + site URL actually work — and cross-checks
 * `GetQueryStats` (per-query, used for bing_rows) against
 * `GetRankAndTrafficStats` (site-level totals) since the two disagree by an
 * order of magnitude (see getAccurateBingTotals in src/bing.ts).
 *
 * Usage:  npx tsx scripts/bing-diagnose.ts
 */
import '../src/env.js';
import { createClient } from '@supabase/supabase-js';

const BING_API_BASE = 'https://ssl.bing.com/webmaster/api.svc/json';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { auth: { persistSession: false } },
);

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseWcfDate(raw: string): string {
  const match = /\/Date\((\d+)(?:[+-]\d{4})?\)\//.exec(raw);
  return match ? new Date(parseInt(match[1], 10)).toISOString().slice(0, 10) : raw;
}

async function main() {
  // 1. Sites
  const { data: sites, error: sErr } = await supabase
    .from('sites')
    .select('*')
    .order('created_at', { ascending: true });
  if (sErr) {
    console.error('sites query failed', sErr.message);
    process.exit(1);
  }
  console.log(`Sites in DB (${sites?.length ?? 0}):`);
  for (const s of sites ?? []) {
    console.log(`  ${s.name}  id=${s.id}  bing_site_url="${s.bing_site_url ?? s.root_url}"  enabled=${s.enabled}`);
  }
  console.log();

  // 2. bing_rows count per site
  for (const s of sites ?? []) {
    const { count, error } = await supabase
      .from('bing_rows')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', s.id);
    console.log(`bing_rows for ${s.name}: ${error ? `ERR ${error.message}` : `${count ?? 0} rows`}`);
  }
  console.log();

  // 3. What sites does this API key actually have registered in Bing?
  const apiKey = process.env.BING_WEBMASTER_API_KEY;
  if (!apiKey) {
    console.error('BING_WEBMASTER_API_KEY not set — skipping live API probes');
    return;
  }
  try {
    const res = await fetch(`${BING_API_BASE}/GetUserSites?${new URLSearchParams({ apikey: apiKey })}`);
    const json: any = await res.json();
    console.log('Bing sites this API key can see:');
    for (const s of json?.d ?? []) console.log(`  "${s.Url}"  verified=${s.IsVerified}`);
    console.log();
  } catch (e) {
    console.error('Could not list Bing sites:', (e as Error).message);
  }

  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 89);
  const startIso = isoDate(start);
  const endIso = isoDate(end);

  // 4. Probe both endpoints for each site over the last 90 days.
  for (const s of sites ?? []) {
    const siteUrl = s.bing_site_url ?? s.root_url;
    console.log(`Probing Bing for ${s.name} → "${siteUrl}" (${startIso} → ${endIso})`);
    const params = new URLSearchParams({ apikey: apiKey, siteUrl });

    try {
      const res = await fetch(`${BING_API_BASE}/GetQueryStats?${params}`);
      const json: any = await res.json();
      const rows: any[] = Array.isArray(json?.d) ? json.d : (json?.d?.QueryStats ?? []);
      const inWindow = rows.filter((r) => r.Date && parseWcfDate(r.Date) >= startIso && parseWcfDate(r.Date) <= endIso);
      const impressions = inWindow.reduce((sum, r) => sum + (r.Impressions ?? 0), 0);
      const clicks = inWindow.reduce((sum, r) => sum + (r.Clicks ?? 0), 0);
      console.log(`  GetQueryStats (per-query, → bing_rows): ${clicks} clicks / ${impressions} impressions across ${inWindow.length} rows`);
    } catch (e) {
      console.error(`  GetQueryStats call failed: ${(e as Error).message}`);
    }

    try {
      const res = await fetch(`${BING_API_BASE}/GetRankAndTrafficStats?${params}`);
      const json: any = await res.json();
      const rows: any[] = Array.isArray(json?.d) ? json.d : (json?.d?.RankAndTrafficStats ?? []);
      const inWindow = rows.filter((r) => r.Date && parseWcfDate(r.Date) >= startIso && parseWcfDate(r.Date) <= endIso);
      const impressions = inWindow.reduce((sum, r) => sum + (r.Impressions ?? 0), 0);
      const clicks = inWindow.reduce((sum, r) => sum + (r.Clicks ?? 0), 0);
      console.log(`  GetRankAndTrafficStats (site-level, matches dashboard): ${clicks} clicks / ${impressions} impressions across ${inWindow.length} rows`);
    } catch (e) {
      console.error(`  GetRankAndTrafficStats call failed: ${(e as Error).message}`);
    }
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
