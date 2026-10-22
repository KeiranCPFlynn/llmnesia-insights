import { getClient } from '../src/db/query.js';
import type { GA4PropertyMetrics, WeeklyInsight } from '../src/types.js';

/**
 * Every stored week, oldest → newest. Used for both the latest-week view
 * and the trend charts, so we only hit the database once per page load.
 */
export async function getAllInsights(): Promise<WeeklyInsight[]> {
  const db = getClient();
  const { data, error } = await db
    .from('weekly_insights')
    // The index powers week selection and charts. Do not transfer saved chat,
    // revision history, or recommendation threads for every historical week.
    .select('week_start,week_end,metrics_snapshot,headline,summary,findings,action_items,open_threads,resolved_threads,strategy,strategy_goal,strategy_decisions,model_used,created_at')
    .order('week_start', { ascending: true });

  if (error) throw new Error(`weekly_insights fetch failed: ${error.message}`);
  return (data as WeeklyInsight[]) ?? [];
}

export interface TrendPoint {
  week: string;
  installs: number;
  activationRate: number;
  w1Retention: number;
  w4Retention: number;
  wau: number;
  searchesPerWau: number;
  clickRate: number | null;
  zeroResultRate: number;
}

/** Top acquisition channel for a GA4 property (the biggest source of traffic). */
export function topChannel(p?: GA4PropertyMetrics): { name: string; sessions: number } | null {
  if (!p?.acquisition) return null;
  const entries = Object.entries(p.acquisition);
  if (entries.length === 0) return null;
  const [name, sessions] = entries.sort((a, b) => b[1] - a[1])[0];
  return { name, sessions };
}

/** Flatten the nested metrics snapshots into chart-ready rows. */
export function toTrend(insights: WeeklyInsight[]): TrendPoint[] {
  return insights.map((i) => {
    const m = i.metrics_snapshot;
    const pct = (n: number) => Math.round(n * 1000) / 10; // 0.123 → 12.3
    return {
      week: i.week_start,
      installs: m.installs?.total ?? 0,
      activationRate: pct(m.activation?.rate ?? 0),
      w1Retention: pct(m.retention?.w1_rolling?.rate ?? 0),
      w4Retention: pct(m.retention?.w4_rolling?.rate ?? 0),
      wau: m.engagement?.wau ?? 0,
      searchesPerWau: Math.round((m.engagement?.searches_per_wau ?? 0) * 10) / 10,
      clickRate: m.search_quality?.click_rate_definition === 'from_search_v1' && m.search_quality.click_rate != null
        ? pct(m.search_quality.click_rate) : null,
      zeroResultRate: pct(m.search_quality?.zero_result_rate ?? 0),
    };
  });
}
