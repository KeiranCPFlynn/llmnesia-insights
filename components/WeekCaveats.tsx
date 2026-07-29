'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Correction } from '../src/types.js';
import { formatWeek } from '../lib/format';
import { useProvider, PROVIDER_LABEL } from './ProviderSelect';
import { ProgressBar, useElapsed } from './ProgressBar';

/**
 * This week's confirmed caveats & context — the notes the analysis above was
 * adjusted for. Collapsed by default so a few long entries don't push the
 * report down the page, and each entry is editable/deletable in place (with an
 * optional re-run of the week so the report reflects the change). Distinct from
 * KnownFacts: those hold every week; these adjust just this one report.
 */
export function WeekCaveats({
  week,
  initial,
}: {
  week: string;
  initial: Correction[];
}) {
  const router = useRouter();
  const [provider] = useProvider();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftMetric, setDraftMetric] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [applyNow, setApplyNow] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const elapsed = useElapsed(busy === 'save' || busy === 'delete');

  const caveats = initial.filter((c) => c.kind !== 'context');
  const contexts = initial.filter((c) => c.kind === 'context');

  if (initial.length === 0) return null;

  async function mutate(label: string, run: () => Promise<Response>) {
    if (busy) return;
    setBusy(label);
    setError(null);
    try {
      const res = await run();
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Request failed');
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(null);
    }
  }

  function startEdit(c: Correction) {
    setEditing(c.id);
    setDraftMetric(c.affected_metric);
    setDraftNote(c.note);
    setError(null);
  }

  async function save(c: Correction) {
    if (!draftMetric.trim() || !draftNote.trim()) {
      setError('Label and note are both required.');
      return;
    }
    await mutate('save', () =>
      fetch(`/api/corrections/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week,
          affected_metric: draftMetric,
          note: draftNote,
          ...(applyNow ? { applyWeek: week, provider } : {}),
        }),
      }),
    );
  }

  async function remove(c: Correction) {
    await mutate('delete', () =>
      fetch(
        `/api/corrections/${c.id}?week=${encodeURIComponent(week)}` +
        (applyNow ? `&applyWeek=${encodeURIComponent(week)}&provider=${provider}` : ''),
        { method: 'DELETE' },
      ),
    );
  }

  const rerunning = (busy === 'save' || busy === 'delete') && applyNow;

  const Group = ({
    title,
    items,
    tone,
  }: {
    title: string;
    items: Correction[];
    tone: 'amber' | 'sky';
  }) =>
    items.length === 0 ? null : (
      <div>
        <h3
          className={`mb-2 text-[11px] font-semibold uppercase tracking-wide ${tone === 'amber' ? 'text-amber-400' : 'text-sky-400'
            }`}
        >
          {title}
        </h3>
        <ul className="space-y-2">
          {items.map((c) => (
            <li
              key={c.id}
              className={`rounded-lg border p-3 text-sm ${tone === 'amber'
                ? 'border-amber-500/25 bg-amber-500/10 text-amber-100'
                : 'border-sky-500/25 bg-sky-500/10 text-sky-100'
                }`}
            >
              {editing === c.id ? (
                <div className="space-y-2">
                  <input
                    value={draftMetric}
                    onChange={(e) => setDraftMetric(e.target.value)}
                    placeholder="Short label"
                    className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500"
                  />
                  <textarea
                    value={draftNote}
                    onChange={(e) => setDraftNote(e.target.value)}
                    rows={3}
                    className="w-full resize-y rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-[11px] text-neutral-400">
                      <input
                        type="checkbox"
                        checked={applyNow}
                        onChange={(e) => setApplyNow(e.target.checked)}
                        className="h-3.5 w-3.5"
                      />
                      Re-run this week so the report reflects the edit
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditing(null)}
                        disabled={!!busy}
                        className="rounded border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => save(c)}
                        disabled={!!busy}
                        className="rounded bg-emerald-600 px-2.5 py-0.5 text-[11px] font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {busy === 'save' ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <span className="font-medium">{c.affected_metric}:</span> {c.note}{' '}
                    <span className={tone === 'amber' ? 'text-amber-500/70' : 'text-sky-500/70'}>
                      · {formatWeek(c.created_at.slice(0, 10))}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => startEdit(c)}
                      disabled={!!busy}
                      className="rounded border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(c)}
                      disabled={!!busy}
                      className="rounded border border-rose-500/30 px-2 py-0.5 text-[11px] text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                    >
                      {busy === 'delete' ? '…' : 'Delete'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <section className="mb-4 rounded-lg border border-neutral-800/80 bg-neutral-900/50 shadow-[0_10px_28px_rgba(0,0,0,0.14)]">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-amber-400">
          Data caveats &amp; context
        </span>
        <span className="rounded-full border border-neutral-700 bg-neutral-800/70 px-2 py-0.5 text-[11px] text-neutral-400">
          {caveats.length} caveat{caveats.length === 1 ? '' : 's'}
          {contexts.length > 0 ? ` · ${contexts.length} context` : ''}
        </span>
        <span className="text-[11px] text-neutral-500">— applied to this week&apos;s analysis</span>
        <span className="ml-auto text-xs text-neutral-500">{expanded ? 'Hide' : 'Show'}</span>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-neutral-800 p-4">
          <Group title="Known data caveats" items={caveats} tone="amber" />
          <Group title="Founder context" items={contexts} tone="sky" />
          {rerunning && (
            <ProgressBar
              seconds={elapsed}
              label={`Re-running this week on ${`${PROVIDER_LABEL[provider]}${provider === 'deepseek' ? ' (~3–4 min)' : ' (~1 min)'}`
                }`}
            />
          )}
          {error && <div className="text-sm text-rose-400">{error}</div>}
        </div>
      )}
    </section>
  );
}
