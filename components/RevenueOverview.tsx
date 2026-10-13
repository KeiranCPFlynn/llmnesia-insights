import Link from 'next/link';
import type { StripeMetrics } from '../src/stripe-types.js';
import { stripeMoney } from '../lib/stripe-format';
import { SourceBadge } from './SourceBadge';
import { RevenueChart } from './RevenueChart';

function Stat({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
    <div className="text-xs text-neutral-400">{label}</div>
    <div className="mt-2 text-2xl font-semibold tracking-tight text-neutral-100">{value}</div>
    <div className="mt-2 text-xs leading-relaxed text-neutral-500">{hint}</div>
  </div>;
}

export function RevenueOverview({ metrics, compact = false }: { metrics?: StripeMetrics; compact?: boolean }) {
  const s = metrics;
  return <section id="revenue" className="mb-8 scroll-mt-36 rounded-2xl border border-violet-400/15 bg-[#101519]/82 p-5 sm:p-6">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><h2 className="text-lg font-semibold text-neutral-100">Revenue &amp; customers</h2><SourceBadge source="Stripe" /></div>
      {compact && <Link className="text-sm text-violet-300 hover:text-violet-200" href={s ? `/revenue?start=${s.period.start}&end=${s.period.end}` : '/revenue'}>Open revenue dashboard →</Link>}
    </div>
    {!s || s.status !== 'available' ? <div className="rounded-xl border border-neutral-800 bg-black/15 p-4">
      <p className="text-sm text-neutral-300">{s?.detail ?? 'This report has no Stripe evidence yet. Refresh evidence after connecting Stripe to include revenue in the next review.'}</p>
      <p className="mt-2 text-xs text-neutral-500">MRR, payments, refunds, customer growth, and subscription health will appear here. Missing data is shown as unavailable.</p>
    </div> : <>
      <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
        <span className={`rounded-full border px-2 py-1 ${s.mode === 'live' ? 'border-emerald-400/25 text-emerald-300' : 'border-amber-400/30 text-amber-300'}`}>{s.mode === 'live' ? 'Live Stripe data' : 'Test data'}</span>
        <span>Account-wide · Payments: {s.period.start} to {s.period.end} ({s.period.time_zone})</span>
        <span>· Read {new Date(s.collected_at).toLocaleString('en-GB', { timeZone: s.period.time_zone })}</span>
      </div>
      {s.currencies.length === 0 && <p className="mb-4 text-sm text-neutral-400">No payment, refund, or recurring revenue activity was found.</p>}
      {s.currencies.map(c => <div key={c.currency} className="mb-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-violet-300">{c.currency.toUpperCase()}</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Stat label="MRR before discounts" value={stripeMoney(c.mrr_before_discounts, c.currency)} hint="Current monthly run rate of fixed subscriptions, before discounts and tax" />
          <Stat label="ARR before discounts" value={stripeMoney(c.arr_before_discounts, c.currency)} hint="Monthly run rate annualized before display rounding; not collected cash" />
          <Stat label="Payments collected" value={stripeMoney(c.collected, c.currency)} hint={`${c.successful_payments} captured payments on charges created in the period; includes tax`} />
          <Stat label="Refunds" value={stripeMoney(c.refunded, c.currency)} hint="Successful refunds created in the period, including older purchases" />
          <Stat label="Collected less refunds" value={stripeMoney(c.collected_less_refunds, c.currency)} hint="Before Stripe fees, disputes, taxes, and payouts" />
          <Stat label="Failed payments" value={c.failed_payments} hint="Failed charge attempts in the period; retries can count separately" />
        </div>
      </div>)}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="New customers" value={s.new_customers ?? 'Unavailable'} hint="Stripe customer records created in the period" />
        <Stat label="Paying customers" value={s.paying_customers ?? 'Unavailable'} hint="Distinct customer IDs with captured payments in the period" />
        <Stat label="Current subscribers" value={s.subscriptions?.current_subscribers ?? 'Unavailable'} hint="Customers with active or past-due subscriptions now; includes free plans" />
        <Stat label="New subscriptions" value={s.subscriptions?.created_in_period ?? 'Unavailable'} hint="Subscriptions created in the period, including trials and incomplete checkouts" />
      </div>
      <p className="mb-4 text-xs leading-relaxed text-neutral-500">Subscription snapshot: {s.subscriptions_as_of ? new Date(s.subscriptions_as_of).toLocaleString('en-GB', { timeZone: s.period.time_zone }) : 'Unavailable'}. MRR includes active and past-due fixed subscriptions. Trials, canceled subscriptions, and metered usage are excluded. One-time purchases contribute to collected payments. Each currency is kept separate.</p>
      {!!s.warnings.length && <ul className="mb-4 space-y-1 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-xs leading-relaxed text-amber-200">{s.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
      {!compact && <>
        <RevenueChart metrics={s} />
        <h3 className="mb-3 text-sm font-medium text-neutral-200">Current subscription health</h3>
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {([['Active', s.subscriptions?.active], ['Trialing', s.subscriptions?.trialing], ['Past due', s.subscriptions?.past_due], ['Unpaid', s.subscriptions?.unpaid], ['Cancel scheduled', s.subscriptions?.scheduled_to_cancel]] as const).map(([label, value]) => <Stat key={label} label={label} value={value ?? 'Unavailable'} hint="At collection time" />)}
        </div>
        <details className="mb-6 rounded-xl border border-neutral-800">
          <summary className="cursor-pointer p-4 text-sm text-neutral-300">Daily payments and refunds ({s.daily.length} rows)</summary>
          <div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm">
            <thead className="text-xs text-neutral-500"><tr><th className="p-3">Date</th><th className="p-3">Collected</th><th className="p-3">Refunds</th><th className="p-3">Payments</th></tr></thead>
            <tbody>{s.daily.map(d => <tr className="border-t border-neutral-800 text-neutral-300" key={`${d.date}:${d.currency}`}><td className="p-3">{d.date}</td><td className="p-3">{stripeMoney(d.collected, d.currency)}</td><td className="p-3">{stripeMoney(d.refunded, d.currency)}</td><td className="p-3">{d.payments}</td></tr>)}</tbody>
          </table>{!s.daily.length && <p className="p-4 text-sm text-neutral-500">No collected payments or successful refunds in this period.</p>}</div>
        </details>
        <h3 className="mb-2 text-sm font-medium text-neutral-200">Transactions</h3>
        <p className="mb-3 text-xs text-neutral-500">Showing {s.transactions.length} of {s.transaction_count} payment attempts and refunds, newest first. Totals include the full period. Customer IDs link to Stripe; names, emails, and card details are not stored.</p>
        <div className="overflow-x-auto rounded-xl border border-neutral-800"><table className="w-full text-left text-sm">
          <thead className="text-xs text-neutral-500"><tr>{['Date', 'Type', 'Amount', 'Status', 'Customer', 'Reference'].map(h => <th className="whitespace-nowrap p-3" key={h}>{h}</th>)}</tr></thead>
          <tbody>{s.transactions.map(t => <tr key={t.id} className="border-t border-neutral-800 text-neutral-300">
            <td className="whitespace-nowrap p-3 text-xs">{new Date(t.created).toLocaleString('en-GB', { timeZone: s.period.time_zone })}</td>
            <td className="p-3 capitalize">{t.kind}</td><td className="whitespace-nowrap p-3 tabular-nums">{t.kind === 'refund' ? '−' : ''}{stripeMoney(t.amount, t.currency)}</td>
            <td className="p-3">{t.status}</td><td className="p-3 text-xs">{t.customer_id ? <a className="text-violet-300 hover:underline" href={`https://dashboard.stripe.com/${s.mode === 'test' ? 'test/' : ''}customers/${encodeURIComponent(t.customer_id)}`} target="_blank" rel="noreferrer">{t.customer_id}</a> : 'Unavailable'}</td><td className="p-3 font-mono text-xs text-neutral-500">{t.id}</td>
          </tr>)}</tbody>
        </table>{!s.transactions.length && <p className="p-4 text-sm text-neutral-500">No transactions in this period.</p>}</div>
      </>}
    </>}
  </section>;
}
