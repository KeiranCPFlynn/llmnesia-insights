'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type {
  GrowthAction,
  GrowthActionType,
  GrowthOpportunity,
  GrowthOpportunityType,
} from '../src/types.js';

const TYPE_TO_ACTION: Record<GrowthOpportunityType, GrowthActionType> = {
  near_win: 'improve',
  low_ctr: 'title_meta',
  gap: 'create',
  declining: 'refresh',
  proven_expander: 'supporting_cluster',
};

const TYPE_TONE: Record<GrowthOpportunityType, string> = {
  near_win: 'border-emerald-500/30 bg-emerald-500/10',
  low_ctr: 'border-amber-500/30 bg-amber-500/10',
  gap: 'border-violet-500/30 bg-violet-500/10',
  declining: 'border-rose-500/30 bg-rose-500/10',
  proven_expander: 'border-sky-500/30 bg-sky-500/10',
};

function pageOnlyDomain(p: string | null | undefined): string {
  if (!p) return '';
  try {
    const u = new URL(p);
    return u.pathname || '/';
  } catch {
    return p;
  }
}

export function OpportunityList({
  siteId,
  weekStart,
  type,
  label,
  hint,
  opportunities,
  acceptedIds,
}: {
  siteId: string;
  weekStart: string;
  type: GrowthOpportunityType;
  label: string;
  hint: string;
  opportunities: GrowthOpportunity[];
  /** Opportunity ids already materialised as actions — hide the "Accept" button. */
  acceptedIds: string[];
}) {
  const acceptedIdSet = new Set(acceptedIds);

  if (opportunities.length === 0) return null;
  return (
    <details className={`rounded-lg border p-4 shadow-[0_10px_28px_rgba(0,0,0,0.14)] ${TYPE_TONE[type]}`}>
      <summary className="cursor-pointer text-sm font-semibold text-neutral-100">
        {label}{' '}
        <span className="ml-2 rounded-full border border-neutral-700 bg-neutral-950/60 px-2 py-0.5 text-[11px] font-medium text-neutral-300">
          {opportunities.length}
        </span>
        <span className="ml-3 font-normal text-neutral-400">{hint}</span>
      </summary>
      <ul className="mt-3 space-y-3">
        {opportunities.slice(0, 25).map((o) => (
          <OpportunityCard
            key={o.id}
            siteId={siteId}
            weekStart={weekStart}
            opportunity={o}
            accepted={acceptedIdSet.has(o.id)}
          />
        ))}
      </ul>
    </details>
  );
}

function OpportunityCard({
  siteId,
  weekStart,
  opportunity,
  accepted,
}: {
  siteId: string;
  weekStart: string;
  opportunity: GrowthOpportunity;
  accepted: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    if (busy || accepted) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/growth/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId,
          weekStart,
          actionType: TYPE_TO_ACTION[opportunity.type],
          recommendationId: opportunity.id,
          opportunityId: opportunity.id,
          targetQuery: opportunity.target_query,
          targetPage: opportunity.target_page,
          status: 'planned',
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-lg border border-neutral-800/80 bg-neutral-950/45 p-4">
      <div className="mb-1 flex flex-wrap items-baseline gap-2 text-sm">
        {opportunity.target_query && (
          <span className="font-medium text-neutral-100">“{opportunity.target_query}”</span>
        )}
        {opportunity.target_page && (
          <span className="text-neutral-400">
            {opportunity.target_query ? '→ ' : ''}
            <code className="rounded bg-neutral-900 px-1 text-[12px]">{pageOnlyDomain(opportunity.target_page)}</code>
          </span>
        )}
        <span className="ml-auto rounded-full border border-neutral-700 bg-neutral-900/60 px-2 py-0.5 text-[11px] text-neutral-300">
          score {opportunity.score}
        </span>
      </div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-neutral-300">
        {opportunity.evidence.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-2">
        {accepted ? (
          <span className="text-xs text-emerald-400">✓ Accepted as a planned action</span>
        ) : (
          <button
            onClick={accept}
            disabled={busy}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800/80 disabled:opacity-50"
          >
            {busy ? 'Accepting…' : `Plan as “${TYPE_TO_ACTION[opportunity.type].replace('_', ' ')}”`}
          </button>
        )}
        {error && <span className="text-xs text-rose-400">{error}</span>}
      </div>
    </li>
  );
}
