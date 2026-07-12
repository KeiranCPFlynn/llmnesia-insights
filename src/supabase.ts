import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type {
  AnalysisResult,
  ChatMessage,
  Correction,
  HistoricalInsight,
  Revision,
  StandingCaveat,
  StrategyDecision,
  StrategyRecommendation,
  StrategyResult,
  WeeklyInsight,
} from './types.js';
import { pickStrategyGoal } from './strategy-goal.js';

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
 * Edit a single per-week correction in place (its label/note/kind). Returns the
 * updated corrections array. Used by the editable caveats panel.
 */
export async function updateCorrection(
  weekStart: string,
  id: string,
  patch: Partial<Pick<Correction, 'kind' | 'affected_metric' | 'note'>>,
): Promise<Correction[]> {
  const row = await getInsightByWeek(weekStart);
  if (!row) throw new Error(`No insight for week ${weekStart}`);
  const existing = row.corrections ?? [];
  if (!existing.some((c) => c.id === id)) {
    throw new Error(`No correction ${id} in week ${weekStart}`);
  }
  const corrections = existing.map((c) => (c.id === id ? { ...c, ...patch } : c));

  const supabase = getClient();
  const { error } = await supabase
    .from('weekly_insights')
    .update({ corrections })
    .eq('week_start', weekStart);

  if (error) throw new Error(`Supabase update failed: ${error.message}`);
  return corrections;
}

/** Delete a single per-week correction. Returns the remaining corrections. */
export async function deleteCorrection(
  weekStart: string,
  id: string,
): Promise<Correction[]> {
  const row = await getInsightByWeek(weekStart);
  if (!row) throw new Error(`No insight for week ${weekStart}`);
  const corrections = (row.corrections ?? []).filter((c) => c.id !== id);

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

// --- Standing caveats (persistent, cross-week "known facts") ---

/**
 * Persistent caveats/context notes injected into EVERY week's analysis.
 * `activeOnly` (the default) is what the pipeline uses; the management panel
 * passes `false` to also list retired ones.
 */
export async function getStandingCaveats(activeOnly = true): Promise<StandingCaveat[]> {
  const supabase = getClient();
  let query = supabase
    .from('standing_caveats')
    .select('*')
    .order('created_at', { ascending: true });
  if (activeOnly) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) throw new Error(`standing_caveats fetch failed: ${error.message}`);
  return (data as StandingCaveat[]) ?? [];
}

export async function addStandingCaveat(
  input: Pick<StandingCaveat, 'kind' | 'affected_metric' | 'note'>,
): Promise<StandingCaveat> {
  const supabase = getClient();
  const caveat: StandingCaveat = {
    id: randomUUID(),
    created_at: new Date().toISOString(),
    kind: input.kind === 'context' ? 'context' : 'caveat',
    affected_metric: input.affected_metric,
    note: input.note,
    active: true,
  };
  const { error } = await supabase.from('standing_caveats').insert(caveat);
  if (error) throw new Error(`standing_caveats insert failed: ${error.message}`);
  return caveat;
}

export async function updateStandingCaveat(
  id: string,
  patch: Partial<Pick<StandingCaveat, 'kind' | 'affected_metric' | 'note' | 'active'>>,
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from('standing_caveats')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`standing_caveats update failed: ${error.message}`);
}

export async function deleteStandingCaveat(id: string): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.from('standing_caveats').delete().eq('id', id);
  if (error) throw new Error(`standing_caveats delete failed: ${error.message}`);
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

/** Most recent week before `weekStart` that has a non-empty strategy goal. */
export async function getStrategyGoalBefore(weekStart: string): Promise<string | null> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('weekly_insights')
    .select('strategy_goal')
    .lt('week_start', weekStart)
    .not('strategy_goal', 'is', null)
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Supabase fetch failed: ${error.message}`);
  return (data?.strategy_goal as string | null)?.trim() || null;
}

/**
 * The effective strategy goal for a week: the first non-empty of `preferred`
 * (e.g. a client-supplied goal, then the week's own saved goal), else the most
 * recent prior week's goal (carry-forward), else the stage-aware default. Never
 * returns empty, so callers always have a goal to steer on. Mirrors the pure
 * `resolveStrategyGoal` used on the page, but for callers holding a single week.
 */
export async function getEffectiveStrategyGoal(
  weekStart: string,
  ...preferred: (string | null | undefined)[]
): Promise<string> {
  for (const c of preferred) {
    const t = c?.trim();
    if (t) return t;
  }
  return pickStrategyGoal(await getStrategyGoalBefore(weekStart));
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
