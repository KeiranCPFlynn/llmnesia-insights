import './env.js';
import { OAuth2Client } from 'google-auth-library';
import { createClient } from '@supabase/supabase-js';
import type { GSCRow, Site } from './types.js';

/**
 * Google Search Console (`searchAnalytics.query`) sync for the Growth Planner.
 *
 * Auth is OAuth (refresh token in env, minted by `scripts/gsc-oauth-consent.ts`)
 * — a single token covers every GSC property the signing-in account has access
 * to, so multi-site works without per-site credentials.
 *
 * Storage: rows are upserted into `public.gsc_rows` keyed by
 * (site_id, query, page, date, country, device). Country/device are fixed to
 * 'zzz'/'all' in v1 — the dimension is in the PK so we can slice later without
 * breaking the schema.
 *
 * Why we call the REST API directly rather than via the `googleapis` package:
 * the SDK is huge (~30 MB unpacked) and we already have `google-auth-library`
 * for the OAuth client.
 */

const GSC_BASE = 'https://www.googleapis.com/webmasters/v3';

function getOAuthClient(): OAuth2Client {
  const clientId = process.env.GSC_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GSC_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GSC_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'GSC OAuth not configured — set GSC_OAUTH_CLIENT_ID / _SECRET / _REFRESH_TOKEN.',
    );
  }
  const client = new OAuth2Client({ clientId, clientSecret });
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function getSites(opts: { enabledOnly?: boolean } = {}): Promise<Site[]> {
  const supabase = getSupabase();
  let q = supabase.from('sites').select('*').order('created_at', { ascending: true });
  if (opts.enabledOnly !== false) q = q.eq('enabled', true);
  const { data, error } = await q;
  if (error) throw new Error(`Supabase fetch failed: ${error.message}`);
  return (data as Site[]) ?? [];
}

export async function getSiteById(id: string): Promise<Site | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Supabase fetch failed: ${error.message}`);
  return (data as Site) ?? null;
}

interface GSCApiRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

/**
 * One paginated call to `searchAnalytics.query`. Returns up to 25000 rows of
 * (date, query, page) for the given date range. Iterates `startRow` until
 * fewer than `rowLimit` rows come back.
 */
async function querySearchAnalytics(
  client: OAuth2Client,
  gscProperty: string,
  startDate: string,
  endDate: string,
): Promise<GSCApiRow[]> {
  const rowLimit = 25000;
  const url = `${GSC_BASE}/sites/${encodeURIComponent(gscProperty)}/searchAnalytics/query`;
  const out: GSCApiRow[] = [];
  let startRow = 0;
  while (true) {
    const { data } = await client.request<{ rows?: GSCApiRow[] }>({
      method: 'POST',
      url,
      data: {
        startDate,
        endDate,
        dimensions: ['date', 'query', 'page'],
        rowLimit,
        startRow,
        // 'all' = include fresh data even if still being aggregated. Default
        // is 'final', which excludes the last ~2 days entirely.
        dataState: 'all',
      },
    });
    const rows = data.rows ?? [];
    out.push(...rows);
    if (rows.length < rowLimit) break;
    startRow += rows.length;
  }
  return out;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Sync a site's GSC data for an inclusive date range. Pulls in monthly chunks
 * (GSC's rowLimit/startRow paginates within a single call but the API is more
 * stable when you cap each call to roughly a month of data for small sites).
 * Returns the number of rows upserted.
 */
export async function syncSite(
  site: Site,
  range: { startDate: string; endDate: string },
  log: (msg: string) => void = (m) => console.log(m),
): Promise<number> {
  const oauth = getOAuthClient();
  const supabase = getSupabase();

  log(
    `[gsc:${site.name}] syncing ${range.startDate} → ${range.endDate} (${site.gsc_property})`,
  );

  // Split the range into ~30-day chunks. Each chunk gets its own paginated
  // query — keeps single responses bounded and lets a transient failure on
  // one month not lose every month's work.
  const chunks: { startDate: string; endDate: string }[] = [];
  {
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
  }

  let total = 0;
  for (const c of chunks) {
    const apiRows = await querySearchAnalytics(oauth, site.gsc_property, c.startDate, c.endDate);
    if (apiRows.length === 0) {
      log(`[gsc:${site.name}]   ${c.startDate}…${c.endDate}: 0 rows`);
      continue;
    }
    const rows: GSCRow[] = apiRows
      .map((r) => {
        const [date, query, page] = r.keys ?? [];
        return {
          site_id: site.id,
          query: query ?? '',
          page: page ?? '',
          date: date ?? '',
          country: 'zzz',
          device: 'all',
          clicks: r.clicks ?? 0,
          impressions: r.impressions ?? 0,
          ctr: r.ctr ?? 0,
          position: r.position ?? 0,
        };
      })
      .filter((r) => r.date && r.query && r.page);

    // Supabase upsert in batches — 1000 rows per request is a comfortable
    // size; PostgREST rejects unbounded payloads.
    for (const batch of chunk(rows, 1000)) {
      const { error } = await supabase
        .from('gsc_rows')
        .upsert(batch, { onConflict: 'site_id,query,page,date,country,device' });
      if (error) throw new Error(`gsc_rows upsert failed: ${error.message}`);
    }
    total += rows.length;
    log(`[gsc:${site.name}]   ${c.startDate}…${c.endDate}: ${rows.length} rows`);
  }

  log(`[gsc:${site.name}] done — ${total} rows`);
  return total;
}

/**
 * Default backfill: last 90 days. Covers all of a young site's history with
 * margin and avoids pointless API calls against months where the site didn't
 * yet exist. Override with the explicit 16-month range below if you need it.
 */
export function fullBackfillRange(now: Date = new Date()): { startDate: string; endDate: string } {
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 89);
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

/** Full 16-month window (GSC retention limit). Only used if explicitly opted into. */
export function extendedBackfillRange(now: Date = new Date()): { startDate: string; endDate: string } {
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - 16);
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

/** Delta sync: re-pull the last N days to absorb GSC's ~2-3 day lag + revisions. */
export function deltaRange(days = 7, now: Date = new Date()): { startDate: string; endDate: string } {
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

/**
 * Convenience: pick a backfill or delta range based on whether the site
 * already has any rows. Used by the sync API route to "do the right thing"
 * on the first run vs subsequent runs.
 */
export async function autoSyncRange(siteId: string): Promise<{ startDate: string; endDate: string; mode: 'backfill' | 'delta' }> {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from('gsc_rows')
    .select('*', { count: 'exact', head: true })
    .eq('site_id', siteId);
  if (error) throw new Error(`Supabase count failed: ${error.message}`);
  if (!count || count === 0) {
    return { ...fullBackfillRange(), mode: 'backfill' };
  }
  return { ...deltaRange(7), mode: 'delta' };
}
