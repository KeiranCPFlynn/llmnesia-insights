'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActionCard, boardStatus, type BoardStatus } from './ActionCard';
import type { GrowthAction, GrowthRecommendation } from '../src/types.js';

const STATUS_ORDER: BoardStatus[] = ['planned', 'monitoring', 'needs_adjustment', 'completed', 'ignored'];

const STATUS_LABEL: Record<BoardStatus, string> = {
  planned: 'Planned',
  actioned: 'Actioned',
  monitoring: 'Actioned + monitoring',
  needs_adjustment: 'Needs adjustment',
  completed: 'Done',
  ignored: 'Ignored',
};

const STATUS_OPTIONS: { value: BoardStatus; label: string }[] = [
  { value: 'planned', label: 'Planned' },
  { value: 'monitoring', label: 'Actioned + monitoring' },
  { value: 'needs_adjustment', label: 'Needs adjustment' },
  { value: 'completed', label: 'Done' },
  { value: 'ignored', label: 'Discard' },
];

function groupActions(actions: GrowthAction[]): Record<BoardStatus, GrowthAction[]> {
  const out: Record<string, GrowthAction[]> = {};
  for (const s of STATUS_ORDER) out[s] = [];
  for (const action of actions) {
    const status = boardStatus(action.status);
    out[status === 'actioned' ? 'monitoring' : status].push(action);
  }
  return out as Record<BoardStatus, GrowthAction[]>;
}

export function ActionBoard({
  actions,
  recommendations,
}: {
  actions: GrowthAction[];
  recommendations: GrowthRecommendation[];
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkStatus, setBulkStatus] = useState<BoardStatus>('monitoring');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recommendationsById = useMemo(() => {
    const out = new Map<string, GrowthRecommendation>();
    for (const rec of recommendations) out.set(rec.id, rec);
    return out;
  }, [recommendations]);

  const actionsByStatus = useMemo(() => groupActions(actions), [actions]);
  const selectedCount = selectedIds.size;

  function setSelected(id: string, selected: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function setGroupSelected(group: GrowthAction[], selected: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const action of group) {
        if (selected) next.add(action.id);
        else next.delete(action.id);
      }
      return next;
    });
  }

  async function applyBulkStatus() {
    if (selectedCount === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/growth/actions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selectedIds], status: bulkStatus }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed');
      setSelectedIds(new Set());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="sticky top-3 z-10 rounded-lg border border-neutral-800 bg-neutral-950/95 p-3 shadow-[0_12px_34px_rgba(0,0,0,0.22)] backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-24 text-sm font-medium text-neutral-300">
            {selectedCount} selected
          </span>
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value as BoardStatus)}
            disabled={busy}
            className="rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-200 outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            onClick={applyBulkStatus}
            disabled={selectedCount === 0 || busy}
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Apply to selected'}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            disabled={selectedCount === 0 || busy}
            className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            Clear
          </button>
          {error && <span className="text-sm text-rose-400">{error}</span>}
        </div>
      </div>

      {STATUS_ORDER.map((status) => {
        const group = actionsByStatus[status];
        if (!group || group.length === 0) return null;

        const selectedInGroup = group.filter((action) => selectedIds.has(action.id)).length;
        const groupSelected = selectedInGroup === group.length;

        return (
          <div key={status}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {STATUS_LABEL[status]} · {group.length}
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-neutral-400 hover:text-neutral-200">
                <input
                  type="checkbox"
                  checked={groupSelected}
                  ref={(node) => {
                    if (node) node.indeterminate = selectedInGroup > 0 && !groupSelected;
                  }}
                  onChange={(e) => setGroupSelected(group, e.target.checked)}
                  className="h-4 w-4 rounded border-neutral-700 bg-neutral-950 accent-emerald-500"
                />
                Select group
              </label>
            </div>
            <ul className="space-y-3">
              {group.map((action) => (
                <ActionCard
                  key={action.id}
                  action={action}
                  recommendation={
                    action.recommendation_id
                      ? recommendationsById.get(action.recommendation_id)
                      : undefined
                  }
                  selected={selectedIds.has(action.id)}
                  onSelectedChange={(selected) => setSelected(action.id, selected)}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
