'use client';

import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { GscDigest, GscTopRow } from '../lib/growth';

function compact(n: number) {
  return new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function percent(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function position(n: number) {
  return n > 0 ? n.toFixed(1) : 'n/a';
}

function shortDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  });
}

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-neutral-800/80 bg-neutral-950/45 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-neutral-100">{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

function TopTable({ rows }: { rows: GscTopRow[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-neutral-800/80">
      <table className="w-full table-fixed text-sm">
        <thead className="bg-neutral-950/80 text-[11px] uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="w-[52%] px-3 py-2 text-left font-semibold">Item</th>
            <th className="px-3 py-2 text-right font-semibold">Impr.</th>
            <th className="px-3 py-2 text-right font-semibold">Clicks</th>
            <th className="hidden px-3 py-2 text-right font-semibold sm:table-cell">CTR</th>
            <th className="hidden px-3 py-2 text-right font-semibold sm:table-cell">Pos.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800/80">
          {rows.map((row) => (
            <tr key={row.label} className="bg-neutral-900/35">
              <td className="truncate px-3 py-2 text-neutral-200" title={row.label}>
                {row.label}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-neutral-300">
                {compact(row.impressions)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-neutral-300">
                {compact(row.clicks)}
              </td>
              <td className="hidden px-3 py-2 text-right tabular-nums text-neutral-400 sm:table-cell">
                {percent(row.ctr)}
              </td>
              <td className="hidden px-3 py-2 text-right tabular-nums text-neutral-400 sm:table-cell">
                {position(row.position)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GSCDataVisuals({ digest }: { digest: GscDigest }) {
  const [table, setTable] = useState<'queries' | 'pages'>('queries');
  const topRows = table === 'queries' ? digest.topQueries : digest.topPages;

  if (digest.daily.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-800/80 bg-neutral-900/70 px-4 py-6 text-sm text-neutral-500">
        No imported GSC rows are available for this site yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Metric
          label="Window"
          value={digest.startDate && digest.endDate ? `${shortDate(digest.startDate)} to ${shortDate(digest.endDate)}` : 'n/a'}
          sub={`${digest.rowsUsed.toLocaleString('en-GB')} rows`}
        />
        <Metric label="Impressions" value={compact(digest.totals.impressions)} />
        <Metric label="Clicks" value={compact(digest.totals.clicks)} />
        <Metric label="CTR" value={percent(digest.totals.ctr)} />
        <Metric label="Avg. position" value={position(digest.totals.position)} />
        <Metric
          label="Coverage"
          value={digest.totals.queries.toLocaleString('en-GB')}
          sub={`${digest.totals.pages.toLocaleString('en-GB')} pages`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.9fr)]">
        <div className="rounded-lg border border-neutral-800/80 bg-neutral-900/70 p-4 shadow-[0_10px_28px_rgba(0,0,0,0.16)]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-neutral-100">Daily search demand</h3>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-neutral-500">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                Impressions
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Clicks
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                CTR
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={digest.daily} margin={{ top: 8, right: 10, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="rgba(115,115,115,0.16)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tick={{ fontSize: 10, fill: '#737373' }}
                tickLine={false}
                axisLine={false}
                minTickGap={26}
              />
              <YAxis
                yAxisId="volume"
                tick={{ fontSize: 10, fill: '#737373' }}
                tickFormatter={compact}
                tickLine={false}
                axisLine={false}
                width={42}
              />
              <YAxis yAxisId="ctr" orientation="right" hide domain={[0, 'dataMax']} />
              <Tooltip
                contentStyle={{
                  background: '#0b0f12',
                  border: '1px solid rgba(115,115,115,0.45)',
                  borderRadius: 8,
                  fontSize: 12,
                  boxShadow: '0 16px 32px rgba(0,0,0,0.28)',
                }}
                labelFormatter={(d) => shortDate(String(d))}
                formatter={(v: number, n) => [
                  n === 'ctr' ? percent(v) : compact(v),
                  n === 'ctr' ? 'CTR' : n === 'clicks' ? 'Clicks' : 'Impressions',
                ]}
              />
              <Line
                yAxisId="volume"
                type="monotone"
                dataKey="impressions"
                stroke="#38bdf8"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="volume"
                type="monotone"
                dataKey="clicks"
                stroke="#34d399"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="ctr"
                type="monotone"
                dataKey="ctr"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-neutral-800/80 bg-neutral-900/70 p-4 shadow-[0_10px_28px_rgba(0,0,0,0.16)]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-neutral-100">Top {table}</h3>
            <div className="inline-flex rounded-md border border-neutral-800 bg-neutral-950/70 p-0.5">
              {(['queries', 'pages'] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setTable(option)}
                  className={`rounded px-2.5 py-1 text-xs font-medium ${
                    table === option
                      ? 'bg-neutral-200 text-neutral-950'
                      : 'text-neutral-400 hover:text-neutral-100'
                  }`}
                >
                  {option === 'queries' ? 'Queries' : 'Pages'}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-3 h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topRows.slice(0, 6)} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                <XAxis dataKey="label" hide />
                <YAxis
                  tick={{ fontSize: 10, fill: '#737373' }}
                  tickFormatter={compact}
                  tickLine={false}
                  axisLine={false}
                  width={42}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(115,115,115,0.1)' }}
                  contentStyle={{
                    background: '#0b0f12',
                    border: '1px solid rgba(115,115,115,0.45)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number, n) => [compact(v), n === 'clicks' ? 'Clicks' : 'Impressions']}
                />
                <Bar dataKey="impressions" fill="#38bdf8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="clicks" fill="#34d399" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <TopTable rows={topRows} />
        </div>
      </div>
    </div>
  );
}
