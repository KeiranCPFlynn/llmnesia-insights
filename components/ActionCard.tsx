'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { GrowthAction, GrowthActionStatus, GrowthBrief } from '../src/types.js';

const STATUS_TONE: Record<GrowthActionStatus, string> = {
  idea: 'border-neutral-700 bg-neutral-800/70 text-neutral-300',
  planned: 'border-sky-700 bg-sky-900/40 text-sky-200',
  briefed: 'border-sky-600 bg-sky-900/50 text-sky-100',
  drafted: 'border-amber-700 bg-amber-900/40 text-amber-200',
  published: 'border-emerald-700 bg-emerald-900/40 text-emerald-200',
  updated: 'border-emerald-700 bg-emerald-900/40 text-emerald-200',
  ignored: 'border-neutral-700 bg-neutral-900/60 text-neutral-500',
  completed: 'border-emerald-700 bg-emerald-900/50 text-emerald-100',
  monitoring: 'border-violet-700 bg-violet-900/40 text-violet-200',
};

const STATUSES: GrowthActionStatus[] = [
  'idea',
  'planned',
  'briefed',
  'drafted',
  'published',
  'updated',
  'ignored',
  'completed',
  'monitoring',
];

export function ActionCard({ action }: { action: GrowthAction }) {
  const router = useRouter();
  const [status, setStatus] = useState<GrowthActionStatus>(action.status);
  const [publishedUrl, setPublishedUrl] = useState(action.published_url ?? '');
  const [note, setNote] = useState(action.note ?? '');
  const [brief, setBrief] = useState<GrowthBrief | null>(action.brief ?? null);
  const [busy, setBusy] = useState(false);
  const [briefBusy, setBriefBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function generateBrief() {
    if (briefBusy) return;
    setBriefBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/growth/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId: action.id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      setBrief(j.brief as GrowthBrief);
      // briefed → bump status if it was still 'planned'.
      if (status === 'planned' || status === 'idea') {
        setStatus('briefed');
        await patch({ status: 'briefed' });
      } else {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBriefBusy(false);
    }
  }

  const isPublished = status === 'published' || status === 'updated' || status === 'monitoring';

  return (
    <li className="rounded-lg border border-neutral-800/80 bg-neutral-950/45 p-4 shadow-[0_10px_28px_rgba(0,0,0,0.14)]">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs capitalize ${STATUS_TONE[status]}`}
        >
          {status}
        </span>
        <span className="rounded-full border border-neutral-700 bg-neutral-900/60 px-2 py-0.5 text-[11px] text-neutral-300">
          {action.action_type.replace('_', ' ')}
        </span>
        {action.target_query && (
          <span className="text-sm font-medium text-neutral-100">“{action.target_query}”</span>
        )}
        {action.target_page && (
          <code className="rounded bg-neutral-900 px-1 text-[12px] text-neutral-400">
            {action.target_page}
          </code>
        )}
      </div>

      {action.suggested_title && (
        <p className="text-sm text-neutral-300">
          <span className="font-semibold text-neutral-400">Suggested: </span>
          {action.suggested_title}
        </p>
      )}

      {/* Status changer + published URL + note */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[10rem_1fr_auto]">
        <select
          value={status}
          onChange={(e) => {
            const next = e.target.value as GrowthActionStatus;
            setStatus(next);
            void patch({ status: next });
          }}
          disabled={busy}
          className="rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-200 outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
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
          placeholder={isPublished ? 'Published URL' : 'Published URL (when shipped)'}
          className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10"
        />

        <button
          onClick={generateBrief}
          disabled={briefBusy || busy}
          className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-50"
        >
          {briefBusy ? 'Briefing…' : brief ? 'Re-brief' : 'Generate brief'}
        </button>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => {
          if ((note || null) !== (action.note ?? null)) void patch({ note: note || null });
        }}
        placeholder="Notes (optional)…"
        rows={1}
        className="mt-2 w-full resize-y rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10"
      />

      {brief && (
        <div className="mt-3 rounded-lg border border-neutral-800/80 bg-neutral-950/70 p-4 text-sm leading-relaxed text-neutral-200">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Brief
          </div>
          <p className="mt-1">
            <span className="font-semibold text-neutral-400">Title: </span>
            {brief.suggested_title}
          </p>
          <p className="mt-1">
            <span className="font-semibold text-neutral-400">Intent: </span>
            {brief.search_intent}
          </p>
          <p className="mt-1">
            <span className="font-semibold text-neutral-400">Format: </span>
            {brief.format}
          </p>
          <p className="mt-1">
            <span className="font-semibold text-neutral-400">Angle: </span>
            {brief.angle}
          </p>
          {brief.sections.length > 0 && (
            <div className="mt-2">
              <div className="font-semibold text-neutral-400">Sections</div>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {brief.sections.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {brief.supporting_queries.length > 0 && (
            <p className="mt-2 text-[13px] text-neutral-400">
              Supporting: {brief.supporting_queries.join(' · ')}
            </p>
          )}
          {brief.internal_links.length > 0 && (
            <div className="mt-2">
              <div className="font-semibold text-neutral-400">Internal links</div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px]">
                {brief.internal_links.map((l, i) => (
                  <li key={i}>
                    {l.from && (
                      <code className="rounded bg-neutral-900 px-1 text-[12px]">{l.from}</code>
                    )}
                    {' → '}
                    {l.to && <code className="rounded bg-neutral-900 px-1 text-[12px]">{l.to}</code>}
                    {l.anchor && <span className="text-neutral-500"> — anchor “{l.anchor}”</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-2 text-[13px] text-neutral-500">
            Generated {new Date(brief.generated_at).toLocaleString('en-GB')} · {brief.model_used}
          </p>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
    </li>
  );
}
