import Link from 'next/link';
import { formatWeek } from '../lib/format';

/** A plain-language operating loop so the page tells the founder what to do next. */
export function OperatingLoop({
  hasEvidence,
  recommendationCount,
  openRecommendationCount,
  workspaceHref,
  periodStart,
  periodEnd,
  dataAsOf,
  daysElapsed,
}: {
  hasEvidence: boolean;
  recommendationCount: number;
  openRecommendationCount: number;
  workspaceHref: string;
  /** The actual dates the current page selection represents. */
  periodStart: string;
  periodEnd: string;
  /** Latest date included in the underlying evidence. */
  dataAsOf: string;
  /** Set only for an in-progress, week-to-date report. */
  daysElapsed?: number;
}) {
  const planReady = recommendationCount > 0;
  const decideLabel = !planReady
    ? 'A plan appears after an agent publishes the review.'
    : openRecommendationCount > 0
      ? `${openRecommendationCount} recommendation${openRecommendationCount === 1 ? '' : 's'} need your decision.`
      : 'All current recommendations are decided.';

  return (
    <section id="start-here" className="scroll-mt-36 mb-8 rounded-xl border border-emerald-400/25 bg-[linear-gradient(135deg,rgba(6,78,59,0.22),rgba(23,23,23,0.92))] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.22)] sm:p-6">
      <div className="max-w-3xl">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Start here</div>
        <h2 className="mt-2 text-xl font-semibold text-neutral-50">Review, decide, then execute</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-300">
          Insights stores the evidence and the published review. Your coding agent inspects the real work, reasons across sources, and writes the next review.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-400/25 bg-sky-500/[0.08] px-4 py-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-300">Selected reporting period</div>
          <div className="mt-1 text-base font-semibold text-neutral-50">
            {formatWeek(periodStart)} → {formatWeek(periodEnd)}
          </div>
        </div>
        <div className="text-sm text-sky-100">
          {daysElapsed
            ? `Live week-to-date · data through ${formatWeek(dataAsOf)} · day ${daysElapsed}/7`
            : `Completed weekly report · data through ${formatWeek(dataAsOf)}`}
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-emerald-400/25 bg-black/15 p-4">
        <div className="text-xs font-semibold text-emerald-300">1 · Run the Insights review</div>
        <p className="mt-1 text-sm leading-relaxed text-neutral-200">
          Open this repository in Codex or Claude Code and say <strong>Run the Insights review.</strong> The agent follows <code className="rounded bg-black/30 px-1">INSIGHTS_AGENT.md</code>, prepares fresh evidence, researches Git and prior conversations, then publishes through validation.
        </p>
      </div>

      <ol className="mt-3 grid gap-3 lg:grid-cols-3">
        <li className="rounded-lg border border-white/[0.08] bg-black/15 p-4">
          <div className="text-xs font-semibold text-neutral-400">2 · Understand</div>
          <p className="mt-2 text-sm font-medium text-neutral-100">Read the current direction</p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-400">{hasEvidence ? 'Start with the evidence changes and the agent’s one-sentence direction below.' : 'Run the review first; evidence changes will appear here.'}</p>
        </li>
        <li className="rounded-lg border border-white/[0.08] bg-black/15 p-4">
          <div className="text-xs font-semibold text-neutral-400">3 · Decide</div>
          <p className="mt-2 text-sm font-medium text-neutral-100">Commit or decline the plan</p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-400">{decideLabel} Use Accept, Defer, Reject, or Mark shipped on each item.</p>
        </li>
        <li className="rounded-lg border border-white/[0.08] bg-black/15 p-4">
          <div className="text-xs font-semibold text-neutral-400">4 · Execute</div>
          <p className="mt-2 text-sm font-medium text-neutral-100">Do the work, then measure</p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-400">Copy a coding prompt or use the supporting workspace for acquisition and raw data.</p>
          <Link href={workspaceHref} className="mt-2 inline-block text-xs font-medium text-emerald-300 hover:text-emerald-200">Open workspace →</Link>
        </li>
      </ol>
    </section>
  );
}
