import { AppShell } from '../../components/AppShell';
import { RevenueOverview } from '../../components/RevenueOverview';
import { getCurrentWeek } from '../../src/reporting-period.js';
import { collectStripeMetrics, stripeWindow } from '../../src/stripe.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function RevenuePage({ searchParams }: {
  searchParams: Promise<{ start?: string; end?: string; period?: string }>;
}) {
  const params = await searchParams;
  const current = getCurrentWeek();
  const start = params.start ?? params.period ?? current.weekStart;
  const periodDate = params.period && /^\d{4}-\d{2}-\d{2}$/.test(params.period) ? Date.parse(`${params.period}T00:00:00Z`) : NaN;
  const periodEnd = Number.isFinite(periodDate) ? new Date(periodDate + 6 * 86400000).toISOString().slice(0, 10) : current.weekEnd;
  const end = params.end ?? (periodEnd < current.weekEnd ? periodEnd : current.weekEnd);
  const timeZone = process.env.REPORTING_TIME_ZONE?.trim() || 'Asia/Bangkok';
  let error: string | null = null;
  try { stripeWindow(start, end, timeZone); } catch (e) { error = e instanceof Error ? e.message : 'Invalid date range.'; }
  const metrics = error ? undefined : await collectStripeMetrics(start, end);
  return <AppShell week={error ? current.weekStart : start} eyebrow="Stripe overview" title="Revenue"
    description="See recurring revenue, money collected, customer growth, and subscription health in one place."
    context={`Payment dates use ${timeZone}. Subscription figures show the current state.`}>
    <form action="/revenue" className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <label className="text-xs text-neutral-400">From<input type="date" name="start" defaultValue={start} required className="mt-1 block rounded-lg border border-neutral-700 bg-neutral-950 p-2 text-sm text-neutral-200" /></label>
      <label className="text-xs text-neutral-400">To<input type="date" name="end" defaultValue={end} required className="mt-1 block rounded-lg border border-neutral-700 bg-neutral-950 p-2 text-sm text-neutral-200" /></label>
      <button className="rounded-lg bg-violet-300 px-4 py-2 text-sm font-medium text-neutral-950">Refresh Stripe data</button>
      <a href="/revenue" className="px-2 py-2 text-sm text-neutral-400 hover:text-neutral-200">This week</a>
    </form>
    {error ? <p role="alert" className="rounded-xl border border-rose-400/30 p-4 text-sm text-rose-300">{error}</p> : <RevenueOverview metrics={metrics} />}
  </AppShell>;
}
