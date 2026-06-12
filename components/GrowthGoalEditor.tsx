'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function GrowthGoalEditor({
  siteId,
  initialGoal,
}: {
  siteId: string;
  initialGoal?: string | null;
}) {
  const router = useRouter();
  const [goal, setGoal] = useState(initialGoal ?? '');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const changed = goal.trim() !== (initialGoal ?? '').trim();

  async function save() {
    if (saving) return;
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch('/api/growth/goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, growthGoal: goal }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);
      setStatus('Saved. Future plans will use this goal.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-neutral-800/80 bg-neutral-900/70 p-4 shadow-[0_10px_28px_rgba(0,0,0,0.16)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Growth goal
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-500">
            Persistent objective for this site’s Growth planner.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving || !changed}
          className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save goal'}
        </button>
      </div>
      <textarea
        value={goal}
        rows={3}
        maxLength={2000}
        onChange={(e) => {
          setGoal(e.target.value);
          setStatus(null);
          setError(null);
        }}
        placeholder="Example: Build qualified organic traffic and product discovery. Prioritize helpful content, search visibility, and install-intent pages; avoid monetization recommendations until the active user base is larger."
        className="mt-3 max-h-48 min-h-24 w-full resize-y rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm leading-relaxed text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-600">{goal.length.toLocaleString('en-GB')} / 2,000</p>
        {status && <p className="text-xs text-emerald-400">{status}</p>}
        {error && <p className="text-xs text-rose-400">{error}</p>}
      </div>
    </section>
  );
}
