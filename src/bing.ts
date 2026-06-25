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

// WCF date format from Bing: /Date(1625097600000)/
function parseWcfDate(raw: string): string {
  const match = /\/Date\((\d+)\)\//.exec(raw);
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

async function fetchKeywordStats(
  apiKey: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
): Promise<BingApiRow[]> {
  const params = new URLSearchParams({
    apikey: apiKey,
    siteUrl,
    startDate: `${startDate}T00:00:00`,
    endDate: `${endDate}T00:00:00`,
    country: 'all',
    language: 'all',
  });
  const res = await fetch(`${BING_API_BASE}/GetKeywordStats?${params}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Bing API ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json() as { d?: BingApiRow[] | { KeywordStats?: BingApiRow[] } };
  // Bing returns either { d: [...] } or { d: { KeywordStats: [...] } }
  const d = json?.d;
  if (Array.isArray(d)) return d;
  if (d && 'KeywordStats' in d) return (d as { KeywordStats?: BingApiRow[] }).KeywordStats ?? [];
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

  // Split into ~30-day chunks — keeps each API response small and lets a
  // failure on one month not wipe the rest.
  const chunks: { startDate: string; endDate: string }[] = [];
  const start = new Date(`${range.startDate}T00:00:00Z`);
  const end = new Date(`${range.endDate}T00:00:00Z`);
  let cursor = new Date(start);
  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(cursor.getUTCDate() + 29);
    const e = chunkEnd > end ? end : chunkEnd;
    chunks.push({ startDate: isoDate(cursor), endDate: isoDate(e) });
    cursor = new Date(e);
    cursor.setUTCDate(e.getUTCDate() + 1);
  }

  let total = 0;
  for (const c of chunks) {
    const apiRows = await fetchKeywordStats(apiKey, siteUrl, c.startDate, c.endDate);
    if (apiRows.length === 0) {
      log(`[bing:${site.name}]   ${c.startDate}…${c.endDate}: 0 rows`);
      continue;
    }

    const syncedAt = new Date().toISOString();
    const rows: BingRow[] = apiRows
      .filter((r) => r.Query)
      .map((r) => {
        const impressions = r.Impressions ?? 0;
        const clicks = r.Clicks ?? 0;
        return {
          site_id: site.id,
          query: r.Query!,
          date: r.Date ? parseWcfDate(r.Date) : c.startDate,
          country: 'all',
          clicks,
          impressions,
          ctr: impressions > 0 ? clicks / impressions : 0,
          position: r.AvgImpressionPosition ?? r.AvgClickPosition ?? 0,
          synced_at: syncedAt,
        };
      });

    for (const batch of chunk(rows, 1000)) {
      const { error } = await supabase
        .from('bing_rows')
        .upsert(batch, { onConflict: 'site_id,query,date,country' });
      if (error) throw new Error(`bing_rows upsert failed: ${error.message}`);
    }
    total += rows.length;
    log(`[bing:${site.name}]   ${c.startDate}…${c.endDate}: ${rows.length} rows`);
  }

  log(`[bing:${site.name}] done — ${total} rows`);
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

  const { data, error } = await supabase
    .from('bing_rows')
    .select('query, clicks, impressions, position')
    .eq('site_id', siteId)
    .gte('date', isoDate(startDate))
    .lte('date', isoDate(endDate));

  if (error) throw new Error(`bing_rows fetch failed: ${error.message}`);
  if (!data || data.length === 0) return null;

  // Aggregate per query across all days in the window
  const byQuery = new Map<string, { clicks: number; impressions: number; positionSum: number; rows: number }>();
  for (const row of data as BingRow[]) {
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
