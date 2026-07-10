import { collectMetrics } from './posthog.js';
import { collectGA4Metrics } from './ga4.js';
import { getCombinedSearchDigest } from './search-digest.js';
import { randomUUID } from 'node:crypto';
import {
  getHistoryBefore,
  getInsightByWeek,
  getRecentInsights,
  getStandingCaveats,
  insertInsight,
  updateAnalysis,
} from './supabase.js';
import { analyseMetrics } from './analyse.js';
import type { LlmProvider } from './llm.js';
import type {
  AnalysisResult,
  Correction,
  MetricsSnapshot,
  StandingCaveat,
  WeeklyInsight,
} from './types.js';

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Standing caveats share the `Correction` shape, so they slot straight into
 * the analysis prompt's existing caveat/context machinery — this just drops
 * the store-only fields (`active`, `updated_at`) the analyser doesn't read.
 */
function standingCaveatsAsCorrections(caveats: StandingCaveat[]): Correction[] {
  return caveats.map((c) => ({
    id: c.id,
    created_at: c.created_at,
    kind: c.kind,
    affected_metric: c.affected_metric,
    note: c.note,
  }));
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

/**
 * The CURRENT, in-progress calendar week — Monday of this week through today.
 * Used by the mid-week "Update all" refresh so the founder can watch the week
 * fill in day by day. `weekStart` is this week's Monday (so it upserts into the
 * same row Monday's completed-week cron will later finalize); `weekEnd` is
 * today, giving a week-to-date data window. `daysElapsed` (1–7) drives the
 * partial-week framing in the analysis so incomplete totals aren't misread.
 */
export function getCurrentWeek(now: Date = new Date()): {
  weekStart: string;
  weekEnd: string;
  daysElapsed: number;
} {
  const day = now.getUTCDay(); // 0=Sun … 6=Sat
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - daysSinceMonday);
  return {
    weekStart: formatDate(monday),
    weekEnd: formatDate(now),
    daysElapsed: daysSinceMonday + 1,
  };
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
  /**
   * 'complete' (default) analyses the most recently finished Mon–Sun week —
   * the weekly cron and normal "Run analysis now". 'current' analyses the
   * in-progress week to date, for mid-week "Update all" refreshes. An explicit
   * `weekStart` always wins and is treated as a completed week.
   */
  mode?: 'complete' | 'current';
  dryRun?: boolean;
  log?: (msg: string) => void;
  provider?: LlmProvider | string | null;
  generationContext?: string | null;
}): Promise<PipelineResult> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const current = !opts.weekStart && opts.mode === 'current' ? getCurrentWeek() : null;
  const { weekStart, weekEnd } = opts.weekStart
    ? getWeekFromArg(opts.weekStart)
    : current ?? getDefaultWeek();
  const partial = current
    ? { as_of: current.weekEnd, days_elapsed: current.daysElapsed }
    : null;

  log(
    `LLMnesia insights — ${weekStart} → ${weekEnd}${partial ? ` [WEEK-TO-DATE · day ${partial.days_elapsed}/7]` : ''}${opts.dryRun ? ' [DRY RUN]' : ''}`,
  );

  const [posthogMetrics, ga4, history, existingRow, searchPerformance, standingCaveats] =
    await Promise.all([
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
      // Persistent "known facts" the founder has confirmed once and should not
      // be re-flagged every week. Fail-soft: if the table doesn't exist yet
      // (pre-DDL) the weekly run must still complete.
      getStandingCaveats().catch((e) => {
        log(`Standing caveats skipped: ${e instanceof Error ? e.message : String(e)}`);
        return [];
      }),
    ]);
  const metrics = {
    ...posthogMetrics,
    ga4,
    ...(searchPerformance ? { search_performance: searchPerformance } : {}),
    ...(partial ? { partial } : {}),
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
  // Per-week corrections are the only ones persisted onto this row. Standing
  // caveats are cross-week and live in their own table, so they're merged into
  // the analysis input each run but never copied onto the week's `corrections`
  // (that would duplicate them onto every row and let edits/removals drift).
  const corrections = [
    ...(existingRow?.corrections ?? []),
    ...(generationCorrection ? [generationCorrection] : []),
  ];
  const analysisCorrections = [...standingCaveatsAsCorrections(standingCaveats), ...corrections];

  const { result: analysis, modelUsed } = await analyseMetrics(
    metrics,
    history,
    analysisCorrections,
    opts.provider,
    partial,
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

  const [history, standingCaveats] = await Promise.all([
    getHistoryBefore(weekStart, 6),
    getStandingCaveats().catch(() => [] as StandingCaveat[]),
  ]);
  const { result, modelUsed } = await analyseMetrics(
    row.metrics_snapshot,
    history,
    [...standingCaveatsAsCorrections(standingCaveats), ...(row.corrections ?? [])],
    provider,
  );

  await updateAnalysis(weekStart, result, modelUsed);
  return result;
}
