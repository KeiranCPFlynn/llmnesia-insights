import './env.js';
import { createClient } from '@supabase/supabase-js';
import type { SearchPerformanceDigest, SearchQueryRow, SearchSourceDigest } from './types.js';

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
  const { data, error } = await supabase
    .from(table)
    .select('query, clicks, impressions, position, date')
    .eq('site_id', siteId)
    .gte('date', startDate)
    .lte('date', endDate);
  if (error) throw new Error(`${table} fetch failed: ${error.message}`);
  return (data ?? []) as DatedRow[];
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
  const supabase = getSupabase();

  // Resolve the llmnesia site row. Missing = growth not set up → no digest.
  const { data: siteRow, error: siteErr } = await supabase
    .from('sites')
    .select('id')
    .ilike('name', SITE_NAME)
    .maybeSingle();
  if (siteErr) throw new Error(`sites lookup failed: ${siteErr.message}`);
  const siteId = (siteRow as { id?: string } | null)?.id;
  if (!siteId) return null;

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

  const google = gscCurrent.length > 0 ? aggregate(gscCurrent, gscPrior) : null;
  const bing = bingCurrent.length > 0 ? aggregate(bingCurrent, bingPrior) : null;

  const combinedClicks = (google?.clicks ?? 0) + (bing?.clicks ?? 0);
  const combinedImpressions = (google?.impressions ?? 0) + (bing?.impressions ?? 0);

  return {
    site: 'llmnesia.com',
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
