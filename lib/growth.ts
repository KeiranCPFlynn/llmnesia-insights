import { createClient } from '@supabase/supabase-js';
import { getOpportunities } from '../src/growth.js';
import { calendarWeekStart } from './week.js';
import type {
  GSCRow,
  GrowthAction,
  GrowthOpportunity,
  GrowthOpportunityType,
  GrowthPlan,
  Site,
} from '../src/types.js';

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function getEnabledSites(): Promise<Site[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('enabled', true)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`sites fetch failed: ${error.message}`);
  return (data as Site[]) ?? [];
}

export async function getGrowthWeekOptions(
  siteId: string,
  currentWeekStart = getCurrentWeekStart(),
): Promise<{ weeks: string[]; defaultWeek: string }> {
  const supabase = getClient();
  const [plansRes, actionsRes, oppsRes] = await Promise.all([
    supabase
      .from('growth_plans')
      .select('week_start')
      .eq('site_id', siteId)
      .order('week_start', { ascending: false })
      .limit(52), // Increased from 26 to 52 weeks
    supabase
      .from('growth_actions')
      .select('week_start')
      .eq('site_id', siteId)
      .order('week_start', { ascending: false })
      .limit(52), // Increased from 26 to 52 weeks
    supabase
      .from('growth_opportunities')
      .select('week_start')
      .eq('site_id', siteId)
      .order('week_start', { ascending: false })
      .limit(52), // Increased from 26 to 52 weeks
  ]);

  if (plansRes.error) {
    throw new Error(`growth_plans weeks fetch failed: ${plansRes.error.message}`);
  }
  if (actionsRes.error) {
    throw new Error(`growth_actions weeks fetch failed: ${actionsRes.error.message}`);
  }
  if (oppsRes.error) {
    throw new Error(`growth_opportunities weeks fetch failed: ${oppsRes.error.message}`);
  }

  const activeWeeks = new Set<string>();
  for (const rows of [plansRes.data, actionsRes.data, oppsRes.data]) {
    for (const r of (rows as { week_start: string }[] | null) ?? []) {
      if (r.week_start) activeWeeks.add(r.week_start);
    }
  }

  const sortedActiveWeeks = [...activeWeeks].sort((a, b) => b.localeCompare(a));
  const weeks = [...new Set([currentWeekStart, ...sortedActiveWeeks])].sort((a, b) =>
    b.localeCompare(a),
  );

  return {
    weeks,
    // Opening Growth should show useful work. Prefer the latest generated plan;
    // the current calendar week remains available in the selector for starting
    // a fresh plan.
    defaultWeek:
      ((plansRes.data as { week_start: string }[] | null)?.[0]?.week_start) ??
      currentWeekStart,
  };
}

/** ISO date for the Monday of the current calendar week, in UTC. */
export function getCurrentWeekStart(now: Date = new Date()): string {
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, …
  const offset = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - offset);
  return monday.toISOString().slice(0, 10);
}

/**
 * Union of every week that exists anywhere in the app — weekly_insights,
 * growth_plans, growth_actions, and growth_opportunities — normalised to
 * canonical Mondays and sorted newest-first. Used to keep the week picker
 * identical across all three tabs.
 */
export async function getAllWeeks(siteId: string): Promise<string[]> {
  const supabase = getClient();
  const [insightsRes, plansRes, actionsRes, oppsRes] = await Promise.all([
    supabase.from('weekly_insights').select('week_start'),
    supabase.from('growth_plans').select('week_start').eq('site_id', siteId),
    supabase.from('growth_actions').select('week_start').eq('site_id', siteId),
    supabase.from('growth_opportunities').select('week_start').eq('site_id', siteId),
  ]);
  const all = new Set<string>([getCurrentWeekStart()]);
  for (const res of [insightsRes, plansRes, actionsRes, oppsRes]) {
    for (const r of (res.data as { week_start: string }[] | null) ?? []) {
      if (r.week_start) all.add(calendarWeekStart(r.week_start));
    }
  }
  return [...all].sort((a, b) => b.localeCompare(a));
}

export interface GrowthPageData {
  site: Site;
  weekStart: string;
  /** All enabled sites — used by the site switcher. */
  allSites: Site[];
  plan: GrowthPlan | null;
  opportunities: GrowthOpportunity[];
  actions: GrowthAction[];
  /** Most recent gsc_rows.synced_at for this site (null if never synced). */
  lastSyncedAt: string | null;
  /** Total gsc_rows for this site (0 = never synced). */
  rowCount: number;
  gscDigest: GscDigest;
}

export interface GscDailyPoint {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscTopRow {
  label: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscDigest {
  startDate: string | null;
  endDate: string | null;
  rowsUsed: number;
  totals: {
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    queries: number;
    pages: number;
  };
  daily: GscDailyPoint[];
  topQueries: GscTopRow[];
  topPages: GscTopRow[];
}

const EMPTY_GSC_DIGEST: GscDigest = {
  startDate: null,
  endDate: null,
  rowsUsed: 0,
  totals: {
    clicks: 0,
    impressions: 0,
    ctr: 0,
    position: 0,
    queries: 0,
    pages: 0,
  },
  daily: [],
  topQueries: [],
  topPages: [],
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function selectedWeekEnd(weekStart: string, now: Date = new Date()): string {
  const laggedToday = new Date(now);
  laggedToday.setUTCDate(laggedToday.getUTCDate() - 1);

  const weekEnd = new Date(`${weekStart}T00:00:00Z`);
  if (Number.isNaN(weekEnd.getTime())) return isoDate(laggedToday);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  return isoDate(weekEnd < laggedToday ? weekEnd : laggedToday);
}

function weightedPosition(rows: Pick<GSCRow, 'position' | 'impressions'>[]) {
  const impressionWeight = rows.reduce((sum, r) => sum + (r.impressions ?? 0), 0);
  if (impressionWeight > 0) {
    return (
      rows.reduce((sum, r) => sum + (r.position ?? 0) * (r.impressions ?? 0), 0) /
      impressionWeight
    );
  }
  return rows.length
    ? rows.reduce((sum, r) => sum + (r.position ?? 0), 0) / rows.length
    : 0;
}

function topRows(
  rows: GSCRow[],
  key: 'query' | 'page',
  limit = 8,
): GscTopRow[] {
  const grouped = new Map<string, GSCRow[]>();
  for (const row of rows) {
    const label = row[key];
    if (!label) continue;
    const existing = grouped.get(label);
    if (existing) existing.push(row);
    else grouped.set(label, [row]);
  }

  return [...grouped.entries()]
    .map(([label, items]) => {
      const clicks = items.reduce((sum, r) => sum + (r.clicks ?? 0), 0);
      const impressions = items.reduce((sum, r) => sum + (r.impressions ?? 0), 0);
      return {
        label,
        clicks,
        impressions,
        ctr: impressions > 0 ? clicks / impressions : 0,
        position: weightedPosition(items),
      };
    })
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks)
    .slice(0, limit);
}

async function getGscRowsForDigest(
  siteId: string,
  startDate: string,
  endDate: string,
): Promise<GSCRow[]> {
  const supabase = getClient();
  const pageSize = 1000;
  const page = (from: number) =>
    supabase
      .from('gsc_rows')
      .select('date,query,page,clicks,impressions,ctr,position,country,device,site_id')
      .eq('site_id', siteId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
      .range(from, from + pageSize - 1);

  // Count first, then fetch every page in parallel — far faster than the old
  // sequential one-page-at-a-time loop for a 90-day window of GSC rows.
  const { count, error: countError } = await supabase
    .from('gsc_rows')
    .select('*', { count: 'exact', head: true })
    .eq('site_id', siteId)
    .gte('date', startDate)
    .lte('date', endDate);
  if (countError) throw new Error(`gsc digest count failed: ${countError.message}`);

  const pages = Math.ceil((count ?? 0) / pageSize);
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) => page(i * pageSize)),
  );

  const out: GSCRow[] = [];
  for (const { data, error } of results) {
    if (error) throw new Error(`gsc digest fetch failed: ${error.message}`);
    out.push(...((data as GSCRow[]) ?? []).filter((r) => r.date));
  }
  return out;
}

async function getGscDigest(siteId: string, weekStart: string): Promise<GscDigest> {
  const supabase = getClient();
  const targetEndDate = selectedWeekEnd(weekStart);
  const { data: latest, error: latestError } = await supabase
    .from('gsc_rows')
    .select('date')
    .eq('site_id', siteId)
    .lte('date', targetEndDate)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw new Error(`gsc latest date failed: ${latestError.message}`);

  const endDate = (latest as { date?: string } | null)?.date;
  if (!endDate) return EMPTY_GSC_DIGEST;

  const start = new Date(`${endDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 89);
  const startDate = isoDate(start);

  const rows = await getGscRowsForDigest(siteId, startDate, endDate);
  if (rows.length === 0) return { ...EMPTY_GSC_DIGEST, startDate, endDate };

  const clicks = rows.reduce((sum, r) => sum + (r.clicks ?? 0), 0);
  const impressions = rows.reduce((sum, r) => sum + (r.impressions ?? 0), 0);
  const queries = new Set(rows.map((r) => r.query).filter(Boolean)).size;
  const pages = new Set(rows.map((r) => r.page).filter(Boolean)).size;

  const byDate = new Map<string, GSCRow[]>();
  for (const row of rows) {
    const existing = byDate.get(row.date);
    if (existing) existing.push(row);
    else byDate.set(row.date, [row]);
  }

  const daily = [...byDate.entries()].map(([date, items]) => {
    const dayClicks = items.reduce((sum, r) => sum + (r.clicks ?? 0), 0);
    const dayImpressions = items.reduce((sum, r) => sum + (r.impressions ?? 0), 0);
    return {
      date,
      clicks: dayClicks,
      impressions: dayImpressions,
      ctr: dayImpressions > 0 ? dayClicks / dayImpressions : 0,
      position: weightedPosition(items),
    };
  });

  return {
    startDate,
    endDate,
    rowsUsed: rows.length,
    totals: {
      clicks,
      impressions,
      ctr: impressions > 0 ? clicks / impressions : 0,
      position: weightedPosition(rows),
      queries,
      pages,
    },
    daily,
    topQueries: topRows(rows, 'query'),
    topPages: topRows(rows, 'page'),
  };
}

/**
 * Loads everything `/growth` needs in one hit. We don't auto-compute
 * opportunities here — the page render shouldn't trigger detection. The
 * "Generate plan" route ensures opportunities exist; the page just reflects
 * what's stored.
 */
export async function getGrowthPageData(
  siteId: string,
  weekStart: string,
): Promise<GrowthPageData | null> {
  const supabase = getClient();
  const [siteRes, sitesRes, planRes, opportunities, actionsRes, syncRes, countRes, digest] = await Promise.all([
    supabase.from('sites').select('*').eq('id', siteId).maybeSingle(),
    supabase
      .from('sites')
      .select('*')
      .eq('enabled', true)
      .order('created_at', { ascending: true }),
    supabase
      .from('growth_plans')
      .select('plan')
      .eq('site_id', siteId)
      .eq('week_start', weekStart)
      .maybeSingle(),
    // Same 1000-row cap as gsc_rows applies here — a well-detected week can
    // exceed 1000 opportunities, so this needs getOpportunities' pagination
    // rather than a raw unpaginated select.
    getOpportunities(siteId, weekStart),
    supabase
      .from('growth_actions')
      .select('*')
      .eq('site_id', siteId)
      .order('status_updated_at', { ascending: false }),
    supabase
      .from('gsc_rows')
      .select('synced_at')
      .eq('site_id', siteId)
      .order('synced_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('gsc_rows').select('*', { count: 'exact', head: true }).eq('site_id', siteId),
    getGscDigest(siteId, weekStart),
  ]);

  if (siteRes.error) throw new Error(`site fetch failed: ${siteRes.error.message}`);
  const site = siteRes.data as Site | null;
  if (!site) return null;

  return {
    site,
    weekStart,
    allSites: (sitesRes.data as Site[]) ?? [],
    plan: ((planRes.data as { plan: GrowthPlan } | null)?.plan) ?? null,
    opportunities,
    actions: (actionsRes.data as GrowthAction[]) ?? [],
    lastSyncedAt: ((syncRes.data as { synced_at: string } | null)?.synced_at) ?? null,
    rowCount: countRes.count ?? 0,
    gscDigest: digest,
  };
}

export const OPP_LABEL: Record<GrowthOpportunityType, string> = {
  near_win: 'Near-wins',
  low_ctr: 'High-impression, low CTR',
  gap: 'Content gaps',
  declining: 'Declining pages',
  proven_expander: 'Proven traffic expanders',
};

export const OPP_HINT: Record<GrowthOpportunityType, string> = {
  near_win: 'Page 2–3 with real impressions — push to page 1.',
  low_ctr: 'On page 1 but the listing under-clicks — fix title / meta / intent match.',
  gap: 'Real demand but no page ranks well — create new content.',
  declining: 'Losing clicks vs the prior 28d — refresh, link, or fix indexing.',
  proven_expander: 'Pages already pulling consistent clicks — cluster, link, distribute.',
};

export function groupOpportunities(
  opportunities: GrowthOpportunity[],
): Record<GrowthOpportunityType, GrowthOpportunity[]> {
  const out: Record<GrowthOpportunityType, GrowthOpportunity[]> = {
    near_win: [],
    low_ctr: [],
    gap: [],
    declining: [],
    proven_expander: [],
  };
  for (const o of opportunities) out[o.type].push(o);
  return out;
}
