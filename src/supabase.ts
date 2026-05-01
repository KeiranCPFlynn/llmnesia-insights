import { createClient } from '@supabase/supabase-js';
import type { HistoricalInsight, WeeklyInsight } from './types.js';

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  return createClient(url, key);
}

export async function getRecentInsights(limit = 6): Promise<HistoricalInsight[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('weekly_insights')
    .select('week_start, summary, findings, action_items, open_threads')
    .order('week_start', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Supabase fetch failed: ${error.message}`);
  return ((data as HistoricalInsight[]) ?? []).reverse();
}

export async function insertInsight(insight: Omit<WeeklyInsight, 'id' | 'created_at'>): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.from('weekly_insights').insert(insight);
  if (error) throw new Error(`Supabase insert failed: ${error.message}`);
}
