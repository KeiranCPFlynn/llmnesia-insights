import { createClient } from '@supabase/supabase-js';
import type {
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

/** ISO date for the Monday of the current calendar week, in UTC. */
export function getCurrentWeekStart(now: Date = new Date()): string {
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, …
  const offset = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - offset);
  return monday.toISOString().slice(0, 10);
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
  const [siteRes, sitesRes, planRes, oppsRes, actionsRes, syncRes, countRes] = await Promise.all([
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
    supabase
      .from('growth_opportunities')
      .select('*')
      .eq('site_id', siteId)
      .eq('week_start', weekStart)
      .order('score', { ascending: false }),
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
  ]);

  if (siteRes.error) throw new Error(`site fetch failed: ${siteRes.error.message}`);
  const site = siteRes.data as Site | null;
  if (!site) return null;

  return {
    site,
    weekStart,
    allSites: (sitesRes.data as Site[]) ?? [],
    plan: ((planRes.data as { plan: GrowthPlan } | null)?.plan) ?? null,
    opportunities: (oppsRes.data as GrowthOpportunity[]) ?? [],
    actions: (actionsRes.data as GrowthAction[]) ?? [],
    lastSyncedAt: ((syncRes.data as { synced_at: string } | null)?.synced_at) ?? null,
    rowCount: countRes.count ?? 0,
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
