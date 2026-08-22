import { collectMetrics } from './posthog.js';
import { collectGA4Metrics } from './ga4.js';
import { getCombinedSearchDigest, syncSearchForInsights } from './search-digest.js';
import { randomUUID } from 'node:crypto';
import {
  appendLedgerEntries,
  getLatestEvidenceSnapshotBefore,
  getHistoryBefore,
  getInsightByWeek,
  getRecentInsights,
  getStrategyLedger,
  getStandingCaveats,
  insertInsight,
  saveContextSources,
  saveEvidenceDelta,
  upsertStrategyLedger,
  updateAnalysis,
} from './supabase.js';
import { analyseMetrics } from './analyse.js';
import { computeEvidenceDelta } from './evidence-delta.js';
import { collectGitContext } from './git-context.js';
import { createInitialLedgerState, updateLedger } from './ledger.js';
import { collectMcpContext } from './mcp-context.js';
import { readBrief } from './brief.js';
import type { LlmProvider } from './llm.js';
import type {
  AnalysisResult,
  Correction,
  MetricsSnapshot,
  StandingCaveat,
  StrategyResult,
  WeeklyInsight,
} from './types.js';
import {
  getCurrentWeek,
  getDefaultWeek,
  getWeekFromArg,
} from './reporting-period.js';

export { getCurrentWeek, getDefaultWeek, getWeekFromArg } from './reporting-period.js';

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
 * The current Monday–today reporting window. This is the dashboard default:
 * founders should see the freshest available data rather than last week's
 * completed report. The snapshot is explicitly marked partial until Sunday.
 */
/**
 * The CURRENT, in-progress calendar week — Monday of this week through today.
 * Used by the mid-week "Update all" refresh so the founder can watch the week
 * fill in day by day. `weekStart` is this week's Monday (so it upserts into the
 * same row Monday's completed-week cron will later finalize); `weekEnd` is
 * today, giving a week-to-date data window. `daysElapsed` (1–7) drives the
 * partial-week framing in the analysis so incomplete totals aren't misread.
 */
export interface PipelineResult {
  weekStart: string;
  weekEnd: string;
  metrics: MetricsSnapshot & { ga4: unknown };
  analysis: AnalysisResult;
  modelUsed: string;
  /** Present when the ledger editor completed; weekly_insights.strategy is dual-written for compatibility. */
  ledgerUpdated?: boolean;
  /** A provider/capacity failure after analysis; the evidence was still saved. */
  ledgerWarning?: string;
  saved: boolean;
}

function strategyFromLedger(
  editor: Awaited<ReturnType<typeof updateLedger>>['editor'],
  state: Awaited<ReturnType<typeof updateLedger>>['state'],
  modelUsed: string,
): StrategyResult {
  return {
    thesis: editor.narrative,
    monetization: {
      model: state.monetization_design.model,
      what_to_gate: state.monetization_design.what_to_gate,
      pricing_hypothesis: state.monetization_design.pricing_hypothesis,
    },
    recommendations: editor.weekly_recommendations.map((recommendation) => {
      const rawHandoff = recommendation.handoff;
      const handoff = rawHandoff && typeof rawHandoff === 'object' ? rawHandoff : {};
      return {
        ...recommendation,
        id: randomUUID(),
        handoff: {
          ...(typeof handoff.coding_agent_prompt === 'string'
            ? { coding_agent_prompt: handoff.coding_agent_prompt }
            : {}),
          ...(Array.isArray(handoff.founder_steps)
            ? { founder_steps: handoff.founder_steps.filter((step): step is string => typeof step === 'string') }
            : {}),
        },
        metrics_to_watch: Array.isArray(recommendation.metrics_to_watch)
          ? recommendation.metrics_to_watch.filter((metric): metric is string => typeof metric === 'string')
          : [],
      };
    }),
    risks: editor.risks,
    experiments: editor.experiments,
    model_used: modelUsed,
    generated_at: new Date().toISOString(),
  };
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
   * 'current' (default) analyses the in-progress calendar week through today.
   * 'complete' is reserved for intentionally refreshing a finished Mon–Sun
   * report. An explicit `weekStart` always wins and is treated as completed.
   */
  mode?: 'complete' | 'current';
  dryRun?: boolean;
  log?: (msg: string) => void;
  provider?: LlmProvider | string | null;
  model?: string;
  generationContext?: string | null;
}): Promise<PipelineResult> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const current = !opts.weekStart && opts.mode !== 'complete' ? getCurrentWeek() : null;
  const { weekStart, weekEnd } = opts.weekStart
    ? getWeekFromArg(opts.weekStart)
    : current ?? getDefaultWeek();
  const partial = current
    ? { as_of: current.weekEnd, days_elapsed: current.daysElapsed }
    : null;

  log(
    `LLMnesia insights — ${weekStart} → ${weekEnd}${partial ? ` [WEEK-TO-DATE · day ${partial.days_elapsed}/7]` : ''}${opts.dryRun ? ' [DRY RUN]' : ''}`,
  );

  // Refresh Google + Bing search rows first so the digest reads current data
  // instead of whatever the last growth sync happened to leave behind. Kicked
  // off up front so it overlaps PostHog/GA4 collection; awaited before the
  // digest reads the rows. Fully fail-soft inside syncSearchForInsights.
  const searchSync = syncSearchForInsights(log);

  // `undefined` means the ledger read failed; `null` means it succeeded and no
  // row exists. Keeping those states distinct prevents a transient read error
  // from being mistaken for a first run and overwriting the living strategy
  // with a fresh default document.
  let ledgerReadFailure: string | null = null;
  const [posthogMetrics, ga4, history, existingRow, standingCaveats, priorSnapshot, persistedLedger] = await Promise.all([
    collectMetrics(weekStart, weekEnd),
    collectGA4Metrics(weekStart, weekEnd),
    getRecentInsights(6),
    getInsightByWeek(weekStart),
    // Persistent "known facts" the founder has confirmed once and should not
    // be re-flagged every week. Fail-soft: if the table doesn't exist yet
    // (pre-DDL) the weekly run must still complete.
    getStandingCaveats().catch((e) => {
      log(`Standing caveats skipped: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }),
    getLatestEvidenceSnapshotBefore(weekStart).catch((e) => {
      log(`Evidence history skipped: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }),
    getStrategyLedger().catch((e) => {
      ledgerReadFailure = e instanceof Error ? e.message : String(e);
      log(`Strategy ledger read failed: ${ledgerReadFailure}`);
      return undefined;
    }),
  ]);

  // Ensure the just-synced rows are committed before we aggregate them. The
  // sync is fail-soft, but await it here so a slow sync doesn't race the digest.
  await searchSync;

  // Top-of-funnel search visibility (Google + Bing). Fail-soft: a missing
  // growth table or unconfigured search source must never break the run.
  const searchPerformance = await getCombinedSearchDigest(weekStart, weekEnd).catch((e) => {
    log(`Search digest skipped: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  });
  const metrics = {
    ...posthogMetrics,
    ga4,
    ...(searchPerformance ? { search_performance: searchPerformance } : {}),
    ...(partial ? { partial } : {}),
  };
  const evidenceDelta = computeEvidenceDelta(metrics, priorSnapshot);
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
    opts.model,
    partial,
  );

  // Ledger editing deliberately runs after analysis: it gets the structured
  // metric delta plus the analyst's qualitative interpretation. A ledger
  // outage must not discard the weekly insight, so this is fail-soft.
  let ledgerUpdate: Awaited<ReturnType<typeof updateLedger>> | null = null;
  let ledgerModelUsed: string | null = null;
  let ledgerWarning: string | undefined;
  let gitDigests: ReturnType<typeof collectGitContext> = [];
  let mcpDigest: Awaited<ReturnType<typeof collectMcpContext>> = null;
  try {
    if (ledgerReadFailure || persistedLedger === undefined) {
      throw new Error(
        `Existing Strategy Ledger could not be read, so it was left unchanged: ${ledgerReadFailure ?? 'unknown read error'}`,
      );
    }
    const ledgerState = persistedLedger ?? createInitialLedgerState();
    const since = priorSnapshot?.week_end ?? weekStart;
    [gitDigests, mcpDigest] = await Promise.all([
      Promise.resolve(collectGitContext(since)),
      collectMcpContext(since),
    ]);
    const brief = await readBrief();
    ledgerUpdate = await updateLedger({
      weekStart,
      weekEnd,
      state: ledgerState,
      evidence: evidenceDelta,
      analysis,
      brief,
      gitContext: gitDigests,
      mcpContext: mcpDigest,
      founderContext: trimmedContext,
      provider: opts.provider,
      model: opts.model,
    });
    ledgerModelUsed = ledgerUpdate.modelUsed;
    log(`Strategy ledger prepared (${ledgerUpdate.editor.patches.length} patch${ledgerUpdate.editor.patches.length === 1 ? '' : 'es'}).`);
  } catch (e) {
    ledgerWarning = e instanceof Error ? e.message : String(e);
    log(`Strategy ledger skipped: ${ledgerWarning}`);
  }

  if (opts.dryRun) {
    log('Dry run complete. No writes.');
    return { weekStart, weekEnd, metrics, analysis, modelUsed, ledgerUpdated: !!ledgerUpdate, ledgerWarning, saved: false };
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
    ...(ledgerUpdate ? { strategy: strategyFromLedger(ledgerUpdate.editor, ledgerUpdate.state, ledgerModelUsed ?? modelUsed) } : {}),
    ...(corrections.length ? { corrections } : {}),
  };
  await insertInsight(insight);
  log('Saved to Supabase.');

  // The historical insight is the required write. New ledger tables may not
  // have been migrated yet, so retain the old pipeline's availability while
  // making every successful ledger update durable.
  await saveEvidenceDelta(evidenceDelta, metrics).catch((e) => {
    log(`Evidence delta save skipped: ${e instanceof Error ? e.message : String(e)}`);
  });
  let ledgerPersisted = false;
  if (ledgerUpdate) {
    try {
      // Persist the living document first. Audit/context rows must never claim
      // a patch landed when the singleton state itself failed to save.
      await upsertStrategyLedger(ledgerUpdate.state, ledgerModelUsed ?? modelUsed);
      ledgerPersisted = true;
      try {
        await Promise.all([
          appendLedgerEntries(ledgerUpdate.entries),
          saveContextSources([
            ...gitDigests.map((digest) => ({ week_start: weekStart, source_type: 'git' as const, repo: digest.repo, digest })),
            ...(mcpDigest ? [{ week_start: weekStart, source_type: 'mcp' as const, repo: null, digest: mcpDigest }] : []),
          ]),
        ]);
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        ledgerWarning = `The Strategy Ledger was saved, but part of its audit/context history was not: ${detail}`;
        log(ledgerWarning);
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      ledgerWarning = `Strategy Ledger changes were generated but could not be saved: ${detail}`;
      log(ledgerWarning);
    }
  }

  return { weekStart, weekEnd, metrics, analysis, modelUsed, ledgerUpdated: ledgerPersisted, ledgerWarning, saved: true };
}

/**
 * Re-run Claude analysis for an already-stored week using its SAVED metrics
 * snapshot (no PostHog/GA4 re-fetch) plus the week's confirmed corrections.
 * Used after the founder flags skewed data so the report stops mis-reading it.
 */
export async function reanalyseWeek(
  weekStart: string,
  provider?: LlmProvider | string | null,
  model?: string,
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
    model,
  );

  await updateAnalysis(weekStart, result, modelUsed);
  return result;
}
