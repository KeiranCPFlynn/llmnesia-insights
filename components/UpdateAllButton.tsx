'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ModelPicker, useProvider, useModel } from './ProviderSelect';

/** ISO Monday of the current calendar week, in UTC — matches src getCurrentWeek(). */
function currentMonday(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun … 6=Sat
  const back = day === 0 ? 6 : day - 1;
  const m = new Date(now);
  m.setUTCDate(now.getUTCDate() - back);
  return m.toISOString().slice(0, 10);
}

type Phase = 'sync' | 'insights' | 'downstream';
type PhaseState = 'idle' | 'active' | 'done' | 'warn' | 'error';

const PHASES: { key: Phase; label: string }[] = [
  { key: 'sync', label: 'Search' },
  { key: 'insights', label: 'Insights' },
  { key: 'downstream', label: 'Growth+Strategy' },
];

export function UpdateAllButton() {
  const router = useRouter();
  const [provider, setProvider] = useProvider();
  const [insightModel, setInsightModel] = useModel(provider);
  const [strategyProvider, setStrategyProvider] = useProvider({ storageKey: 'llm-provider-strategy', fallback: 'openai' });
  const [strategyModel, setStrategyModel] = useModel(strategyProvider);
  const [running, setRunning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [states, setStates] = useState<Record<Phase, PhaseState>>({
    sync: 'idle',
    insights: 'idle',
    downstream: 'idle',
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      setElapsed(0);
      timer.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [running]);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 8000);
    return () => clearTimeout(t);
  }, [confirming]);

  const set = (key: Phase, state: PhaseState) =>
    setStates((prev) => ({ ...prev, [key]: state }));

  async function run() {
    if (running) return;
    setConfirming(false);
    setRunning(true);
    setMsg(null);
    setStates({ sync: 'idle', insights: 'idle', downstream: 'idle' });
    const week = currentMonday();

    set('sync', 'active');
    try {
      const res = await fetch('/api/growth/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'delta' }),
      });
      if (!res.ok && res.status !== 202) throw new Error(`sync ${res.status}`);
      set('sync', 'done');
    } catch {
      set('sync', 'warn');
    }

    set('insights', 'active');
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'current', provider, model: insightModel }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Insights failed (${res.status})`);
      set('insights', 'done');
    } catch (e) {
      set('insights', 'error');
      setMsg(e instanceof Error ? e.message : 'Insights run failed.');
      setRunning(false);
      return;
    }

    set('downstream', 'active');
    try {
      const sitesRes = await fetch('/api/sites');
      const { sites = [] } = (await sitesRes.json().catch(() => ({}))) as {
        sites?: { id: string; name: string }[];
      };
      await Promise.all([
        ...sites.map((s) =>
          fetch('/api/growth/plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ siteId: s.id, weekStart: week, provider, model: insightModel }),
          }),
        ),
        fetch('/api/strategy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ week, provider: strategyProvider, model: strategyModel }),
        }),
      ]);
      set('downstream', 'done');
      setMsg('All updated.');
    } catch {
      set('downstream', 'warn');
      setMsg('Insights done. Growth/strategy finishing.');
    }

    setRunning(false);
    router.refresh();
  }

  const dot = (state: PhaseState) =>
    state === 'done'
      ? 'bg-emerald-400'
      : state === 'active'
        ? 'bg-amber-400 animate-pulse'
        : state === 'warn'
          ? 'bg-amber-500'
          : state === 'error'
            ? 'bg-rose-500'
            : 'bg-neutral-700';

  return (
    <div className="flex flex-col gap-2">
      {/* Model picker for insights + growth */}
      <div className="space-y-1">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
          Analysis
        </label>
        <ModelPicker
          provider={provider}
          model={insightModel}
          onProviderChange={setProvider}
          onModelChange={setInsightModel}
          disabled={running}
          title="Model for insights + growth"
        />
      </div>

      {/* Strategy model */}
      <div className="space-y-1">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
          Strategy
        </label>
        <ModelPicker
          provider={strategyProvider}
          model={strategyModel}
          onProviderChange={setStrategyProvider}
          onModelChange={setStrategyModel}
          options={['openai', 'claude', 'deepseek', 'qwen']}
          disabled={running}
          title="Model for strategy"
        />
      </div>

      {/* Action button */}
      {!confirming ? (
        <button
          onClick={() => (running ? undefined : setConfirming(true))}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-400/15 disabled:opacity-60"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${running ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
          {running ? `Updating ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}` : 'Update all'}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={run}
            className="rounded-lg border border-emerald-400/40 bg-emerald-400/20 px-3 py-1.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/30"
          >
            Confirm
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="rounded-lg px-2 py-1.5 text-sm text-neutral-400 hover:text-neutral-200"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Progress indicators */}
      {(running || states.insights !== 'idle') && (
        <div className="flex items-center gap-2 text-[10px] text-neutral-500">
          {PHASES.map((p) => (
            <span key={p.key} className="inline-flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${dot(states[p.key])}`} />
              {p.label}
            </span>
          ))}
        </div>
      )}
      {msg && <div className="text-[10px] text-neutral-400">{msg}</div>}
    </div>
  );
}
