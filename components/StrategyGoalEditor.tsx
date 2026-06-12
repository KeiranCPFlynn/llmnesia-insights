'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProviderSelect, useProvider } from './ProviderSelect';

export function StrategyGoalEditor({
  week,
  initialGoal,
}: {
  week: string;
  initialGoal?: string | null;
}) {
  const router = useRouter();
  const [goal, setGoal] = useState(initialGoal ?? '');
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [rationale, setRationale] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useProvider({
    storageKey: 'llm-provider-strategy',
    fallback: 'openai',
  });
  const changed = goal.trim() !== (initialGoal ?? '').trim();
  const busy = saving || suggesting;

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('llmnesia:strategy-goal-change', {
        detail: { week, goal },
      }),
    );
  }, [week, goal]);

  async function save() {
    if (busy) return;
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch('/api/strategy/goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week, strategyGoal: goal, action: 'save' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);
      setStatus('Saved. Future strategy generations will use this goal.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function suggest() {
    if (busy) return;
    setSuggesting(true);
    setStatus(null);
    setRationale(null);
    setError(null);
    try {
      const res = await fetch('/api/strategy/goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week, strategyGoal: goal, action: 'suggest', provider }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);
      if (typeof body.goal === 'string') setGoal(body.goal);
      if (typeof body.rationale === 'string') setRationale(body.rationale);
      setStatus('Drafted. Edit if needed, then save.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to suggest');
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <section className="rounded-lg border border-neutral-800/80 bg-neutral-900/70 p-4 shadow-[0_10px_28px_rgba(0,0,0,0.16)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Strategy goal
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-500">
            Persistent objective for this week’s PM strategy.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ProviderSelect
            provider={provider}
            onChange={setProvider}
            options={['openai', 'claude', 'deepseek']}
            title="Which model suggests the goal"
            disabled={busy}
          />
          <button
            onClick={suggest}
            disabled={busy}
            className="rounded-md border border-neutral-700 px-3.5 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-800/80 disabled:opacity-50"
          >
            {suggesting ? 'Drafting…' : goal.trim() ? 'Iterate goal' : 'Suggest goal'}
          </button>
          <button
            onClick={save}
            disabled={busy || !changed}
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save goal'}
          </button>
        </div>
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
        placeholder="Example: Focus this week on growing qualified installs and proving activation/retention are improving. Treat monetization as design-ahead only; do not recommend paywalls or pricing experiments yet."
        className="mt-3 max-h-48 min-h-24 w-full resize-y rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm leading-relaxed text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10"
      />
      {rationale && (
        <p className="mt-2 rounded-md border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-sm leading-relaxed text-sky-100">
          {rationale}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-600">{goal.length.toLocaleString('en-GB')} / 2,000</p>
        {status && <p className="text-xs text-emerald-400">{status}</p>}
        {error && <p className="text-xs text-rose-400">{error}</p>}
      </div>
    </section>
  );
}
