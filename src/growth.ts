import './env.js';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type {
  GSCRow,
  GrowthOpportunity,
  GrowthOpportunityEvidence,
  GrowthOpportunityType,
} from './types.js';

/**
 * Deterministic opportunity detection over `gsc_rows`. Five queues:
 *   near_win        — pos 11–30 with real impressions: push to page 1
 *   low_ctr         — pos ≤ 10 with CTR well below benchmark: fix the snippet
 *   gap             — query has demand but no page ranks well: new content
 *   declining       — page losing clicks vs the prior 28d
 *   proven_expander — page with consistent clicks: cluster / distribute
 *
 * All detection is pure rules over the data — no LLM. The LLM only composes
 * the weekly plan from these ranked candidates, so scores stay legible and
 * the founder can sanity-check each one.
 */

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Detection window. 90 days is the right size for small/young sites: a
 * 28-day slice would have single-digit impressions on most queries and
 * surface nothing actionable. For a busy site the same thresholds still
 * fire — the volume score sorts them out.
 */
const WINDOW_DAYS = 90;
/** GSC data lags ~2 days; ignore the most recent two to avoid jagged trends. */
const LAG_DAYS = 2;

/**
 * Threshold floors — tuned for indie / early-stage sites. With single-digit
 * impressions per query, requiring ≥ 30/50 (the canonical "established site"
 * floors) suppresses real signal. The score still penalises low volume via
 * `volumeScore`, so big sites just rank theirs higher.
 */
const T_NEAR_WIN_MIN_IMP = 2;
const T_LOW_CTR_MIN_IMP = 3;
const T_GAP_MIN_IMP = 3;
const T_DECLINING_MIN_PRIOR_CLICKS = 3;
const T_PROVEN_EXPANDER_MIN_CLICKS = 5;

/** Rolling window the detectors operate on, ending ~2 days ago. */
export function detectionWindow(now: Date = new Date()): {
  current: { startDate: string; endDate: string };
  prior: { startDate: string; endDate: string };
  asOf: string;
} {
  const isoDate = (d: Date) => d.toISOString().slice(0, 10);
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() - LAG_DAYS);
  const currentStart = new Date(end);
  currentStart.setUTCDate(currentStart.getUTCDate() - (WINDOW_DAYS - 1));

  const priorEnd = new Date(currentStart);
  priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);
  const priorStart = new Date(priorEnd);
  priorStart.setUTCDate(priorStart.getUTCDate() - (WINDOW_DAYS - 1));

  return {
    current: { startDate: isoDate(currentStart), endDate: isoDate(end) },
    prior: { startDate: isoDate(priorStart), endDate: isoDate(priorEnd) },
    asOf: isoDate(end),
  };
}

interface Agg {
  impressions: number;
  clicks: number;
  /** Impression-weighted average position (lower = better). */
  position: number;
  ctr: number;
}

function aggregate(rows: GSCRow[]): Agg {
  let impressions = 0;
  let clicks = 0;
  let posWeighted = 0;
  for (const r of rows) {
    impressions += r.impressions;
    clicks += r.clicks;
    posWeighted += r.position * r.impressions;
  }
  return {
    impressions,
    clicks,
    position: impressions > 0 ? posWeighted / impressions : 0,
    ctr: impressions > 0 ? clicks / impressions : 0,
  };
}

function groupBy<T, K extends string>(rows: T[], keyFn: (r: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const r of rows) {
    const k = keyFn(r);
    const arr = m.get(k);
    if (arr) arr.push(r);
    else m.set(k, [r]);
  }
  return m;
}

/**
 * Industry-rough click-through curve for organic Google results. Used as a
 * *relative* gate (actual CTR << expected = signal); not a forecast.
 */
function expectedCTR(position: number): number {
  const table = [0.3, 0.16, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.015];
  if (position < 1) return table[0];
  if (position > 10) return 0.01;
  const floor = Math.floor(position);
  const frac = position - floor;
  const a = table[Math.max(0, floor - 1)] ?? 0.01;
  const b = table[Math.min(table.length - 1, floor)] ?? 0.01;
  return a + (b - a) * frac;
}

function volumeScore(impressions: number): number {
  // log-scaled: 30 imps → ~15, 300 → ~35, 3000 → ~55, 30000 → ~75
  return Math.min(100, Math.round(20 * Math.log10(impressions / 10 + 1)));
}

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

function stableId(key: string): string {
  const h = createHash('sha256').update(key).digest('hex');
  // Valid UUID shape (not strictly v5, but Postgres accepts it).
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Top-ranked page for each query, by impression-weighted position. */
function topPageByQuery(rows: GSCRow[]): Map<string, { page: string; agg: Agg }> {
  // Group by (query -> page -> rows) using nested maps to avoid composite
  // string keys (queries / URLs can contain any separator we'd pick).
  const byQueryPage = new Map<string, Map<string, GSCRow[]>>();
  for (const r of rows) {
    let pageMap = byQueryPage.get(r.query);
    if (!pageMap) {
      pageMap = new Map();
      byQueryPage.set(r.query, pageMap);
    }
    const arr = pageMap.get(r.page);
    if (arr) arr.push(r);
    else pageMap.set(r.page, [r]);
  }
  const out = new Map<string, { page: string; agg: Agg }>();
  for (const [query, pageMap] of byQueryPage) {
    let best: { page: string; agg: Agg } | null = null;
    for (const [page, rs] of pageMap) {
      const agg = aggregate(rs);
      if (!best || agg.position < best.agg.position) best = { page, agg };
    }
    if (best) out.set(query, best);
  }
  return out;
}

interface DetectorContext {
  site_id: string;
  week_start: string;
  asOf: string;
  current: GSCRow[];
  prior: GSCRow[];
  /** Per-query rollup for the current window. */
  byQuery: Map<string, Agg>;
  /** Per-page rollup for the current window. */
  byPage: Map<string, Agg>;
  /** Per-page rollup for the prior window (for trend detection). */
  byPagePrior: Map<string, Agg>;
  /** Best page (lowest position) per query in the current window. */
  topPage: Map<string, { page: string; agg: Agg }>;
}

function buildContext(opts: {
  site_id: string;
  week_start: string;
  asOf: string;
  current: GSCRow[];
  prior: GSCRow[];
}): DetectorContext {
  const byQuery = new Map<string, Agg>();
  for (const [q, rs] of groupBy(opts.current, (r) => r.query)) byQuery.set(q, aggregate(rs));
  const byPage = new Map<string, Agg>();
  for (const [p, rs] of groupBy(opts.current, (r) => r.page)) byPage.set(p, aggregate(rs));
  const byPagePrior = new Map<string, Agg>();
  for (const [p, rs] of groupBy(opts.prior, (r) => r.page)) byPagePrior.set(p, aggregate(rs));
  return { ...opts, byQuery, byPage, byPagePrior, topPage: topPageByQuery(opts.current) };
}

function makeOpportunity(
  ctx: DetectorContext,
  type: GrowthOpportunityType,
  target: { query?: string; page?: string },
  agg: Agg,
  reasons: string[],
  score: number,
  prior?: Agg,
): GrowthOpportunity {
  const evidence: GrowthOpportunityEvidence = {
    window_days: WINDOW_DAYS,
    as_of: ctx.asOf,
    impressions: agg.impressions,
    clicks: agg.clicks,
    ctr: agg.ctr,
    position: agg.position,
    reasons,
    ...(prior
      ? { prior: { impressions: prior.impressions, clicks: prior.clicks, ctr: prior.ctr, position: prior.position } }
      : {}),
  };
  return {
    id: stableId(
      [ctx.site_id, ctx.week_start, type, target.query ?? '', target.page ?? ''].join('|'),
    ),
    site_id: ctx.site_id,
    week_start: ctx.week_start,
    type,
    target_query: target.query ?? null,
    target_page: target.page ?? null,
    evidence,
    score: clamp(Math.round(score)),
  };
}

function detectNearWins(ctx: DetectorContext): GrowthOpportunity[] {
  const out: GrowthOpportunity[] = [];
  for (const [query, agg] of ctx.byQuery) {
    if (agg.position < 11 || agg.position > 30) continue;
    if (agg.impressions < T_NEAR_WIN_MIN_IMP) continue;
    const top = ctx.topPage.get(query);
    const positionScore = ((30 - agg.position) / 19) * 100; // tighter ⇒ higher
    const score = volumeScore(agg.impressions) * 0.5 + positionScore * 0.5;
    out.push(
      makeOpportunity(
        ctx,
        'near_win',
        { query, page: top?.page },
        agg,
        [
          `Ranking at average position ${agg.position.toFixed(1)} for "${query}".`,
          `${agg.impressions} impressions in the last ${WINDOW_DAYS} days, ${agg.clicks} clicks.`,
          top ? `Best-ranking page: ${top.page}` : 'No single dominant page yet — consolidate or pick a hero page.',
        ],
        score,
      ),
    );
  }
  return out;
}

function detectLowCTR(ctx: DetectorContext): GrowthOpportunity[] {
  const out: GrowthOpportunity[] = [];
  for (const [query, agg] of ctx.byQuery) {
    if (agg.position > 10) continue;
    if (agg.impressions < T_LOW_CTR_MIN_IMP) continue;
    const expected = expectedCTR(agg.position);
    if (agg.ctr >= expected * 0.6) continue;
    const top = ctx.topPage.get(query);
    const ctrGap = (expected - agg.ctr) / expected;
    const score = volumeScore(agg.impressions) * 0.5 + clamp(ctrGap * 100) * 0.5;
    out.push(
      makeOpportunity(
        ctx,
        'low_ctr',
        { query, page: top?.page },
        agg,
        [
          `On page 1 for "${query}" (avg pos ${agg.position.toFixed(1)}) but click-through is ${(agg.ctr * 100).toFixed(1)}% vs ~${(expected * 100).toFixed(1)}% benchmark.`,
          `${agg.impressions} impressions, ${agg.clicks} clicks in ${WINDOW_DAYS} days.`,
          top ? `Best-ranking page: ${top.page}` : 'No single dominant page yet.',
          'Suggests title/meta or intent-match is letting the listing down.',
        ],
        score,
      ),
    );
  }
  return out;
}

function detectGaps(ctx: DetectorContext): GrowthOpportunity[] {
  const out: GrowthOpportunity[] = [];
  for (const [query, agg] of ctx.byQuery) {
    if (agg.impressions < T_GAP_MIN_IMP) continue;
    if (agg.position <= 20) continue;
    const top = ctx.topPage.get(query);
    const positionGap = clamp(agg.position - 20);
    const score = volumeScore(agg.impressions) * 0.6 + positionGap * 0.4;
    out.push(
      makeOpportunity(
        ctx,
        'gap',
        { query, page: top?.page },
        agg,
        [
          `Real search demand ("${query}", ${agg.impressions} impressions in ${WINDOW_DAYS}d) but ranking weakly at position ${agg.position.toFixed(1)}.`,
          top
            ? `Best-ranking existing page is ${top.page} — probably only a partial intent match.`
            : 'No page on the site ranks for this query.',
          'A dedicated page for this query is likely worth creating.',
        ],
        score,
      ),
    );
  }
  return out;
}

function detectDeclining(ctx: DetectorContext): GrowthOpportunity[] {
  const out: GrowthOpportunity[] = [];
  for (const [page, agg] of ctx.byPage) {
    const prior = ctx.byPagePrior.get(page);
    if (!prior || prior.clicks < T_DECLINING_MIN_PRIOR_CLICKS) continue;
    if (agg.clicks >= prior.clicks * 0.7) continue;
    const drop = (prior.clicks - agg.clicks) / prior.clicks;
    const score = volumeScore(prior.impressions) * 0.4 + drop * 100 * 0.6;
    out.push(
      makeOpportunity(
        ctx,
        'declining',
        { page },
        agg,
        [
          `${page} dropped from ${prior.clicks} clicks (prior ${WINDOW_DAYS}d) to ${agg.clicks} (last ${WINDOW_DAYS}d) — ${Math.round(drop * 100)}% down.`,
          `Average position moved from ${prior.position.toFixed(1)} to ${agg.position.toFixed(1)}.`,
          'Possible causes: outdated content, competitor moved ahead, indexing/cannibalisation issue.',
        ],
        score,
        prior,
      ),
    );
  }
  return out;
}

function detectProvenExpanders(ctx: DetectorContext): GrowthOpportunity[] {
  const out: GrowthOpportunity[] = [];
  for (const [page, agg] of ctx.byPage) {
    if (agg.clicks < T_PROVEN_EXPANDER_MIN_CLICKS) continue;
    const prior = ctx.byPagePrior.get(page);
    // Skip declining pages — those go in the declining queue, not here.
    if (prior && agg.clicks < prior.clicks * 0.85) continue;
    const score = volumeScore(agg.clicks * 10); // weight clicks 10× imps
    out.push(
      makeOpportunity(
        ctx,
        'proven_expander',
        { page },
        agg,
        [
          `${page} is pulling ${agg.clicks} clicks / ${agg.impressions} impressions over ${WINDOW_DAYS}d at avg pos ${agg.position.toFixed(1)}.`,
          'Adjacent topics, internal links from new posts, and external distribution should compound this.',
        ],
        score,
        prior,
      ),
    );
  }
  return out;
}

/**
 * Pull GSC rows for both windows in one query and run all 5 detectors.
 * Persists the result to `growth_opportunities` (upsert on deterministic id),
 * so subsequent reads don't recompute — and `growth_actions.opportunity_id`
 * references remain stable across re-runs.
 */
export async function computeOpportunities(opts: {
  siteId: string;
  weekStart: string;
  now?: Date;
}): Promise<GrowthOpportunity[]> {
  const { current, prior, asOf } = detectionWindow(opts.now);
  const supabase = getSupabase();
  const { data: rowsRaw, error } = await supabase
    .from('gsc_rows')
    .select('site_id, query, page, date, country, device, clicks, impressions, ctr, position')
    .eq('site_id', opts.siteId)
    .gte('date', prior.startDate)
    .lte('date', current.endDate);
  if (error) throw new Error(`gsc_rows fetch failed: ${error.message}`);
  const all = (rowsRaw as GSCRow[]) ?? [];

  const currentRows = all.filter((r) => r.date >= current.startDate && r.date <= current.endDate);
  const priorRows = all.filter((r) => r.date >= prior.startDate && r.date <= prior.endDate);

  const ctx = buildContext({
    site_id: opts.siteId,
    week_start: opts.weekStart,
    asOf,
    current: currentRows,
    prior: priorRows,
  });

  const opportunities = [
    ...detectNearWins(ctx),
    ...detectLowCTR(ctx),
    ...detectGaps(ctx),
    ...detectDeclining(ctx),
    ...detectProvenExpanders(ctx),
  ].sort((a, b) => b.score - a.score);

  // Wipe-then-insert (not upsert) so detector tweaks don't leave stale rows
  // from prior definitions sitting alongside the fresh ones. `growth_actions`
  // carries its own copy of target_query / target_page / action_type, so a
  // dangling `growth_actions.opportunity_id` is just an unused soft pointer.
  const { error: delErr } = await supabase
    .from('growth_opportunities')
    .delete()
    .eq('site_id', opts.siteId)
    .eq('week_start', opts.weekStart);
  if (delErr) throw new Error(`growth_opportunities delete failed: ${delErr.message}`);

  if (opportunities.length > 0) {
    const { error: insErr } = await supabase
      .from('growth_opportunities')
      .insert(opportunities);
    if (insErr) throw new Error(`growth_opportunities insert failed: ${insErr.message}`);
  }

  return opportunities;
}

/** Summary used in the LLM prompt + UI hints — how much data this site has. */
export interface SiteScale {
  total_impressions: number;
  total_clicks: number;
  unique_queries: number;
  unique_pages: number;
  /** True when the site is in early-stage territory: most queries get 1-handful of impressions. */
  is_small_site: boolean;
}

export function summariseSiteScale(rows: GSCRow[]): SiteScale {
  const queries = new Set<string>();
  const pages = new Set<string>();
  let imps = 0;
  let clicks = 0;
  for (const r of rows) {
    queries.add(r.query);
    pages.add(r.page);
    imps += r.impressions;
    clicks += r.clicks;
  }
  return {
    total_impressions: imps,
    total_clicks: clicks,
    unique_queries: queries.size,
    unique_pages: pages.size,
    is_small_site: imps < 500, // < ~5 imps/day across whole site = "young / early"
  };
}

export async function getSiteScale(siteId: string): Promise<SiteScale> {
  const { current } = detectionWindow();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('gsc_rows')
    .select('query, page, clicks, impressions')
    .eq('site_id', siteId)
    .gte('date', current.startDate)
    .lte('date', current.endDate);
  if (error) throw new Error(`gsc_rows scale fetch failed: ${error.message}`);
  return summariseSiteScale((data as GSCRow[]) ?? []);
}

export async function getOpportunities(
  siteId: string,
  weekStart: string,
): Promise<GrowthOpportunity[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('growth_opportunities')
    .select('*')
    .eq('site_id', siteId)
    .eq('week_start', weekStart)
    .order('score', { ascending: false });
  if (error) throw new Error(`growth_opportunities fetch failed: ${error.message}`);
  return (data as GrowthOpportunity[]) ?? [];
}

/**
 * Ensure opportunities are up to date for (site, week). Recomputes when:
 *   - none exist yet, OR
 *   - the newest gsc_rows.synced_at is later than the oldest stored
 *     opportunity (meaning data has landed since we last detected), OR
 *   - the caller explicitly forces it.
 * Detection is cheap (pure SQL + JS) so being eager here is fine.
 */
export async function ensureOpportunities(opts: {
  siteId: string;
  weekStart: string;
  force?: boolean;
}): Promise<GrowthOpportunity[]> {
  if (opts.force) return computeOpportunities(opts);

  const existing = await getOpportunities(opts.siteId, opts.weekStart);
  if (existing.length === 0) return computeOpportunities(opts);

  // Recompute if a sync has landed since these were detected.
  const supabase = getSupabase();
  const { data: latest } = await supabase
    .from('gsc_rows')
    .select('synced_at')
    .eq('site_id', opts.siteId)
    .order('synced_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const oldestCreated = existing
    .map((o) => o.created_at ?? '')
    .filter(Boolean)
    .sort()[0];
  const latestSync = (latest as { synced_at?: string } | null)?.synced_at ?? '';
  if (latestSync && oldestCreated && latestSync > oldestCreated) {
    return computeOpportunities(opts);
  }
  return existing;
}
