'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { formatWeek } from '../lib/format';
import { ModelPicker, useProvider, useModel, PROVIDER_LABEL } from './ProviderSelect';
import { WeekSelect } from './WeekSelect';
import { GenerationContextBox } from './GenerationContextBox';

type RunIntent = {
  kind: 'latest' | 'selected';
  weekStart: string;
  weekEnd?: string;
  exists: boolean;
};

export function Toolbar({
  weeks,
  allWeeks,
  selected,
  latestRunWeekStart,
  latestRunWeekEnd,
}: {
  weeks: string[];
  allWeeks?: string[];
  selected: string;
  latestRunWeekStart: string;
  latestRunWeekEnd: string;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [confirming, setConfirming] = useState<RunIntent | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [runFailed, setRunFailed] = useState(false);
  const [generationContext, setGenerationContext] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [provider, setProvider] = useProvider();
  const [model, setModel] = useModel(provider);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
    const t = setTimeout(() => setConfirming(null), 10000);
    return () => clearTimeout(t);
  }, [confirming]);

  const estimate = provider === 'deepseek' ? '~3–4 min' : provider === 'qwen' ? '~2 min' : '~1 min';
  const latestRunExists = weeks.includes(latestRunWeekStart);
  const selectedIsLatestRun = selected === latestRunWeekStart;

  async function runNow(intent: RunIntent) {
    if (running) return;
    setConfirming(null);
    setRunning(true);
    setMsg(null);
    setRunFailed(false);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          model,
          // The normal action always refreshes Monday → today. A selected
          // historical report keeps its fixed Mon–Sun range.
          ...(intent.kind === 'latest' ? { mode: 'current' } : { weekStart: intent.weekStart }),
          generationContext: generationContext.trim() || undefined,
        }),
        signal: ctrl.signal,
      });
      const body = await res.json().catch(() => ({})) as { error?: string; week?: string; ledgerWarning?: string };
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);
      if (body.ledgerWarning) {
        setMsg(`Evidence updated, but the Strategy Ledger did not: ${body.ledgerWarning}`);
        setRunFailed(true);
      } else {
        setMsg('Done — refreshing.');
      }
      if (body.week) router.push(`/?week=${body.week}`);
      router.refresh();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setMsg('Stopped waiting. A run already in progress may still finish and save.');
      } else {
        setMsg(e instanceof Error ? e.message : 'Run failed.');
        setRunFailed(true);
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  function confirmLatest() {
    setMsg(null);
    setConfirming({
      kind: 'latest',
      weekStart: latestRunWeekStart,
      weekEnd: latestRunWeekEnd,
      exists: latestRunExists,
    });
  }

  function confirmSelected() {
    setMsg(null);
    setConfirming({
      kind: 'selected',
      weekStart: selected,
      exists: weeks.includes(selected),
    });
  }

  const confirmVerb = confirming?.exists ? 'replace' : 'create';
  const mm = String(Math.floor(elapsed / 60)).padStart(1, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <div className="flex flex-col gap-3">
      {/* The normal action is deliberately the only prominent control. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-950/60 px-2 py-1.5">
          <span className="text-xs font-medium text-neutral-400">Run with</span>
          <ModelPicker
            provider={provider}
            model={model}
            onProviderChange={setProvider}
            onModelChange={setModel}
            disabled={running}
            title="Model for this weekly review"
          />
        </div>
        {running ? (
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-neutral-700 bg-neutral-900/80 px-3 py-1.5 text-sm font-medium text-neutral-300">
              {mm}:{ss}
            </span>
            <button
              onClick={cancel}
              className="rounded-md border border-rose-500/40 px-3 py-1.5 text-sm font-medium text-rose-200 hover:bg-rose-500/10"
            >
              Cancel
            </button>
          </div>
        ) : confirming ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => runNow(confirming)}
              className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-500"
            >
              Confirm {confirmVerb} ({estimate})
            </button>
            <button
              onClick={() => setConfirming(null)}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800/80"
            >
              Back
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={confirmLatest}
              className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-200 hover:bg-emerald-500/15"
            >
              {latestRunExists ? 'Refresh today’s data' : 'Create today’s report'}
            </button>
            {!selectedIsLatestRun && (
              <button
                onClick={confirmSelected}
                className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-300 hover:bg-neutral-800/80"
              >
                Refresh this report
              </button>
            )}
          </div>
        )}

        {!running && msg && <span className={`text-sm ${runFailed ? 'font-medium text-rose-300' : 'text-neutral-400'}`}>{msg}</span>}
      </div>

      <details className="text-xs text-neutral-500">
        <summary className="cursor-pointer hover:text-neutral-300">More options: view a past report or add context</summary>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <WeekSelect weeks={allWeeks ?? weeks} selected={selected} basePath="/" disabled={running} />
        </div>
        <div className="mt-3">
          <GenerationContextBox
            value={generationContext}
            onChange={setGenerationContext}
            disabled={running}
            placeholder="Optional context for the analysis…"
          />
        </div>
      </details>

      {/* Progress bar when running */}
      {running && (
        <div className="flex items-center gap-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-800">
            <div className="h-full w-1/3 animate-[loader_1.4s_ease-in-out_infinite] rounded-full bg-emerald-500" />
          </div>
          <span className="shrink-0 text-xs text-neutral-500">
            {PROVIDER_LABEL[provider]} · {mm}:{ss}
          </span>
        </div>
      )}

      {/* Confirmation details */}
      {confirming && !running && (
        <p className="text-xs leading-relaxed text-neutral-500">
          {confirming.exists ? 'Refresh' : 'Create'} the review for {formatWeek(confirming.weekStart)}
          {confirming.weekEnd ? ` → ${formatWeek(confirming.weekEnd)}` : ''}.
          {generationContext.trim() ? ' Context above will be applied.' : ''}
        </p>
      )}
    </div>
  );
}
