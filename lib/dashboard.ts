import { createClient } from '@supabase/supabase-js';
import type { GA4PropertyMetrics, WeeklyInsight } from '../src/types.js';

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Every stored week, oldest → newest. Used for both the latest-week view
 * and the trend charts, so we only hit Supabase once per page load.
 */
export async function getAllInsights(): Promise<WeeklyInsight[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('weekly_insights')
    .select('*')
    .order('week_start', { ascending: true });

  if (error) throw new Error(`Supabase fetch failed: ${error.message}`);
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
  clickRate: number;
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
      clickRate: pct(m.search_quality?.click_rate ?? 0),
      zeroResultRate: pct(m.search_quality?.zero_result_rate ?? 0),
    };
  });
}
