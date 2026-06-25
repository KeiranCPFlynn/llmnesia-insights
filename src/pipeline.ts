import { collectMetrics } from './posthog.js';
import { collectGA4Metrics } from './ga4.js';
import { getCombinedSearchDigest } from './search-digest.js';
import { randomUUID } from 'node:crypto';
import {
  getHistoryBefore,
  getInsightByWeek,
  getRecentInsights,
  insertInsight,
  updateAnalysis,
} from './supabase.js';
import { analyseMetrics } from './analyse.js';
import type { LlmProvider } from './llm.js';
import type { AnalysisResult, Correction, MetricsSnapshot, WeeklyInsight } from './types.js';

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The most recently completed Monday–Sunday week, regardless of which day the
 * pipeline is run. This prevents ad-hoc weekday runs from creating rolling
 * Thu–Wed (etc.) records that cannot line up with the Growth workspace.
 */
export function getDefaultWeek(): { weekStart: string; weekEnd: string } {
  const today = new Date();
  const daysSinceSunday = today.getUTCDay() === 0 ? 7 : today.getUTCDay();
  const weekEndDate = new Date(today);
  weekEndDate.setUTCDate(today.getUTCDate() - daysSinceSunday);
  const weekStartDate = new Date(weekEndDate);
  weekStartDate.setUTCDate(weekEndDate.getUTCDate() - 6);

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
  generationContext?: string | null;
}): Promise<PipelineResult> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const { weekStart, weekEnd } = opts.weekStart
    ? getWeekFromArg(opts.weekStart)
    : getDefaultWeek();

  log(`LLMnesia insights — ${weekStart} → ${weekEnd}${opts.dryRun ? ' [DRY RUN]' : ''}`);

  const [posthogMetrics, ga4, history, existingRow, searchPerformance] = await Promise.all([
    collectMetrics(weekStart, weekEnd),
    collectGA4Metrics(weekStart, weekEnd),
    getRecentInsights(6),
    getInsightByWeek(weekStart),
    // Top-of-funnel search visibility (Google + Bing). Fail-soft: a missing
    // growth table or unconfigured search source must never break the run.
    getCombinedSearchDigest(weekStart, weekEnd).catch((e) => {
      log(`Search digest skipped: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }),
  ]);
  const metrics = {
    ...posthogMetrics,
    ga4,
    ...(searchPerformance ? { search_performance: searchPerformance } : {}),
  };
  const trimmedContext = opts.generationContext?.trim();
  const generationCorrection: Correction | null = trimmedContext
    ? {
        id: randomUUID(),
        created_at: new Date().toISOString(),
        kind: 'context',
        affected_metric: 'Generation context',
        note: trimmedContext,
        source_excerpt: trimmedContext.slice(0, 280),
      }
    : null;
  const corrections = [
    ...(existingRow?.corrections ?? []),
    ...(generationCorrection ? [generationCorrection] : []),
  ];

  const { result: analysis, modelUsed } = await analyseMetrics(
    metrics,
    history,
    corrections,
    opts.provider,
  );

  if (opts.dryRun) {
    log('Dry run complete. No writes.');
    return { weekStart, weekEnd, metrics, analysis, modelUsed, saved: false };
  }

  const insight: Omit<WeeklyInsight, 'id' | 'created_at'> = {
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
    ...(corrections.length ? { corrections } : {}),
  };
  await insertInsight(insight);
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
