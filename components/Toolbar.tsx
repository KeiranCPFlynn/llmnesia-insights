'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ProviderSelect, useProvider } from './ProviderSelect';
import { WeekSelect } from './WeekSelect';

export function Toolbar({
  weeks,
  selected,
}: {
  weeks: string[];
  selected: string;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [provider, setProvider] = useProvider();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Tick a visible elapsed-seconds counter while the (long, blocking) run is
  // in flight — DeepSeek can take 3–4 min, so silence looks like a hang.
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

  // Auto-disarm the confirm so it can't sit primed and get clicked later.
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 6000);
    return () => clearTimeout(t);
  }, [confirming]);

  // DeepSeek is a reasoning model and much slower than Claude.
  const estimate = provider === 'deepseek' ? '~3–4 min' : '~1 min';

  async function runNow() {
    if (running) return;
    setConfirming(false);
    setRunning(true);
    setMsg(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
        signal: ctrl.signal,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);
      setMsg('Done — refreshing.');
      router.refresh();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setMsg('Stopped waiting. A run already in progress may still finish and save.');
      } else {
        setMsg(e instanceof Error ? e.message : 'Run failed.');
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(1, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <WeekSelect weeks={weeks} selected={selected} basePath="/" disabled={running} />

        <ProviderSelect provider={provider} onChange={setProvider} disabled={running} />

        {running ? (
          <>
            <span className="rounded-md border border-neutral-700 bg-neutral-900/80 px-4 py-2 text-sm font-medium text-neutral-300">
              Running… {mm}:{ss}
            </span>
            <button
              onClick={cancel}
              className="rounded-md border border-rose-500/40 px-3 py-2 text-sm font-medium text-rose-200 hover:bg-rose-500/10"
            >
              Cancel
            </button>
          </>
        ) : confirming ? (
          <>
            <button
              onClick={runNow}
              className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_22px_rgba(225,29,72,0.22)] hover:bg-rose-500"
            >
              Confirm — run analysis ({estimate})
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800/80"
            >
              Back
            </button>
          </>
        ) : (
          <button
            onClick={() => {
              setMsg(null);
              setConfirming(true);
            }}
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/15"
          >
            Run analysis now
          </button>
        )}

        {!running && msg && <span className="text-sm text-neutral-400">{msg}</span>}
      </div>

      {running && (
        <div className="w-full min-w-[16rem] sm:w-80">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
            <div className="h-full w-1/3 animate-[loader_1.4s_ease-in-out_infinite] rounded-full bg-emerald-500" />
          </div>
          <p className="mt-1 text-right text-xs text-neutral-500">
            Analysing on {provider === 'deepseek' ? 'DeepSeek' : 'Claude'} ({estimate})… {mm}:{ss}{' '}
            elapsed — keep this tab open.
          </p>
        </div>
      )}
    </div>
  );
}
