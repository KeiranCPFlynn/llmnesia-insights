import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatWeek } from '../lib/format';
import { UpdateAllButton } from './UpdateAllButton';

/** A plain-language weekly loop so the page tells the founder what to do next. */
export function OperatingLoop({
  hasEvidence,
  recommendationCount,
  openRecommendationCount,
  workspaceHref,
  refreshControls,
  periodStart,
  periodEnd,
  dataAsOf,
  daysElapsed,
}: {
  hasEvidence: boolean;
  recommendationCount: number;
  openRecommendationCount: number;
  workspaceHref: string;
  refreshControls: ReactNode;
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
    ? 'A plan appears after the refresh finishes.'
    : openRecommendationCount > 0
      ? `${openRecommendationCount} recommendation${openRecommendationCount === 1 ? '' : 's'} need your decision.`
      : 'All current recommendations are decided.';

  return (
    <section id="start-here" className="scroll-mt-36 mb-8 rounded-xl border border-emerald-400/25 bg-[linear-gradient(135deg,rgba(6,78,59,0.22),rgba(23,23,23,0.92))] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.22)] sm:p-6">
      <div className="max-w-3xl">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Start here</div>
        <h2 className="mt-2 text-xl font-semibold text-neutral-50">Your weekly operating loop</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-300">
          This is not a dashboard to monitor all day. Use it once a week to choose the next small set of moves, then return after they ship to see what changed.
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
        <div className="text-xs font-semibold text-emerald-300">1 · Start your weekly review</div>
        <p className="mt-1 text-sm leading-relaxed text-neutral-200">Press the button below. The app refreshes the evidence, updates the strategy, and prepares this week’s recommendations.</p>
        <div className="mt-3">{refreshControls}</div>
      </div>

      <ol className="mt-3 grid gap-3 lg:grid-cols-3">
        <li className="rounded-lg border border-white/[0.08] bg-black/15 p-4">
          <div className="text-xs font-semibold text-neutral-400">2 · Understand</div>
          <p className="mt-2 text-sm font-medium text-neutral-100">Read the current direction</p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-400">{hasEvidence ? 'Start with the evidence changes and the one-sentence direction below.' : 'Refresh first; the evidence changes will appear here.'}</p>
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

      <details className="mt-4 border-t border-white/[0.08] pt-4">
        <summary className="cursor-pointer text-sm text-neutral-400 hover:text-neutral-200">Need a mid-week check instead?</summary>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-neutral-500">Use this only when you want a week-to-date pulse before the normal weekly review. It includes incomplete data, so it is not a replacement for the weekly review above.</p>
        <div className="mt-3 max-w-sm"><UpdateAllButton /></div>
      </details>
    </section>
  );
}
