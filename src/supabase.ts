import { createClient } from '@supabase/supabase-js';
import type {
  AnalysisResult,
  ChatMessage,
  Correction,
  HistoricalInsight,
  Revision,
  StrategyDecision,
  StrategyRecommendation,
  StrategyResult,
  WeeklyInsight,
} from './types.js';

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

/**
 * Insert the week's analysis, or replace it if that week already exists
 * (re-running "Run analysis now", e.g. with a different provider). Only the
 * columns in `insight` are written, so an existing row's `corrections` and
 * `chat` survive a re-run untouched.
 */
export async function insertInsight(insight: Omit<WeeklyInsight, 'id' | 'created_at'>): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from('weekly_insights')
    .upsert(insight, { onConflict: 'week_start' });
  if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
}

export async function getInsightByWeek(weekStart: string): Promise<WeeklyInsight | null> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('weekly_insights')
    .select('*')
    .eq('week_start', weekStart)
    .maybeSingle();

  if (error) throw new Error(`Supabase fetch failed: ${error.message}`);
  return (data as WeeklyInsight) ?? null;
}

/** The N analysed weeks immediately before `weekStart` — context for re-analysis. */
export async function getHistoryBefore(
  weekStart: string,
  limit = 6,
): Promise<HistoricalInsight[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('weekly_insights')
    .select('week_start, summary, findings, action_items, open_threads')
    .lt('week_start', weekStart)
    .order('week_start', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Supabase fetch failed: ${error.message}`);
  return ((data as HistoricalInsight[]) ?? []).reverse();
}

export async function updateAnalysis(
  weekStart: string,
  analysis: AnalysisResult,
  modelUsed: string,
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from('weekly_insights')
    .update({
      headline: analysis.headline,
      summary: analysis.summary,
      findings: analysis.findings,
      action_items: analysis.action_items,
      open_threads: analysis.open_threads,
      resolved_threads: analysis.resolved_threads,
      model_used: modelUsed,
    })
    .eq('week_start', weekStart);

  if (error) throw new Error(`Supabase update failed: ${error.message}`);
}

export async function addCorrection(
  weekStart: string,
  correction: Correction,
): Promise<Correction[]> {
  const row = await getInsightByWeek(weekStart);
  if (!row) throw new Error(`No insight for week ${weekStart}`);
  const corrections = [...(row.corrections ?? []), correction];

  const supabase = getClient();
  const { error } = await supabase
    .from('weekly_insights')
    .update({ corrections })
    .eq('week_start', weekStart);

  if (error) throw new Error(`Supabase update failed: ${error.message}`);
  return corrections;
}

/**
 * Append a pre-change snapshot of the analysis to the week's append-only
 * `revisions` history. Call this BEFORE a correction regenerates the report.
 */
export async function addRevision(weekStart: string, revision: Revision): Promise<void> {
  const row = await getInsightByWeek(weekStart);
  if (!row) throw new Error(`No insight for week ${weekStart}`);
  const revisions = [...(row.revisions ?? []), revision];

  const supabase = getClient();
  const { error } = await supabase
    .from('weekly_insights')
    .update({ revisions })
    .eq('week_start', weekStart);

  if (error) throw new Error(`Supabase update failed: ${error.message}`);
}

export async function saveChat(weekStart: string, chat: ChatMessage[]): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from('weekly_insights')
    .update({ chat })
    .eq('week_start', weekStart);

  if (error) throw new Error(`Supabase update failed: ${error.message}`);
}

// --- PM / revenue strategist ---

/** Store (or replace) the week's PM strategy. */
export async function saveStrategy(
  weekStart: string,
  strategy: StrategyResult,
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from('weekly_insights')
    .update({ strategy })
    .eq('week_start', weekStart);

  if (error) throw new Error(`Supabase update failed: ${error.message}`);
}

/**
 * Upsert a decision for one recommendation (latest decision per
 * recommendation_id wins) into the week's append-only decision log.
 * Returns the full updated list.
 */
export async function setStrategyDecision(
  weekStart: string,
  decision: StrategyDecision,
): Promise<StrategyDecision[]> {
  const row = await getInsightByWeek(weekStart);
  if (!row) throw new Error(`No insight for week ${weekStart}`);
  const others = (row.strategy_decisions ?? []).filter(
    (d) => d.recommendation_id !== decision.recommendation_id,
  );
  const decisions = [...others, decision];

  const supabase = getClient();
  const { error } = await supabase
    .from('weekly_insights')
    .update({ strategy_decisions: decisions })
    .eq('week_start', weekStart);

  if (error) throw new Error(`Supabase update failed: ${error.message}`);
  return decisions;
}

/**
 * Apply a chat-revised recommendation into the stored strategy: replace the
 * one with `replacesId`, or append if new (or no match). Returns the updated
 * strategy. No-op error if there is no strategy yet.
 */
export async function applyStrategyRevision(
  weekStart: string,
  recommendation: StrategyRecommendation,
  replacesId?: string,
): Promise<StrategyResult> {
  const row = await getInsightByWeek(weekStart);
  if (!row) throw new Error(`No insight for week ${weekStart}`);
  if (!row.strategy) throw new Error(`No strategy for week ${weekStart} to revise`);

  const recs = row.strategy.recommendations ?? [];
  const idx = replacesId ? recs.findIndex((r) => r.id === replacesId) : -1;
  const next =
    idx >= 0
      ? recs.map((r, i) => (i === idx ? recommendation : r))
      : [...recs, recommendation];
  const strategy: StrategyResult = { ...row.strategy, recommendations: next };

  const supabase = getClient();
  const { error } = await supabase
    .from('weekly_insights')
    .update({ strategy })
    .eq('week_start', weekStart);

  if (error) throw new Error(`Supabase update failed: ${error.message}`);
  return strategy;
}

/** Prior weeks' strategy theses + decisions (oldest → newest) for continuity. */
export async function getStrategyHistoryBefore(
  weekStart: string,
  limit = 6,
): Promise<{ week_start: string; strategy: StrategyResult | null; strategy_decisions: StrategyDecision[] }[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('weekly_insights')
    .select('week_start, strategy, strategy_decisions')
    .lt('week_start', weekStart)
    .order('week_start', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Supabase fetch failed: ${error.message}`);
  return (
    (data as { week_start: string; strategy: StrategyResult | null; strategy_decisions: StrategyDecision[] }[]) ??
    []
  ).reverse();
}

export async function saveStrategyChat(
  weekStart: string,
  chat: ChatMessage[],
  recommendationId?: string,
): Promise<void> {
  const row = recommendationId ? await getInsightByWeek(weekStart) : null;
  if (recommendationId && !row) throw new Error(`No insight for week ${weekStart}`);

  const supabase = getClient();
  const update = recommendationId
    ? {
        strategy_recommendation_chats: {
          ...(row?.strategy_recommendation_chats ?? {}),
          [recommendationId]: chat,
        },
      }
    : { strategy_chat: chat };
  const { error } = await supabase
    .from('weekly_insights')
    .update(update)
    .eq('week_start', weekStart);

  if (error) throw new Error(`Supabase update failed: ${error.message}`);
}
