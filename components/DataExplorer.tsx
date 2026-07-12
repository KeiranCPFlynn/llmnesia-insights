'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { num, pct } from '../lib/format';
import type {
  GA4Metrics,
  GA4PropertyMetrics,
  MetricsSnapshot,
  SearchPerformanceDigest,
} from '../src/types.js';

type PostHogData = Omit<MetricsSnapshot, 'ga4'>;

interface DataResponse {
  range: { start: string; end: string };
  posthog: PostHogData;
  ga4: GA4Metrics;
  search: SearchPerformanceDigest | null;
}

// --- date helpers (all UTC, to match the pipeline's date handling) ---

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
/** Monday of the week containing `d` (ISO weeks, Monday start). */
function mondayOf(d: Date): Date {
  const x = new Date(d);
  const dow = (x.getUTCDay() + 6) % 7; // 0 = Monday
  return addDays(x, -dow);
}

type Preset = { key: string; label: string; range: () => { start: string; end: string } };

function buildPresets(): Preset[] {
  const today = new Date(`${iso(new Date())}T00:00:00Z`);
  const yesterday = addDays(today, -1);
  const lastN = (n: number) => () => ({ start: iso(addDays(yesterday, -(n - 1))), end: iso(yesterday) });
  return [
    { key: '7d', label: 'Last 7 days', range: lastN(7) },
    { key: '28d', label: 'Last 28 days', range: lastN(28) },
    { key: '90d', label: 'Last 90 days', range: lastN(90) },
    {
      key: 'this-week',
      label: 'This week',
      range: () => ({ start: iso(mondayOf(today)), end: iso(today) }),
    },
    {
      key: 'last-week',
      label: 'Last week',
      range: () => {
        const thisMon = mondayOf(today);
        return { start: iso(addDays(thisMon, -7)), end: iso(addDays(thisMon, -1)) };
      },
    },
    {
      key: 'this-month',
      label: 'This month',
      range: () => {
        const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
        return { start: iso(first), end: iso(today) };
      },
    },
  ];
}

// --- presentational helpers ---

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-neutral-800/80 bg-neutral-900/70 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold leading-none text-neutral-50">{value}</div>
      {hint && <div className="mt-2 text-[11px] text-neutral-500">{hint}</div>}
    </div>
  );
}

function Panel({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">{title}</h2>
        {badge && (
          <span className="rounded-full border border-neutral-700 bg-neutral-800/70 px-2 py-0.5 text-[11px] text-neutral-400">
            {badge}
          </span>
        )}
        <div className="h-px flex-1 bg-neutral-800/80" />
      </div>
      {children}
    </section>
  );
}

/** Sorted breakdown table for a Record<string, number>. */
function BreakdownTable({
  title,
  rows,
  limit = 12,
}: {
  title: string;
  rows: Record<string, number> | undefined;
  limit?: number;
}) {
  const entries = Object.entries(rows ?? {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  if (entries.length === 0) return null;
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  return (
    <div className="rounded-lg border border-neutral-800/80 bg-neutral-900/70 overflow-hidden">
      <div className="border-b border-neutral-800 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {entries.map(([k, v]) => (
            <tr key={k} className="border-b border-neutral-800/40 last:border-0">
              <td className="px-4 py-1.5 text-neutral-300 truncate max-w-[260px]">{k}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-neutral-400">{num(v)}</td>
              <td className="px-4 py-1.5 text-right tabular-nums text-neutral-600 w-16">
                {pct(v / total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GA4Property({ title, p }: { title: string; p: GA4PropertyMetrics }) {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Users" value={num(p.users?.total)} />
        <Stat label="New users" value={num(p.users?.new_users)} />
        <Stat label="Returning" value={num(p.users?.returning)} />
        <Stat label="Sessions" value={num(p.sessions)} />
      </div>
      {p.store_installs && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Store installs" value={num(p.store_installs.events)} />
          <Stat label="Installers" value={num(p.store_installs.users)} />
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <BreakdownTable title="Acquisition channels (sessions)" rows={p.acquisition} />
        <BreakdownTable title="Conversions (events)" rows={p.conversions} />
        <BreakdownTable title="Geography (users)" rows={p.geo} />
        <BreakdownTable title="Devices (users)" rows={p.devices} />
      </div>
      {p.top_pages?.length > 0 && (
        <div className="rounded-lg border border-neutral-800/80 bg-neutral-900/70 overflow-hidden">
          <div className="border-b border-neutral-800 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            Top pages (views)
          </div>
          <table className="w-full text-sm">
            <tbody>
              {p.top_pages.slice(0, 12).map((pg) => (
                <tr key={pg.path} className="border-b border-neutral-800/40 last:border-0">
                  <td className="px-4 py-1.5 text-neutral-300 truncate max-w-[360px]">{pg.path}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums text-neutral-400">
                    {num(pg.views)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --- copy-for-AI digest builder ---

function line(label: string, value: string) {
  return `- ${label}: ${value}`;
}

function buildDigest(d: DataResponse): string {
  const { posthog: ph, ga4, search: sp, range } = d;
  const out: string[] = [];
  out.push(`# LLMnesia data — ${range.start} → ${range.end}`);
  out.push('');

  out.push('## PostHog (in-product)');
  out.push(line('Installs (extension_installed)', num(ph.installs?.total)));
  out.push(
    line(
      'Activation (search within 24h)',
      `${pct(ph.activation?.rate)} (${num(ph.activation?.activated_within_24h)} of ${num(ph.activation?.installs)})`,
    ),
  );
  out.push(line('Weekly active users (intent-based)', num(ph.engagement?.wau)));
  out.push(line('Total searches (search_submitted)', num(ph.engagement?.total_searches)));
  out.push(line('Searches per WAU', String(ph.engagement?.searches_per_wau ?? '—')));
  out.push(
    line(
      'Search quality',
      `${num(ph.search_quality?.searches)} searches · ${pct(ph.search_quality?.click_rate)} click rate · ${pct(ph.search_quality?.zero_result_rate)} zero-result rate`,
    ),
  );
  out.push(
    line(
      'Retention (rolling)',
      `W1 ${pct(ph.retention?.w1_rolling?.rate)} · W4 ${pct(ph.retention?.w4_rolling?.rate)}`,
    ),
  );
  out.push(line('Email capture', `${pct(ph.email_capture?.rate)} (${num(ph.email_capture?.identified)} identified)`));
  if (ph.version_adoption?.weekly?.length) {
    out.push(
      line(
        'Version adoption',
        ph.version_adoption.weekly
          .slice()
          .sort((a, b) => b.users - a.users)
          .map((v) => `${v.version}: ${num(v.users)}`)
          .join(', '),
      ),
    );
  }
  out.push('');

  const emitGA4 = (title: string, p?: GA4PropertyMetrics) => {
    if (!p) return;
    out.push(`## GA4 — ${title}`);
    out.push(
      line('Users', `${num(p.users?.total)} (${num(p.users?.new_users)} new, ${num(p.users?.returning)} returning)`),
    );
    out.push(line('Sessions', num(p.sessions)));
    if (p.store_installs) {
      out.push(line('Store installs', `${num(p.store_installs.events)} (${num(p.store_installs.users)} users)`));
    }
    const top = (r?: Record<string, number>, n = 6) =>
      Object.entries(r ?? {})
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([k, v]) => `${k} ${num(v)}`)
        .join(', ') || '—';
    out.push(line('Top channels', top(p.acquisition)));
    if (p.conversions) out.push(line('Conversions', top(p.conversions)));
    out.push(line('Top geo', top(p.geo)));
    out.push(line('Devices', top(p.devices)));
    if (p.top_pages?.length) {
      out.push(line('Top pages', p.top_pages.slice(0, 6).map((pg) => `${pg.path} ${num(pg.views)}`).join(', ')));
    }
    out.push('');
  };
  emitGA4('Website', ga4?.website);
  emitGA4('Chrome Web Store listing', ga4?.extension);

  if (sp) {
    out.push('## Search visibility (Google + Bing)');
    out.push(
      line(
        'Combined',
        `${num(sp.combined.impressions)} impressions · ${num(sp.combined.clicks)} clicks · ${pct(sp.combined.ctr)} CTR`,
      ),
    );
    if (sp.google)
      out.push(
        line(
          'Google',
          `${num(sp.google.impressions)} impr · ${num(sp.google.clicks)} clicks · pos ${sp.google.avg_position}`,
        ),
      );
    if (sp.bing)
      out.push(
        line(
          'Bing',
          `${num(sp.bing.impressions)} impr · ${num(sp.bing.clicks)} clicks · pos ${sp.bing.avg_position}`,
        ),
      );
    if (sp.top_queries_by_impressions?.length) {
      out.push('Top queries by impressions:');
      for (const q of sp.top_queries_by_impressions.slice(0, 12)) {
        out.push(`  - ${q.query} — ${num(q.impressions)} impr, ${num(q.clicks)} clicks [${q.sources.join('+')}]`);
      }
    }
    out.push('');
  }

  return out.join('\n').trim();
}

// --- main component ---

export function DataExplorer() {
  const presets = useMemo(buildPresets, []);
  const [presetKey, setPresetKey] = useState('28d');
  const initial = presets.find((p) => p.key === '28d')!.range();
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [data, setData] = useState<DataResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const reqId = useRef(0);

  const load = useCallback(async (s: string, e: string) => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: s, end: e }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Request failed');
      if (id === reqId.current) setData(body as DataResponse);
    } catch (err) {
      if (id === reqId.current) setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  // Load the default range on mount.
  useEffect(() => {
    load(initial.start, initial.end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPreset(p: Preset) {
    const r = p.range();
    setPresetKey(p.key);
    setStart(r.start);
    setEnd(r.end);
    load(r.start, r.end);
  }

  function applyCustom() {
    setPresetKey('custom');
    load(start, end);
  }

  async function copy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(buildDigest(data));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Clipboard blocked — select the text manually.');
    }
  }

  const ph = data?.posthog;
  const ga4 = data?.ga4;
  const sp = data?.search;

  return (
    <div>
      {/* Range picker — GA4-style presets + a custom range */}
      <div className="mb-6 rounded-xl border border-white/[0.07] bg-[#101519]/82 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {presets.map((p) => (
            <button
              key={p.key}
              onClick={() => applyPreset(p)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                presetKey === p.key
                  ? 'border-emerald-400/30 bg-emerald-400/[0.12] text-neutral-50'
                  : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-neutral-800/70 pt-3">
          <label className="text-[11px] text-neutral-500">
            <span className="mb-1 block uppercase tracking-wide">Start</span>
            <input
              type="date"
              value={start}
              max={end}
              onChange={(e) => setStart(e.target.value)}
              className="rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-100 [color-scheme:dark]"
            />
          </label>
          <label className="text-[11px] text-neutral-500">
            <span className="mb-1 block uppercase tracking-wide">End</span>
            <input
              type="date"
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
              className="rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-100 [color-scheme:dark]"
            />
          </label>
          <button
            onClick={applyCustom}
            disabled={loading}
            className="rounded-md border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-100 hover:bg-neutral-700 disabled:opacity-50"
          >
            Apply range
          </button>
          <div className="ml-auto flex items-center gap-3">
            {loading && <span className="text-xs text-neutral-500">Loading…</span>}
            <button
              onClick={copy}
              disabled={!data || loading}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {copied ? 'Copied ✓' : 'Copy for AI'}
            </button>
          </div>
        </div>
        {data && (
          <p className="mt-2 text-[11px] text-neutral-500">
            Showing {data.range.start} → {data.range.end}. PostHog &amp; GA4 are fetched live for
            this range; search is from synced Google/Bing rows. Retention is a rolling window
            relative to the range.
          </p>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {!data && loading && (
        <div className="rounded-lg border border-neutral-800/80 bg-neutral-900/60 px-4 py-8 text-center text-sm text-neutral-500">
          Fetching data for the selected range…
        </div>
      )}

      {ph && (
        <Panel title="PostHog · in-product">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Installs" value={num(ph.installs?.total)} />
            <Stat
              label="Activated in 24h"
              value={pct(ph.activation?.rate)}
              hint={`${num(ph.activation?.activated_within_24h)} of ${num(ph.activation?.installs)}`}
            />
            <Stat label="Weekly active users" value={num(ph.engagement?.wau)} />
            <Stat label="Total searches" value={num(ph.engagement?.total_searches)} />
            <Stat
              label="Search click rate"
              value={pct(ph.search_quality?.click_rate)}
              hint={`${num(ph.search_quality?.clicks)} clicks / ${num(ph.search_quality?.searches)} searches`}
            />
            <Stat label="Zero-result rate" value={pct(ph.search_quality?.zero_result_rate)} />
            <Stat
              label="Retention W1 (rolling)"
              value={pct(ph.retention?.w1_rolling?.rate)}
            />
            <Stat
              label="Retention W4 (rolling)"
              value={pct(ph.retention?.w4_rolling?.rate)}
            />
            <Stat
              label="Email capture"
              value={pct(ph.email_capture?.rate)}
              hint={`${num(ph.email_capture?.identified)} identified`}
            />
            <Stat label="Searches / WAU" value={String(ph.engagement?.searches_per_wau ?? '—')} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <BreakdownTable title="Searches by platform" rows={ph.platforms?.searches} />
            <BreakdownTable title="Clicks by platform" rows={ph.platforms?.clicks} />
          </div>
          {ph.version_adoption?.weekly?.length > 0 && (
            <div className="mt-3">
              <BreakdownTable
                title="Users by extension version"
                rows={Object.fromEntries(ph.version_adoption.weekly.map((v) => [v.version, v.users]))}
              />
            </div>
          )}
        </Panel>
      )}

      {ga4?.website && (
        <Panel title="GA4 · site & store traffic">
          <div className="space-y-6">
            <GA4Property title="Website" p={ga4.website} />
            {ga4.extension && <GA4Property title="Chrome Web Store listing" p={ga4.extension} />}
          </div>
        </Panel>
      )}

      {sp && (
        <Panel title="Search visibility · Google + Bing">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Impressions (combined)" value={num(sp.combined.impressions)} />
            <Stat label="Clicks (combined)" value={num(sp.combined.clicks)} />
            {sp.google && (
              <Stat
                label="Google"
                value={num(sp.google.impressions)}
                hint={`${num(sp.google.clicks)} clicks · pos ${sp.google.avg_position}`}
              />
            )}
            {sp.bing && (
              <Stat
                label="Bing"
                value={num(sp.bing.impressions)}
                hint={`${num(sp.bing.clicks)} clicks · pos ${sp.bing.avg_position}`}
              />
            )}
          </div>
          {sp.top_queries_by_impressions?.length > 0 && (
            <div className="mt-4 rounded-lg border border-neutral-800/80 bg-neutral-900/70 overflow-hidden">
              <div className="border-b border-neutral-800 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                Top queries by impressions
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-800/60 text-[11px] text-neutral-600">
                    <th className="px-4 py-2 text-left font-medium">Query</th>
                    <th className="px-3 py-2 text-right font-medium">Impr</th>
                    <th className="px-3 py-2 text-right font-medium">Clicks</th>
                    <th className="px-4 py-2 text-right font-medium">Via</th>
                  </tr>
                </thead>
                <tbody>
                  {sp.top_queries_by_impressions.slice(0, 15).map((q, i) => (
                    <tr key={i} className="border-b border-neutral-800/40 last:border-0">
                      <td className="px-4 py-1.5 text-neutral-200 truncate max-w-[280px]">{q.query}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-neutral-400">
                        {num(q.impressions)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-neutral-400">
                        {num(q.clicks)}
                      </td>
                      <td className="px-4 py-1.5 text-right text-[11px] uppercase text-neutral-500">
                        {q.sources.join('+')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
