'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { formatDateTime } from '../lib/format';
import type { Site } from '../src/types.js';

/** Stop polling after this long even if nothing changes — safety net. */
const SYNC_TIMEOUT_MS = 5 * 60 * 1000;
/** How often the toolbar re-renders the server component while syncing. */
const POLL_INTERVAL_MS = 3000;
/** N consecutive polls with no lastSyncedAt advance = sync has settled. */
const STABLE_POLLS_TO_FINISH = 4;

/**
 * Top toolbar for /growth: the manual sync button and a small "last synced"
 * readout. While a sync is running it polls (router.refresh) until the
 * gsc_rows count stops changing, then declares done.
 */
export function GrowthSyncToolbar({
  site,
  lastSyncedAt,
  rowCount,
}: {
  site: Site;
  lastSyncedAt: string | null;
  rowCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const startedAt = useRef(0);
  const lastSeenSyncedAt = useRef<string | null>(lastSyncedAt);
  const stableTicks = useRef(0);

  // Re-render the page every POLL_INTERVAL_MS while syncing. The server
  // component re-fetches `rowCount` and `lastSyncedAt`; the props effect
  // below decides when we're done.
  useEffect(() => {
    if (!syncing) return;
    const elapsedTimer = setInterval(
      () => setElapsedSec(Math.floor((Date.now() - startedAt.current) / 1000)),
      1000,
    );
    const poll = setInterval(() => {
      if (Date.now() - startedAt.current > SYNC_TIMEOUT_MS) {
        setSyncing(false);
        setStatus('Sync took longer than 5 minutes — refresh manually if it eventually lands.');
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => {
      clearInterval(poll);
      clearInterval(elapsedTimer);
    };
  }, [syncing, router]);

  // Decide when the sync is "done" using `lastSyncedAt` — that timestamp gets
  // bumped on every upsert (`synced_at default now()`), so it advances on
  // EVERY new write, even when the row count is unchanged (a delta that just
  // refreshes existing rows). Row count alone is unreliable for deltas.
  //
  // Rule: settled = STABLE_POLLS_TO_FINISH consecutive polls with no advance.
  // We don't require "saw an increase first" — for a no-op delta (GSC returned
  // nothing new) we still want the toolbar to stop after ~12s instead of
  // hanging for 5 minutes.
  useEffect(() => {
    if (!syncing) {
      lastSeenSyncedAt.current = lastSyncedAt;
      return;
    }
    const advanced =
      lastSyncedAt != null &&
      (lastSeenSyncedAt.current == null || lastSyncedAt > lastSeenSyncedAt.current);
    if (advanced) {
      lastSeenSyncedAt.current = lastSyncedAt;
      stableTicks.current = 0;
      return;
    }
    stableTicks.current += 1;
    if (stableTicks.current >= STABLE_POLLS_TO_FINISH) {
      setSyncing(false);
      setStatus(
        rowCount > 0
          ? `Sync complete — ${rowCount.toLocaleString('en-GB')} rows in DB.`
          : 'Sync finished. No rows returned — check the GSC property string in the sites table.',
      );
    }
  }, [lastSyncedAt, syncing, rowCount]);

  async function sync(mode: 'auto' | 'backfill' | 'delta') {
    if (busy || syncing) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch('/api/growth/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: site.id, mode }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');

      if (j.completed) {
        const totalRows = Array.isArray(j.results)
          ? j.results.reduce((sum: number, r: { rows?: number }) => sum + (r.rows ?? 0), 0)
          : 0;
        const ranges = Array.isArray(j.results)
          ? j.results
              .map((r: { range?: { startDate?: string; endDate?: string } }) =>
                r.range?.startDate && r.range?.endDate
                  ? r.range.startDate === r.range.endDate
                    ? r.range.startDate
                    : `${r.range.startDate} to ${r.range.endDate}`
                  : null,
              )
              .filter(Boolean)
          : [];
        router.refresh();
        setStatus(
          `Sync complete — ${totalRows.toLocaleString('en-GB')} row${
            totalRows === 1 ? '' : 's'
          } refreshed${ranges.length ? ` (${ranges.join(', ')})` : ''}.`,
        );
        return;
      }

      startedAt.current = Date.now();
      lastSeenSyncedAt.current = lastSyncedAt;
      stableTicks.current = 0;
      setElapsedSec(0);
      setSyncing(true);
      setStatus(
        mode === 'backfill'
          ? 'Backfill started — page updates live as rows land.'
          : 'Sync started — page updates live as rows land.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  const synced = lastSyncedAt
    ? formatDateTime(lastSyncedAt)
    : 'never';

  return (
    <div className="rounded-lg border border-neutral-800/80 bg-neutral-900/70 p-4 shadow-[0_10px_28px_rgba(0,0,0,0.16)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <div className="font-semibold text-neutral-200">{site.name} — Google Search Console</div>
          <div className="text-xs text-neutral-500">
            {rowCount > 0
              ? `${rowCount.toLocaleString('en-GB')} rows · last synced ${synced}`
              : `No data yet — run a backfill to pull the last 90 days from GSC.`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {rowCount === 0 && !syncing ? (
            <button
              onClick={() => sync('backfill')}
              disabled={busy || syncing}
              className="rounded-md bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-[0_8px_22px_rgba(5,150,105,0.2)] hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy ? 'Starting…' : 'Backfill 90 days'}
            </button>
          ) : (
            <>
              <button
                onClick={() => sync('delta')}
                disabled={busy || syncing}
                className="rounded-md border border-neutral-700 bg-neutral-950/80 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800/80 disabled:opacity-50"
              >
                {syncing ? 'Syncing…' : busy ? 'Starting…' : 'Sync latest data'}
              </button>
              <button
                onClick={() => sync('backfill')}
                disabled={busy || syncing}
                className="rounded-md border border-neutral-700 bg-neutral-950/80 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800/80 disabled:opacity-50"
                title="Re-pull the last 90 days (replaces existing rows on conflict)."
              >
                Re-backfill 90 days
              </button>
            </>
          )}
        </div>
      </div>
      {syncing && (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
            <div className="h-full w-1/3 animate-[loader_1.4s_ease-in-out_infinite] rounded-full bg-emerald-500" />
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {rowCount > 0 ? `${rowCount.toLocaleString('en-GB')} rows so far` : 'Waiting for first rows'}
            {` · ${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, '0')}`}
          </p>
        </div>
      )}
      {status && !syncing && <p className="mt-2 text-xs text-emerald-400">{status}</p>}
      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
    </div>
  );
}
