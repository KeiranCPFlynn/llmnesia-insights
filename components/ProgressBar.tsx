'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Counts seconds while `active` is true. Drives the elapsed readout on the
 * long, blocking chat / regenerate requests so they don't look hung.
 */
export function useElapsed(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (active) {
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [active]);

  return seconds;
}

export function ProgressBar({ seconds, label }: { seconds: number; label: string }) {
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, '0');
  return (
    <div className="w-full">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
        <div className="h-full w-1/3 animate-[loader_1.4s_ease-in-out_infinite] rounded-full bg-emerald-500" />
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        {label} · {mm}:{ss}
      </p>
    </div>
  );
}
