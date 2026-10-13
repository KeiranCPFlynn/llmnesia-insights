'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { StripeMetrics } from '../src/stripe-types.js';
import { stripeMoney } from '../lib/stripe-format';

export function RevenueChart({ metrics }: { metrics: StripeMetrics }) {
  return <div className="mb-6 grid gap-4 xl:grid-cols-2">{metrics.currencies.map(c => {
    const rows = new Map(metrics.daily.filter(d => d.currency === c.currency).map(d => [d.date, d]));
    const data = [];
    for (let day = Date.parse(metrics.period.start); day <= Date.parse(metrics.period.end); day += 86400000) {
      const date = new Date(day).toISOString().slice(0, 10);
      const row = rows.get(date);
      data.push({ date, collected: row?.collected ?? 0, refunded: row?.refunded ?? 0 });
    }
    return <div key={c.currency} className="min-w-0 rounded-xl border border-neutral-800 p-4">
      <h3 className="mb-1 text-sm font-medium text-neutral-200">Daily payments &amp; refunds · {c.currency.toUpperCase()}</h3>
      <p className="mb-4 text-xs text-neutral-500">Captured charges by creation date and successful refunds by refund date.</p>
      <div className="h-60" role="img" aria-label={`Daily collected payments and refunds in ${c.currency.toUpperCase()}. Exact values are in the daily table below.`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="#262626" vertical={false} />
            <XAxis dataKey="date" tickFormatter={date => String(date).slice(5)} tick={{ fill: '#737373', fontSize: 11 }} />
            <YAxis width={90} tickFormatter={value => stripeMoney(Number(value), c.currency)} tick={{ fill: '#737373', fontSize: 10 }} />
            <Tooltip formatter={value => stripeMoney(Number(value), c.currency)} contentStyle={{ background: '#101519', border: '1px solid #333', borderRadius: 10, color: '#ddd' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="collected" name="Collected" fill="#a78bfa" radius={[3, 3, 0, 0]} />
            <Bar dataKey="refunded" name="Refunds" fill="#fb923c" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>;
  })}</div>;
}
