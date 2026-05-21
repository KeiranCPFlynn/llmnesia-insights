'use client';

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrendPoint } from '../lib/dashboard';
import { formatWeek } from '../lib/format';

type Series = { key: keyof TrendPoint; label: string; color: string };

const CHARTS: { title: string; unit: string; series: Series[] }[] = [
  { title: 'Installs', unit: '', series: [{ key: 'installs', label: 'Installs', color: '#60a5fa' }] },
  {
    title: 'Activation (within 24h)',
    unit: '%',
    series: [{ key: 'activationRate', label: 'Activation %', color: '#34d399' }],
  },
  {
    title: 'Retention',
    unit: '%',
    series: [
      { key: 'w1Retention', label: 'W1', color: '#f59e0b' },
      { key: 'w4Retention', label: 'W4', color: '#fb7185' },
    ],
  },
  {
    title: 'Weekly active users',
    unit: '',
    series: [{ key: 'wau', label: 'WAU', color: '#a78bfa' }],
  },
  {
    title: 'Searches per active user',
    unit: '',
    series: [{ key: 'searchesPerWau', label: 'Searches/WAU', color: '#22d3ee' }],
  },
  {
    title: 'Search quality',
    unit: '%',
    series: [
      { key: 'clickRate', label: 'Click rate', color: '#34d399' },
      { key: 'zeroResultRate', label: 'Zero results', color: '#fb7185' },
    ],
  },
];

export function TrendCharts({ data }: { data: TrendPoint[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {CHARTS.map((c) => (
        <div
          key={c.title}
          className="rounded-lg border border-neutral-800/80 bg-neutral-900/70 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.16)]"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold text-neutral-100">{c.title}</h3>
            <div className="flex flex-wrap justify-end gap-x-2 gap-y-1 text-[11px] text-neutral-500">
              {c.series.map((s) => (
                <span key={String(s.key)} className="inline-flex items-center gap-1">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span style={{ color: s.color }}>{s.label}</span>
                </span>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <XAxis
                dataKey="week"
                tickFormatter={(w) => formatWeek(w).replace(/ \d{4}$/, '')}
                tick={{ fontSize: 10, fill: '#737373' }}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#737373' }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: '#0b0f12',
                  border: '1px solid rgba(115,115,115,0.45)',
                  borderRadius: 8,
                  fontSize: 12,
                  boxShadow: '0 16px 32px rgba(0,0,0,0.28)',
                }}
                labelFormatter={(w) => `Week of ${formatWeek(String(w))}`}
                formatter={(v: number, n) => [`${v}${c.unit}`, n]}
              />
              {c.series.map((s) => (
                <Line
                  key={String(s.key)}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}
