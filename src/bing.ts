import './env.js';
import { createClient } from '@supabase/supabase-js';
import type { BingRow, Site } from './types.js';

/**
 * Bing Webmaster Tools (`GetKeywordStats`) sync for the Growth Planner.
 *
 * Auth is a plain API key (set BING_WEBMASTER_API_KEY in env). Get it from
 * Bing Webmaster Tools → Settings → API Access → API Key.
 *
 * Storage: rows are upserted into `public.bing_rows` keyed by
 * (site_id, query, date, country). Each API call covers a ~30-day chunk;
 * rows whose `date` comes from the API response are per-day; if the API
 * returns aggregate-only rows (no Date field) the chunk's startDate is used.
 *
 * The siteUrl sent to Bing must match exactly the URL registered in Bing
 * Webmaster Tools (usually the root URL with or without trailing slash).
 * Use `sites.bing_site_url` to override when it differs from `root_url`.
 */

const BING_API_BASE = 'https://ssl.bing.com/webmaster/api.svc/json';

function getApiKey(): string {
  const key = process.env.BING_WEBMASTER_API_KEY;
  if (!key) throw new Error('BING_WEBMASTER_API_KEY is not set');
  return key;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  return createClient(url, key, { auth: { persistSession: false } });
}

// WCF date format from Bing: /Date(1625097600000)/ or with a timezone offset
// suffix, /Date(1777618800000-0700)/ — GetQueryStats returns the latter, and
// the offset broke the old regex (it required `)` right after the digits),
// silently falling through to `return raw`, so every row's `date` field was
// the literal unparsed string and never matched any calendar-date comparison.
function parseWcfDate(raw: string): string {
  const match = /\/Date\((\d+)(?:[+-]\d{4})?\)\//.exec(raw);
  if (match) return new Date(parseInt(match[1], 10)).toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return raw;
}

interface BingApiRow {
  Query?: string;
  Impressions?: number;
  Clicks?: number;
  AvgClickPosition?: number;
  AvgImpressionPosition?: number;
  Date?: string;
}

/**
 * `GetQueryStats` — the site-wide query traffic endpoint (Bing's analogue of
 * GSC's searchAnalytics). Takes only `apikey` + `siteUrl`; there is no date
 * range parameter — it returns the site's full history in weekly buckets, so
 * callers filter to the desired window client-side.
 *
 * (Earlier code called `GetKeywordStats` with `startDate`/`endDate`/`country`/
 * `language` params — that endpoint is actually for looking up history for a
 * single keyword via a required `q` param, and silently 400s with a generic
 * null-reference error when called without one. `GetQueryStats`'s response
 * shape is what this file's parsing already expects.)
 */
async function fetchQueryStats(apiKey: string, siteUrl: string): Promise<BingApiRow[]> {
  const params = new URLSearchParams({ apikey: apiKey, siteUrl });
  const res = await fetch(`${BING_API_BASE}/GetQueryStats?${params}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Bing API ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json() as { d?: BingApiRow[] | { QueryStats?: BingApiRow[] } };
  // Bing returns either { d: [...] } or { d: { QueryStats: [...] } }
  const d = json?.d;
  if (Array.isArray(d)) return d;
  if (d && 'QueryStats' in d) return (d as { QueryStats?: BingApiRow[] }).QueryStats ?? [];
  return [];
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export async function syncSite(
  site: Site,
  range: { startDate: string; endDate: string },
  log: (msg: string) => void = (m) => console.log(m),
): Promise<number> {
  const apiKey = getApiKey();
  const supabase = getSupabase();
  const siteUrl = site.bing_site_url ?? site.root_url;

  log(`[bing:${site.name}] syncing ${range.startDate} → ${range.endDate} (${siteUrl})`);

  // GetQueryStats has no date-range parameter — it returns the site's full
  // history in one call. Fetch once, then keep only rows inside the
  // requested window before upserting.
  const apiRows = await fetchQueryStats(apiKey, siteUrl);
  const syncedAt = new Date().toISOString();
  const rows: BingRow[] = apiRows
    .filter((r) => r.Query && r.Date)
    .map((r) => ({
      site_id: site.id,
      query: r.Query!,
      date: parseWcfDate(r.Date!),
      country: 'all',
      clicks: r.Clicks ?? 0,
      impressions: r.Impressions ?? 0,
      ctr: (r.Impressions ?? 0) > 0 ? (r.Clicks ?? 0) / r.Impressions! : 0,
      position: r.AvgImpressionPosition ?? r.AvgClickPosition ?? 0,
      synced_at: syncedAt,
    }))
    .filter((r) => r.date >= range.startDate && r.date <= range.endDate);

  let total = 0;
  for (const batch of chunk(rows, 1000)) {
    const { error } = await supabase
      .from('bing_rows')
      .upsert(batch, { onConflict: 'site_id,query,date,country' });
    if (error) throw new Error(`bing_rows upsert failed: ${error.message}`);
    total += batch.length;
  }

  log(`[bing:${site.name}] done — ${total} rows (${apiRows.length} returned by API, filtered to window)`);
  return total;
}

/** A summary of the top Bing queries passed to the growth-plan LLM as context. */
export interface BingDigest {
  total_clicks: number;
  total_impressions: number;
  avg_position: number;
  top_queries: Array<{ query: string; clicks: number; impressions: number; position: number }>;
  window_days: number;
  as_of: string;
}

/**
 * Aggregate the last `windowDays` of `bing_rows` for a site into a compact
 * digest suitable for feeding to the LLM. Returns null when no data exists yet.
 */
export async function getBingDigest(
  siteId: string,
  windowDays = 90,
  asOf: Date = new Date(),
): Promise<BingDigest | null> {
  const supabase = getSupabase();
  const endDate = new Date(asOf);
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - (windowDays - 1));

  // Paginate past Supabase's default 1000-row cap — a well-synced site can
  // exceed that within the window (see the same fix in src/growth.ts).
  const pageSize = 1000;
  const page = (from: number) =>
    supabase
      .from('bing_rows')
      .select('query, clicks, impressions, position')
      .eq('site_id', siteId)
      .gte('date', isoDate(startDate))
      .lte('date', isoDate(endDate))
      .range(from, from + pageSize - 1);

  const { count, error: countError } = await supabase
    .from('bing_rows')
    .select('*', { count: 'exact', head: true })
    .eq('site_id', siteId)
    .gte('date', isoDate(startDate))
    .lte('date', isoDate(endDate));
  if (countError) throw new Error(`bing_rows count failed: ${countError.message}`);
  if (!count) return null;

  const pages = Math.ceil(count / pageSize);
  const results = await Promise.all(Array.from({ length: pages }, (_, i) => page(i * pageSize)));
  const data: Pick<BingRow, 'query' | 'clicks' | 'impressions' | 'position'>[] = [];
  for (const r of results) {
    if (r.error) throw new Error(`bing_rows fetch failed: ${r.error.message}`);
    data.push(...(r.data ?? []));
  }

  // Aggregate per query across all days in the window
  const byQuery = new Map<string, { clicks: number; impressions: number; positionSum: number; rows: number }>();
  for (const row of data) {
    const existing = byQuery.get(row.query) ?? { clicks: 0, impressions: 0, positionSum: 0, rows: 0 };
    existing.clicks += row.clicks;
    existing.impressions += row.impressions;
    existing.positionSum += row.position;
    existing.rows += 1;
    byQuery.set(row.query, existing);
  }

  const aggregated = Array.from(byQuery.entries())
    .map(([query, v]) => ({
      query,
      clicks: v.clicks,
      impressions: v.impressions,
      position: v.rows > 0 ? Number((v.positionSum / v.rows).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks);

  const totalClicks = aggregated.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = aggregated.reduce((s, r) => s + r.impressions, 0);
  const avgPosition =
    aggregated.length > 0
      ? Number((aggregated.reduce((s, r) => s + r.position, 0) / aggregated.length).toFixed(1))
      : 0;

  return {
    total_clicks: totalClicks,
    total_impressions: totalImpressions,
    avg_position: avgPosition,
    top_queries: aggregated.slice(0, 20),
    window_days: windowDays,
    as_of: isoDate(endDate),
  };
}

export function fullBackfillRange(now: Date = new Date()): { startDate: string; endDate: string } {
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 89);
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

export function deltaRange(days = 90, now: Date = new Date()): { startDate: string; endDate: string } {
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

export async function autoSyncRange(
  siteId: string,
): Promise<{ startDate: string; endDate: string; mode: 'backfill' | 'delta' }> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('bing_rows')
    .select('date')
    .eq('site_id', siteId)
    .limit(1)
    .maybeSingle();
  if (!(data as { date?: string } | null)?.date) {
    return { ...fullBackfillRange(), mode: 'backfill' };
  }
  return { ...deltaRange(), mode: 'delta' };
}
