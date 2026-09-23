import './env.js';
import { createClient } from '@supabase/supabase-js';
import {
  autoSyncRange as gscAutoSyncRange,
  getAccurateSiteTotals,
  syncSite as gscSyncSite,
} from './gsc.js';
import {
  autoSyncRange as bingAutoSyncRange,
  getAccurateBingTotals,
  syncSite as bingSyncSite,
} from './bing.js';
import type { SearchPerformanceDigest, SearchQueryRow, SearchSourceDigest, Site } from './types.js';

/**
 * Combined Google Search Console + Bing Webmaster Tools digest for the weekly
 * insights pipeline — the TOP-OF-FUNNEL search-visibility layer that GA4 and
 * PostHog can't see (impressions, queries, ranking — i.e. people who saw the
 * site in search but may not have clicked).
 *
 * Scoped to llmnesia.com only: insights is a single-product pipeline. The raw,
 * multi-site, query×page data still lives in the growth planner; this is just a
 * site-level summary for the product narrative.
 *
 * Fail-soft by contract: every caller wraps this so a missing growth table, an
 * unconfigured Bing key, or no llmnesia `sites` row returns null and the
 * insights run proceeds unchanged.
 */

const SITE_NAME = 'llmnesia';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  return createClient(url, key, { auth: { persistSession: false } });
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve the single llmnesia `sites` row the insights pipeline reports on.
 * Returns null when growth isn't set up (no matching site), so every caller can
 * degrade gracefully rather than throw.
 */
async function getInsightsSite(): Promise<Site | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .ilike('name', SITE_NAME)
    .maybeSingle();
  if (error) throw new Error(`sites lookup failed: ${error.message}`);
  return (data as Site | null) ?? null;
}

/**
 * Refresh the insights site's search rows (Google Search Console + Bing
 * Webmaster Tools) for the trailing delta window, so a run reads current data
 * instead of whatever a past growth sync happened to leave behind.
 *
 * Bing is deliberately synced here alongside GSC: insights depends on the same
 * `bing_rows`/`gsc_rows` tables the growth planner fills, but nothing guaranteed
 * they were fresh at analysis time. Wiring the sync into the pipeline keeps Bing
 * up to date on every relevant update rather than drifting between growth syncs.
 *
 * Fail-soft by contract: no llmnesia site, an unconfigured Bing key, or a
 * transient API/auth error must never break the insights run — we log and move
 * on, and the digest falls back to whatever rows are already stored.
 */
export async function syncSearchForInsights(
  log: (msg: string) => void = (m) => console.log(m),
): Promise<void> {
  let site: Site | null;
  try {
    site = await getInsightsSite();
  } catch (e) {
    log(`Search sync skipped: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  if (!site) return; // growth not set up → nothing to sync

  const resolved = site;
  const hasBing = !!process.env.BING_WEBMASTER_API_KEY;
  const [gscRange, bingRange] = await Promise.all([
    gscAutoSyncRange(resolved.id),
    hasBing ? bingAutoSyncRange(resolved.id) : Promise.resolve(null),
  ]);
  const results = await Promise.allSettled([
    gscSyncSite(resolved, gscRange, (m) => log(`[search-sync] ${m}`)),
    hasBing && bingRange
      ? bingSyncSite(resolved, bingRange, (m) => log(`[search-sync] ${m}`))
      : Promise.resolve(0),
  ]);
  const [gsc, bing] = results;
  if (gsc.status === 'rejected') {
    log(`GSC sync failed (continuing): ${gsc.reason instanceof Error ? gsc.reason.message : String(gsc.reason)}`);
  }
  if (bing.status === 'rejected') {
    log(`Bing sync failed (continuing): ${bing.reason instanceof Error ? bing.reason.message : String(bing.reason)}`);
  }
}

interface RawSearchRow {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
}

/** Impression-weighted aggregate over a window's rows for one source. */
function aggregate(
  current: RawSearchRow[],
  prior: RawSearchRow[],
): SearchSourceDigest {
  let clicks = 0;
  let impressions = 0;
  let posWeighted = 0;
  for (const r of current) {
    clicks += r.clicks;
    impressions += r.impressions;
    posWeighted += r.position * r.impressions;
  }
  let priorClicks = 0;
  let priorImpressions = 0;
  for (const r of prior) {
    priorClicks += r.clicks;
    priorImpressions += r.impressions;
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? Number((clicks / impressions).toFixed(4)) : 0,
    avg_position: impressions > 0 ? Number((posWeighted / impressions).toFixed(1)) : 0,
    prior_clicks: priorClicks,
    prior_impressions: priorImpressions,
  };
}

/** Merge per-query rows across sources into ranked top-N lists. */
function topQueries(
  google: RawSearchRow[],
  bing: RawSearchRow[],
  by: 'impressions' | 'clicks',
  n: number,
): SearchQueryRow[] {
  const map = new Map<string, { impressions: number; clicks: number; sources: Set<'google' | 'bing'> }>();
  const add = (rows: RawSearchRow[], source: 'google' | 'bing') => {
    for (const r of rows) {
      const e = map.get(r.query) ?? { impressions: 0, clicks: 0, sources: new Set<'google' | 'bing'>() };
      e.impressions += r.impressions;
      e.clicks += r.clicks;
      e.sources.add(source);
      map.set(r.query, e);
    }
  };
  add(google, 'google');
  add(bing, 'bing');
  return Array.from(map.entries())
    .map(([query, v]) => ({ query, impressions: v.impressions, clicks: v.clicks, sources: [...v.sources] }))
    .sort((a, b) => b[by] - a[by])
    .slice(0, n);
}

type DatedRow = RawSearchRow & { date: string };

async function fetchRows(
  table: 'gsc_rows' | 'bing_rows',
  siteId: string,
  startDate: string,
  endDate: string,
): Promise<DatedRow[]> {
  const supabase = getSupabase();
  const pageSize = 1000;
  const page = (from: number) =>
    supabase
      .from(table)
      .select('query, clicks, impressions, position, date')
      .eq('site_id', siteId)
      .gte('date', startDate)
      .lte('date', endDate)
      .range(from, from + pageSize - 1);

  // Same 1000-row Supabase/PostgREST cap as elsewhere — a 14-day window
  // (this week + prior week) for an active site already exceeds it.
  const { count, error: countError } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('site_id', siteId)
    .gte('date', startDate)
    .lte('date', endDate);
  if (countError) throw new Error(`${table} count failed: ${countError.message}`);

  const pages = Math.ceil((count ?? 0) / pageSize);
  const results = await Promise.all(Array.from({ length: pages }, (_, i) => page(i * pageSize)));
  const out: DatedRow[] = [];
  for (const { data, error } of results) {
    if (error) throw new Error(`${table} fetch failed: ${error.message}`);
    out.push(...((data ?? []) as DatedRow[]));
  }
  return out;
}

/**
 * Build the digest for the given insights week. Compares the week against the
 * 7 days immediately before it for week-over-week movement. Returns null when
 * there is no llmnesia site or no search data at all (so the snapshot simply
 * omits the block).
 */
export async function getCombinedSearchDigest(
  weekStart: string,
  weekEnd: string,
): Promise<SearchPerformanceDigest | null> {
  // Resolve the llmnesia site row. Missing = growth not set up → no digest.
  const site = await getInsightsSite();
  if (!site) return null;
  const siteId = site.id;

  const priorEnd = new Date(`${weekStart}T00:00:00Z`);
  priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);
  const priorStart = new Date(priorEnd);
  priorStart.setUTCDate(priorStart.getUTCDate() - 6);
  const priorStartIso = isoDate(priorStart);
  const priorEndIso = isoDate(priorEnd);

  // One query per source spanning prior+current windows, split in JS.
  const hasBing = !!process.env.BING_WEBMASTER_API_KEY;
  const [gscAll, bingAll] = await Promise.all([
    fetchRows('gsc_rows', siteId, priorStartIso, weekEnd),
    hasBing
      ? fetchRows('bing_rows', siteId, priorStartIso, weekEnd).catch(() => [] as DatedRow[])
      : Promise.resolve([] as DatedRow[]),
  ]);

  const inWeek = (r: { date: string }) => r.date >= weekStart && r.date <= weekEnd;
  const inPrior = (r: { date: string }) => r.date >= priorStartIso && r.date <= priorEndIso;

  const gscCurrent = gscAll.filter(inWeek);
  const gscPrior = gscAll.filter(inPrior);
  const bingCurrent = bingAll.filter(inWeek);
  const bingPrior = bingAll.filter(inPrior);

  // Nothing at all in the current week → omit the block entirely.
  if (gscCurrent.length === 0 && bingCurrent.length === 0) return null;

  // gscCurrent/gscPrior come from the query-dimensioned gsc_rows table, so
  // they're fine for avg_position (an average survives a smaller sample) and
  // for top_queries (inherently query-level), but summing their clicks/
  // impressions as the headline Google numbers silently undercounts by ~20x
  // — GSC anonymizes/drops rows once `query` is a dimension (see
  // getAccurateSiteTotals). Pull the real totals from a query-free live call
  // and only take avg_position from the local aggregate.
  //
  // bing_rows has the same shape of bug: GetQueryStats (its source) only
  // surfaces a subset of queries, so summing it undercounts site-wide
  // impressions by ~12x (see getAccurateBingTotals in bing.ts). Same fix.
  let bing: SearchSourceDigest | null = null;
  if (bingCurrent.length > 0) {
    const localAggregate = aggregate(bingCurrent, bingPrior);
    const [current, prior] = await Promise.all([
      getAccurateBingTotals(site, weekStart, weekEnd),
      getAccurateBingTotals(site, priorStartIso, priorEndIso),
    ]);
    bing = {
      clicks: current.total_clicks,
      impressions: current.total_impressions,
      ctr:
        current.total_impressions > 0
          ? Number((current.total_clicks / current.total_impressions).toFixed(4))
          : 0,
      avg_position: localAggregate.avg_position,
      prior_clicks: prior.total_clicks,
      prior_impressions: prior.total_impressions,
    };
  }
  let google: SearchSourceDigest | null = null;
  if (gscCurrent.length > 0) {
    const localAggregate = aggregate(gscCurrent, gscPrior);
    const [current, prior] = await Promise.all([
      getAccurateSiteTotals(site, weekStart, weekEnd),
      getAccurateSiteTotals(site, priorStartIso, priorEndIso),
    ]);
    google = {
      clicks: current.total_clicks,
      impressions: current.total_impressions,
      ctr:
        current.total_impressions > 0
          ? Number((current.total_clicks / current.total_impressions).toFixed(4))
          : 0,
      avg_position: localAggregate.avg_position,
      prior_clicks: prior.total_clicks,
      prior_impressions: prior.total_impressions,
    };
  }

  const combinedClicks = (google?.clicks ?? 0) + (bing?.clicks ?? 0);
  const combinedImpressions = (google?.impressions ?? 0) + (bing?.impressions ?? 0);

  return {
    site: 'llmnesia.com',
    data_as_of: {
      google: gscCurrent.map((row) => row.date).sort().at(-1) ?? null,
      bing: bingCurrent.map((row) => row.date).sort().at(-1) ?? null,
    },
    window: { start: weekStart, end: weekEnd },
    prior_window: { start: priorStartIso, end: priorEndIso },
    google,
    bing,
    combined: {
      clicks: combinedClicks,
      impressions: combinedImpressions,
      ctr: combinedImpressions > 0 ? Number((combinedClicks / combinedImpressions).toFixed(4)) : 0,
    },
    top_queries_by_impressions: topQueries(gscCurrent, bingCurrent, 'impressions', 12),
    top_queries_by_clicks: topQueries(gscCurrent, bingCurrent, 'clicks', 12),
  };
}
