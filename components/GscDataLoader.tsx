'use client';

import { useState } from 'react';
import type { GscDigest } from '../lib/growth';
import { GSCDataVisuals } from './GSCDataVisuals';

/** Keep raw 90-day GSC aggregation out of the initial Growth navigation. */
export function GscDataLoader({ siteId, weekStart }: { siteId: string; weekStart: string }) {
  const [digest, setDigest] = useState<GscDigest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (loading || digest) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/growth/digest?siteId=${encodeURIComponent(siteId)}&weekStart=${encodeURIComponent(weekStart)}`,
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Failed to load search performance');
      setDigest(body.digest as GscDigest);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load search performance');
    } finally {
      setLoading(false);
    }
  }

  if (digest) return <GSCDataVisuals digest={digest} />;
  return (
    <div className="rounded-lg border border-neutral-800/80 bg-neutral-900/70 p-5">
      <p className="text-sm text-neutral-400">Load the 90-day chart and query/page tables when you need to inspect the underlying search data.</p>
      <button
        onClick={load}
        disabled={loading}
        className="mt-3 rounded-md border border-sky-500/40 bg-sky-500/10 px-3.5 py-2 text-sm font-medium text-sky-200 hover:bg-sky-500/15 disabled:opacity-50"
      >
        {loading ? 'Loading search data…' : 'Load search performance'}
      </button>
      {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
    </div>
  );
}
