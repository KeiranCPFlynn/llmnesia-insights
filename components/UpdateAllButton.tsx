'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProviderSelect, ModelSelect, useProvider, useModel, PROVIDER_LABEL } from './ProviderSelect';

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
  { key: 'sync', label: 'Search data' },
  { key: 'insights', label: 'Insights' },
  { key: 'downstream', label: 'Growth + strategy' },
];

/**
 * One-click mid-week refresh across all three workspaces, for the CURRENT
 * in-progress week. Runs the tabs in dependency order:
 *   1. GSC + Bing delta sync (the data that actually moves day to day)
 *   2. Insights (week-to-date; blocks until saved so the row exists)
 *   3. Growth plans (per site) + Strategy — fired in parallel; both finish
 *      server-side via after() even if the user navigates away.
 * The current-week rows upsert in place, so this is safe to run daily; Monday's
 * completed-week cron later finalizes the same row.
 */
export function UpdateAllButton() {
  const router = useRouter();
  // Shared with the Insights Toolbar — drives the insights + growth-plan calls.
  const [provider, setProvider] = useProvider();
  const [insightModel, setInsightModel] = useModel(provider);
  // Strategy remembers its own preference separately (StrategyPanel defaults it
  // to GPT-5.5) — mirror that here so "Update all" matches what the Strategy
  // tab would actually generate on its own.
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

    // 1. Search sync — best-effort. A stale/failed sync shouldn't block the
    //    rest; insights just reads whatever search rows already exist.
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
      set('sync', 'warn'); // continue anyway
    }

    // 2. Insights (week-to-date). Blocks until the row is saved so Strategy —
    //    which needs the insight row — can run right after.
    set('insights', 'active');
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'current', provider }),
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

    // 3. Growth plans (every enabled site) + Strategy — kicked off in parallel.
    //    Each runs to completion server-side via after(); the panels on those
    //    tabs poll for the result, so we don't block on them here.
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
      setMsg('All workspaces updated. Growth + strategy finish in the background.');
    } catch {
      set('downstream', 'warn');
      setMsg('Insights updated. Growth/strategy may still be generating.');
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
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <ProviderSelect
          provider={provider}
          onChange={setProvider}
          disabled={running}
          title="Model for insights + growth plan (Strategy uses its own saved choice)"
        />
        <ModelSelect
          provider={provider}
          model={insightModel}
          onChange={setInsightModel}
          disabled={running}
          title={`Model variant for ${PROVIDER_LABEL[provider]}`}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-neutral-500 shrink-0">Strategy:</span>
        <ProviderSelect
          provider={strategyProvider}
          onChange={setStrategyProvider}
          disabled={running}
          options={['openai', 'claude', 'deepseek', 'qwen']}
          title="Which PM acts as strategist"
        />
        <ModelSelect
          provider={strategyProvider}
          model={strategyModel}
          onChange={setStrategyModel}
          disabled={running}
          title={`Model variant for ${PROVIDER_LABEL[strategyProvider]}`}
        />
      </div>
      {!confirming ? (
        <button
          onClick={() => (running ? undefined : setConfirming(true))}
          disabled={running}
          title="Refresh all three workspaces for the current in-progress week"
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-400/15 disabled:opacity-60"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${running ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
          {running ? `Updating… ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}` : 'Update all now'}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={run}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-400/20 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/30"
          >
            Refresh this week?
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="rounded-lg px-2 py-2 text-sm text-neutral-400 hover:text-neutral-200"
          >
            Cancel
          </button>
        </div>
      )}

      {(running || states.insights !== 'idle') && (
        <div className="flex items-center gap-3 px-1 text-[11px] text-neutral-500">
          {PHASES.map((p) => (
            <span key={p.key} className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${dot(states[p.key])}`} />
              {p.label}
            </span>
          ))}
        </div>
      )}
      {msg && <div className="px-1 text-[11px] text-neutral-400">{msg}</div>}
    </div>
  );
}
