import { collectMetrics } from './posthog.js';
import { collectGA4Metrics } from './ga4.js';
import {
  getHistoryBefore,
  getInsightByWeek,
  getRecentInsights,
  insertInsight,
  updateAnalysis,
} from './supabase.js';
import { analyseMetrics } from './analyse.js';
import type { LlmProvider } from './llm.js';
import type { AnalysisResult, MetricsSnapshot } from './types.js';

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The completed week is Mon–Sun ending yesterday (the pipeline runs on a Monday).
 */
export function getDefaultWeek(): { weekStart: string; weekEnd: string } {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setUTCDate(today.getUTCDate() - 1); // Sunday

  const weekEndDate = yesterday;
  const weekStartDate = new Date(weekEndDate);
  weekStartDate.setUTCDate(weekEndDate.getUTCDate() - 6); // Monday

  return { weekStart: formatDate(weekStartDate), weekEnd: formatDate(weekEndDate) };
}

export function getWeekFromArg(weekStartArg: string): { weekStart: string; weekEnd: string } {
  const start = new Date(`${weekStartArg}T00:00:00Z`);
  if (isNaN(start.getTime())) throw new Error(`Invalid week date: ${weekStartArg}`);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { weekStart: formatDate(start), weekEnd: formatDate(end) };
}

export interface PipelineResult {
  weekStart: string;
  weekEnd: string;
  metrics: MetricsSnapshot & { ga4: unknown };
  analysis: AnalysisResult;
  modelUsed: string;
  saved: boolean;
}

/**
 * Collect metrics → run Claude analysis → persist to Supabase.
 * Shared by the CLI (src/index.ts) and the dashboard API route.
 *
 * @param weekStart Optional ISO Monday date to backfill a specific week.
 * @param dryRun    When true, skips the Supabase write.
 * @param log       Optional logger (defaults to console.log).
 */
export async function runPipeline(opts: {
  weekStart?: string | null;
  dryRun?: boolean;
  log?: (msg: string) => void;
  provider?: LlmProvider | string | null;
}): Promise<PipelineResult> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const { weekStart, weekEnd } = opts.weekStart
    ? getWeekFromArg(opts.weekStart)
    : getDefaultWeek();

  log(`LLMnesia insights — ${weekStart} → ${weekEnd}${opts.dryRun ? ' [DRY RUN]' : ''}`);

  const [posthogMetrics, ga4, history] = await Promise.all([
    collectMetrics(weekStart, weekEnd),
    collectGA4Metrics(weekStart, weekEnd),
    getRecentInsights(6),
  ]);
  const metrics = { ...posthogMetrics, ga4 };

  const { result: analysis, modelUsed } = await analyseMetrics(
    metrics,
    history,
    [],
    opts.provider,
  );

  if (opts.dryRun) {
    log('Dry run complete. No writes.');
    return { weekStart, weekEnd, metrics, analysis, modelUsed, saved: false };
  }

  await insertInsight({
    week_start: weekStart,
    week_end: weekEnd,
    metrics_snapshot: metrics,
    headline: analysis.headline,
    summary: analysis.summary,
    findings: analysis.findings,
    action_items: analysis.action_items,
    open_threads: analysis.open_threads,
    resolved_threads: analysis.resolved_threads,
    model_used: modelUsed,
  });
  log('Saved to Supabase.');

  return { weekStart, weekEnd, metrics, analysis, modelUsed, saved: true };
}

/**
 * Re-run Claude analysis for an already-stored week using its SAVED metrics
 * snapshot (no PostHog/GA4 re-fetch) plus the week's confirmed corrections.
 * Used after the founder flags skewed data so the report stops mis-reading it.
 */
export async function reanalyseWeek(
  weekStart: string,
  provider?: LlmProvider | string | null,
): Promise<AnalysisResult> {
  const row = await getInsightByWeek(weekStart);
  if (!row) throw new Error(`No insight for week ${weekStart}`);

  const history = await getHistoryBefore(weekStart, 6);
  const { result, modelUsed } = await analyseMetrics(
    row.metrics_snapshot,
    history,
    row.corrections ?? [],
    provider,
  );

  await updateAnalysis(weekStart, result, modelUsed);
  return result;
}
