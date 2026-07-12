'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { StandingCaveat } from '../src/types.js';
import { useProvider } from './ProviderSelect';
import { ProgressBar, useElapsed } from './ProgressBar';

/**
 * Dedicated "known facts" manager. Standing caveats/context notes persist
 * across every week's analysis, so a confirmed non-issue (e.g. the PostHog vs
 * GA4 install gap) is never re-flagged from scratch. Distinct from the per-week
 * chat corrections: those adjust one report; these adjust all of them.
 */
export function KnownFacts({
  week,
  initial,
}: {
  week: string;
  initial: StandingCaveat[];
}) {
  const router = useRouter();
  const [provider] = useProvider();
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'caveat' | 'context'>('caveat');
  const [metric, setMetric] = useState('');
  const [note, setNote] = useState('');
  const [applyNow, setApplyNow] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMetric, setEditMetric] = useState('');
  const [editNote, setEditNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const elapsed = useElapsed(
    busy === 'add' || busy === 'rerun' || (busy?.startsWith('edit-') ?? false),
  );

  const caveats = initial.filter((c) => c.kind !== 'context');
  const contexts = initial.filter((c) => c.kind === 'context');
  const activeCount = initial.filter((c) => c.active).length;

  async function mutate(
    label: string,
    run: () => Promise<Response>,
  ) {
    if (busy) return;
    setBusy(label);
    setError(null);
    try {
      const res = await run();
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Request failed');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(null);
    }
  }

  async function add() {
    if (!metric.trim() || !note.trim()) {
      setError('Add a short label and the note.');
      return;
    }
    await mutate('add', () =>
      fetch('/api/standing-caveats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          affected_metric: metric,
          note,
          ...(applyNow ? { applyWeek: week, provider } : {}),
        }),
      }),
    );
    setMetric('');
    setNote('');
  }

  function startEdit(c: StandingCaveat) {
    setEditingId(c.id);
    setEditMetric(c.affected_metric);
    setEditNote(c.note);
    setError(null);
  }

  async function saveEdit(c: StandingCaveat) {
    if (!editMetric.trim() || !editNote.trim()) {
      setError('Label and note are both required.');
      return;
    }
    await mutate(`edit-${c.id}`, () =>
      fetch(`/api/standing-caveats/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          affected_metric: editMetric,
          note: editNote,
          applyWeek: week,
          provider,
        }),
      }),
    );
    setEditingId(null);
  }

  async function toggle(c: StandingCaveat) {
    await mutate(`toggle-${c.id}`, () =>
      fetch(`/api/standing-caveats/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !c.active, applyWeek: week, provider }),
      }),
    );
  }

  async function remove(c: StandingCaveat) {
    await mutate(`del-${c.id}`, () =>
      fetch(
        `/api/standing-caveats/${c.id}?applyWeek=${encodeURIComponent(week)}&provider=${provider}`,
        { method: 'DELETE' },
      ),
    );
  }

  const rerunning =
    busy === 'add' || busy === 'rerun' || (busy?.startsWith('edit-') ?? false);

  return (
    <section id="known-facts" className="scroll-mt-36 mb-10">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Known facts
        </h2>
        <span className="rounded-full border border-neutral-700 bg-neutral-800/70 px-2 py-0.5 text-[11px] text-neutral-400">
          {activeCount} active
        </span>
        <div className="h-px flex-1 bg-neutral-800/80" />
        {expanded && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-md border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            {open ? 'Done' : 'Manage'}
          </button>
        )}
        <button
          onClick={() => {
            setExpanded((v) => !v);
            if (expanded) setOpen(false);
          }}
          className="rounded-md border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
        >
          {expanded ? 'Hide' : 'Show'}
        </button>
      </div>

      {expanded && (
        <>
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-neutral-500">
        Facts that hold every week — a confirmed non-issue or real-world context the analysis
        keeps re-discovering. These are injected into every report as authoritative, so the AI
        stops re-flagging them. (Per-week one-offs still go through the chat.)
      </p>

      {initial.length === 0 ? (
        <div className="rounded-lg border border-neutral-800/80 bg-neutral-900/60 px-4 py-3 text-sm text-neutral-500">
          No standing facts yet. Add one below — e.g. “PostHog and GA4 install counts differ by
          design; this is expected, not a bug.”
        </div>
      ) : (
        <div className="space-y-4">
          {[
            { title: 'Data caveats', items: caveats, tone: 'amber' as const },
            { title: 'Context notes', items: contexts, tone: 'sky' as const },
          ]
            .filter((g) => g.items.length > 0)
            .map((g) => (
              <div key={g.title}>
                <h3
                  className={`mb-2 text-xs font-semibold uppercase tracking-wide ${
                    g.tone === 'amber' ? 'text-amber-400' : 'text-sky-400'
                  }`}
                >
                  {g.title}
                </h3>
                <ul className="space-y-2">
                  {g.items.map((c) => (
                    <li
                      key={c.id}
                      className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
                        c.active
                          ? g.tone === 'amber'
                            ? 'border-amber-500/25 bg-amber-500/10 text-amber-100'
                            : 'border-sky-500/25 bg-sky-500/10 text-sky-100'
                          : 'border-neutral-800 bg-neutral-900/50 text-neutral-500'
                      }`}
                    >
                      {open && editingId === c.id ? (
                        <div className="flex-1 space-y-2">
                          <input
                            value={editMetric}
                            onChange={(e) => setEditMetric(e.target.value)}
                            placeholder="Short label"
                            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500"
                          />
                          <textarea
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            rows={3}
                            className="w-full resize-y rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setEditingId(null)}
                              disabled={!!busy}
                              className="rounded border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => saveEdit(c)}
                              disabled={!!busy}
                              className="rounded bg-emerald-600 px-2.5 py-0.5 text-[11px] font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                            >
                              {busy === `edit-${c.id}` ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1">
                            <span className="font-medium">{c.affected_metric}:</span> {c.note}
                            {!c.active && (
                              <span className="ml-2 text-[11px] uppercase">retired</span>
                            )}
                          </div>
                          {open && (
                            <div className="flex shrink-0 gap-2">
                              <button
                                onClick={() => startEdit(c)}
                                disabled={!!busy}
                                className="rounded border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => toggle(c)}
                                disabled={!!busy}
                                className="rounded border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                              >
                                {c.active ? 'Retire' : 'Reactivate'}
                              </button>
                              <button
                                onClick={() => remove(c)}
                                disabled={!!busy}
                                className="rounded border border-rose-500/30 px-2 py-0.5 text-[11px] text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}

      {open && (
        <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/70 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Add a fact
            </span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as 'caveat' | 'context')}
              className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
            >
              <option value="caveat">Data caveat (a number is misleading)</option>
              <option value="context">Context note (real-world fact)</option>
            </select>
          </div>
          <input
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            placeholder="Short label (e.g. Installs — PostHog vs GA4)"
            className="mb-2 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="The fact, stated plainly. e.g. “PostHog and GA4 count installs differently by design — a gap between them is expected and not a bug. Don’t flag it.”"
            className="w-full resize-y rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-neutral-400">
              <input
                type="checkbox"
                checked={applyNow}
                onChange={(e) => setApplyNow(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Re-run this week now so the report reflects it
            </label>
            <button
              onClick={add}
              disabled={!!busy}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy === 'add' ? 'Saving…' : 'Add fact'}
            </button>
          </div>
        </div>
      )}
        </>
      )}

      {rerunning && (applyNow || busy?.startsWith('edit-')) && (
        <div className="mt-3">
          <ProgressBar
            seconds={elapsed}
            label={`Re-running this week on ${
              provider === 'deepseek' ? 'DeepSeek (~3–4 min)' : 'Claude (~1 min)'
            }`}
          />
        </div>
      )}
      {error && <div className="mt-2 text-sm text-rose-400">{error}</div>}
    </section>
  );
}
