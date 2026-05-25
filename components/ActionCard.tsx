'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { GrowthAction, GrowthActionStatus, GrowthRecommendation } from '../src/types.js';

export type BoardStatus = 'planned' | 'actioned' | 'monitoring' | 'needs_adjustment' | 'ignored';

const STATUS_TONE: Record<BoardStatus, string> = {
  planned: 'border-sky-700 bg-sky-900/40 text-sky-200',
  actioned: 'border-emerald-700 bg-emerald-900/40 text-emerald-200',
  monitoring: 'border-violet-700 bg-violet-900/40 text-violet-200',
  needs_adjustment: 'border-amber-700 bg-amber-900/40 text-amber-200',
  ignored: 'border-neutral-700 bg-neutral-900/60 text-neutral-500',
};

const STATUS_LABEL: Record<BoardStatus, string> = {
  planned: 'Planned',
  actioned: 'Actioned',
  monitoring: 'Monitoring',
  needs_adjustment: 'Adjust',
  ignored: 'Ignored',
};

const STATUS_OPTIONS: { value: BoardStatus; label: string }[] = [
  { value: 'planned', label: 'Planned' },
  { value: 'monitoring', label: 'Actioned + monitoring' },
  { value: 'needs_adjustment', label: 'Needs adjustment' },
  { value: 'ignored', label: 'Ignore' },
];

const LEGACY_STATUS: Partial<Record<GrowthActionStatus, BoardStatus>> = {
  idea: 'planned',
  briefed: 'planned',
  drafted: 'planned',
  published: 'actioned',
  updated: 'actioned',
  completed: 'actioned',
};

export function boardStatus(status: GrowthActionStatus): BoardStatus {
  if (
    status === 'planned' ||
    status === 'actioned' ||
    status === 'monitoring' ||
    status === 'needs_adjustment' ||
    status === 'ignored'
  ) {
    return status;
  }
  return LEGACY_STATUS[status] ?? 'planned';
}

export function ActionCard({
  action,
  recommendation,
  selected,
  onSelectedChange,
}: {
  action: GrowthAction;
  recommendation?: GrowthRecommendation;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<BoardStatus>(boardStatus(action.status));
  const [publishedUrl, setPublishedUrl] = useState(action.published_url ?? '');
  const [note, setNote] = useState(action.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus(boardStatus(action.status));
    setPublishedUrl(action.published_url ?? '');
    setNote(action.note ?? '');
  }, [action.note, action.published_url, action.status]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/growth/actions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: action.id, ...body }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(next: BoardStatus) {
    setStatus(next);
    await patch({ status: next });
  }

  async function markActioned() {
    await updateStatus('monitoring');
  }

  return (
    <li className="rounded-lg border border-neutral-800/80 bg-neutral-950/45 p-4 shadow-[0_10px_28px_rgba(0,0,0,0.14)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 gap-3">
          {onSelectedChange && (
            <input
              type="checkbox"
              checked={!!selected}
              onChange={(e) => onSelectedChange(e.target.checked)}
              aria-label={`Select ${action.suggested_title ?? action.target_page ?? 'growth action'}`}
              className="mt-1 h-4 w-4 shrink-0 rounded border-neutral-700 bg-neutral-950 accent-emerald-500"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-0.5 text-xs ${STATUS_TONE[status]}`}>
                {STATUS_LABEL[status]}
              </span>
              <span className="rounded-full border border-neutral-700 bg-neutral-900/60 px-2 py-0.5 text-[11px] capitalize text-neutral-300">
                {action.action_type.replace('_', ' ')}
              </span>
              {action.target_query && (
                <span className="text-sm font-medium text-neutral-100">"{action.target_query}"</span>
              )}
            </div>

            <h3 className="text-base font-semibold leading-snug text-neutral-100">
              {action.suggested_title ?? recommendation?.title ?? action.target_page ?? 'Growth action'}
            </h3>

            {action.target_page && (
              <code className="mt-2 block w-fit max-w-full overflow-hidden text-ellipsis rounded bg-neutral-900 px-1.5 py-1 text-[12px] text-neutral-400">
                {action.target_page}
              </code>
            )}

            {recommendation?.expected_impact && (
              <p className="mt-3 text-sm leading-relaxed text-neutral-300">
                <span className="font-semibold text-neutral-400">Expected outcome: </span>
                {recommendation.expected_impact}
              </p>
            )}
          </div>
        </div>

        {status === 'planned' || status === 'needs_adjustment' ? (
          <button
            onClick={markActioned}
            disabled={busy}
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Mark actioned'}
          </button>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[12rem_1fr]">
        <select
          value={status === 'actioned' ? 'monitoring' : status}
          onChange={(e) => void updateStatus(e.target.value as BoardStatus)}
          disabled={busy}
          className="rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-200 outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <input
          value={publishedUrl}
          onChange={(e) => setPublishedUrl(e.target.value)}
          onBlur={() => {
            if ((publishedUrl || null) !== (action.published_url ?? null)) {
              void patch({ publishedUrl: publishedUrl || null });
            }
          }}
          placeholder="Published URL"
          className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10"
        />
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => {
          if ((note || null) !== (action.note ?? null)) void patch({ note: note || null });
        }}
        placeholder="Note or adjustment"
        rows={1}
        className="mt-2 w-full resize-y rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10"
      />

      {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
    </li>
  );
}
