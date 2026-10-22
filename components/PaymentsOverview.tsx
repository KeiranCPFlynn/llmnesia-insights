import type { PaymentsMetrics } from '../src/payments';
import { stripeMoney } from '../lib/stripe-format';

export function PaymentsOverview({ metrics }: { metrics?: PaymentsMetrics }) {
  if (!metrics) return null;
  return <section className="mb-8 rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
    <h2 className="text-sm font-semibold text-neutral-100">Paid subscriptions and renewals</h2>
    <p className="mt-1 text-xs text-neutral-500">{metrics.period.start} to {metrics.period.end} ({metrics.period.time_zone}) · {metrics.mode} mode · {metrics.excluded_customer_ids.length} test accounts excluded</p>
    {metrics.status === 'unavailable' ? <p className="mt-3 text-sm text-amber-200">{metrics.detail}</p> : <>
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ['Paid subscriptions at period end', String(metrics.active_subscriptions_at_week_end.total)],
          ['New paid subscriptions', String(metrics.new_paid_subscriptions)],
          ['Renewals paid / due', `${metrics.renewals.paid} / ${metrics.renewals.due}`],
          ['Collected less refunds', stripeMoney(Math.round(metrics.revenue.net_gbp * 100), 'gbp')],
        ].map(([label, value]) => <div key={label}><p className="text-xs text-neutral-500">{label}</p><p className="mt-1 text-xl font-semibold text-neutral-100">{value}</p></div>)}
      </div>
      <p className="mt-3 text-xs text-neutral-400">{metrics.active_subscriptions_at_week_end.monthly} monthly, {metrics.active_subscriptions_at_week_end.annual} annual, {metrics.active_subscriptions_at_week_end.discounted} discounted. {metrics.cancellations} cancellation requests in the period.</p>
      <p className="mt-2 text-xs text-neutral-500">Paid coverage is reconstructed from settled invoices. Revenue is {metrics.revenue.tax_basis === 'before_tax' ? 'before tax' : 'including tax'}, before fees. {metrics.scheduled_to_end_at_period_end.count} currently scheduled to end, observed {new Date(metrics.scheduled_to_end_at_period_end.observed_at).toLocaleString('en-GB', { timeZone: metrics.period.time_zone })}.</p>
      <details className="mt-3 text-xs text-neutral-500"><summary className="cursor-pointer">Definitions and limits</summary><ul className="mt-2 list-disc space-y-1 pl-4">{metrics.warnings.map(w => <li key={w}>{w}</li>)}</ul></details>
    </>}
  </section>;
}
