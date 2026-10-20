import './env.js';
import { stripeWindow } from './stripe.js';

interface Row { id: string; livemode?: boolean; created: number }
interface Subscription extends Row {
  customer: string;
  ended_at: number | null;
  canceled_at: number | null;
  cancel_at_period_end: boolean;
  status: string;
}
interface Line extends Row {
  type?: string;
  subscription?: string | null;
  proration?: boolean;
  period: { start: number; end: number };
  price?: { recurring?: { interval: string; interval_count: number } | null } | null;
  discount_amounts?: Array<{ amount: number }>;
}
interface Invoice extends Row {
  customer: string;
  subscription: string | null;
  billing_reason: string;
  collection_method: string;
  due_date: number | null;
  status: string;
  paid_out_of_band?: boolean;
  amount_paid: number;
  total: number;
  total_excluding_tax: number | null;
  starting_balance?: number;
  total_discount_amounts?: Array<{ amount: number }>;
  status_transitions: { paid_at: number | null; voided_at?: number | null };
  lines: { data: Line[]; has_more: boolean };
}
interface Charge extends Row {
  customer: string | null;
  invoice?: Invoice | string | null;
  currency: string;
  paid: boolean;
  captured: boolean;
  status: string;
  amount_captured: number;
}
interface Refund extends Row {
  charge: Charge | string;
  currency: string;
  amount: number;
  status: string;
}
interface PaymentBase {
  period: { start: string; end: string; time_zone: string };
  collected_at: string;
  mode: 'live' | 'test';
  excluded_customer_ids: string[];
}
export type PaymentsMetrics = (PaymentBase & {
  status: 'unavailable';
  detail: string;
}) | (PaymentBase & {
  status: 'available';
  active_subscriptions_at_week_end: { total: number; monthly: number; annual: number; other: number; discounted: number };
  new_paid_subscriptions: number;
  renewals: { due: number; paid: number; unpaid: number };
  cancellations: number;
  scheduled_to_end_at_period_end: { count: number; observed_at: string };
  revenue: { currency: 'gbp'; collected_gbp: number; refunded_gbp: number; net_gbp: number; tax_basis: 'before_tax' | 'including_tax' };
  warnings: string[];
});

class PaymentsError extends Error {}

export function summarizePayments(input: {
  start: string; end: string; timeZone: string; now: Date; mode: 'live' | 'test'; excludedCustomerIds: string[];
  subscriptions: Subscription[]; invoices: Invoice[]; charges: Charge[]; refunds: Refund[];
}): PaymentsMetrics {
  const { start, end, timeZone, now, mode } = input;
  const excluded_customer_ids = [...new Set(input.excludedCustomerIds)].sort();
  const excluded = new Set(excluded_customer_ids);
  const window = stripeWindow(start, end, timeZone);
  const cutoff = Math.min(window.lt, now.getTime() / 1000 + 1);
  const inWeek = (t: number | null | undefined): t is number => t != null && t >= window.gte && t < cutoff;
  const subscriptions = input.subscriptions.filter(s => !excluded.has(s.customer));
  const invoices = input.invoices.filter(i => !excluded.has(i.customer));
  const subById = new Map(subscriptions.map(s => [s.id, s]));
  const warnings = new Set<string>([
    'Account-wide Stripe measurements, excluding configured founder test customers. No currency conversion.',
    'Week-end active means paid recurring invoice coverage at the cutoff, excluding subscriptions already ended. Plan and discount reflect the covering invoice, not today’s subscription settings. Trials and unpaid coverage are excluded.',
    'Renewals are subscription_cycle invoices due in the week (due_date for send_invoice; created for automatic collection). Paid means settled by week end, including zero-amount invoices.',
    'Cancellations count requests dated canceled_at in the week, including requests to cancel later. Scheduled period-end cancellations are a current observation, timestamped separately; resumed cancellation requests cannot be reconstructed from current subscriptions.',
    'Revenue is captured GBP charges created in the week less successful GBP refunds created in the week, before Stripe fees, disputes, or payouts. Refunds can relate to older payments.',
  ]);
  const paidAt = (i: Invoice) => i.status_transitions.paid_at;
  const settledByCutoff = (i: Invoice) => paidAt(i) != null && paidAt(i)! < cutoff;
  const paidInvoices = invoices.filter(i => !i.paid_out_of_band && settledByCutoff(i));
  const firstPaid = new Map<string, number>();
  const coverage = new Map<string, { invoice: Invoice; line: Line }>();
  for (const invoice of paidInvoices) {
    if (!invoice.subscription || invoice.amount_paid <= 0) continue;
    const first = firstPaid.get(invoice.subscription);
    if (first == null || paidAt(invoice)! < first) firstPaid.set(invoice.subscription, paidAt(invoice)!);
  }
  for (const invoice of paidInvoices) {
    if (!invoice.subscription || !firstPaid.has(invoice.subscription)) continue;
    const id = invoice.subscription;
    const sub = subById.get(id);
    if (!sub) throw new PaymentsError('Stripe subscription history is incomplete. Weekly payment totals are withheld.');
    if (sub.ended_at != null && sub.ended_at < cutoff) continue;
    for (const line of invoice.lines.data) {
      if (line.proration || !line.price?.recurring || line.period.start >= cutoff || line.period.end < cutoff) continue;
      // The API's embedded line list is fully hydrated by the collector.
      const previous = coverage.get(id);
      if (!previous || line.period.start > previous.line.period.start ||
        line.period.start === previous.line.period.start && invoice.created > previous.invoice.created) {
        coverage.set(id, { invoice, line });
      }
    }
  }
  const active = { total: coverage.size, monthly: 0, annual: 0, other: 0, discounted: 0 };
  for (const { invoice, line } of coverage.values()) {
    const recurring = line.price!.recurring!;
    if (recurring.interval === 'month' && recurring.interval_count === 1) active.monthly++;
    else if (recurring.interval === 'year' && recurring.interval_count === 1) active.annual++;
    else active.other++;
    if (invoice.total_discount_amounts?.some(d => d.amount > 0) || line.discount_amounts?.some(d => d.amount > 0)) active.discounted++;
  }
  const due = invoices.filter(i => i.subscription && i.billing_reason === 'subscription_cycle' &&
    inWeek(i.collection_method === 'send_invoice' ? i.due_date : i.created) &&
    !(i.status_transitions.voided_at != null && i.status_transitions.voided_at < cutoff));
  const paid = due.filter(settledByCutoff).length;

  const charges = input.charges.filter(c => !c.customer || !excluded.has(c.customer));
  const refunds = input.refunds.filter(r => {
    if (typeof r.charge !== 'object' || r.charge == null) throw new PaymentsError('Stripe refund customer could not be resolved. Weekly payment totals are withheld.');
    return !r.charge.customer || !excluded.has(r.charge.customer);
  });
  const collected = charges.filter(c => inWeek(c.created) && c.currency === 'gbp' && c.paid && c.captured && c.status === 'succeeded');
  const refunded = refunds.filter(r => inWeek(r.created) && r.currency === 'gbp' && r.status === 'succeeded');
  const taxRatio = (charge: Charge): number | null => {
    const i = charge.invoice;
    if (!i || typeof i !== 'object' || i.total_excluding_tax == null || i.total <= 0 ||
      i.total !== i.amount_paid || i.amount_paid !== charge.amount_captured || i.starting_balance) return null;
    return i.total_excluding_tax / i.total;
  };
  const beforeTax = collected.every(c => taxRatio(c) != null) && refunded.every(r => taxRatio(r.charge as Charge) != null);
  const collectMinor = collected.reduce((n, c) => n + c.amount_captured * (beforeTax ? taxRatio(c)! : 1), 0);
  const refundMinor = refunded.reduce((n, r) => n + r.amount * (beforeTax ? taxRatio(r.charge as Charge)! : 1), 0);
  if (!beforeTax) warnings.add('Tax could not be separated for every payment/refund, so all revenue figures include tax.');
  if (beforeTax && refunded.length) warnings.add('Refund tax is allocated proportionally using the original invoice total excluding tax.');
  if (charges.some(c => c.currency !== 'gbp') || refunds.some(r => r.currency !== 'gbp')) warnings.add('Non-GBP payments and refunds are excluded from GBP revenue; no FX conversion is applied.');
  const gbp = (n: number) => Math.round(n) / 100;
  return {
    status: 'available', mode, period: { start, end, time_zone: timeZone }, collected_at: now.toISOString(), excluded_customer_ids,
    active_subscriptions_at_week_end: active,
    new_paid_subscriptions: [...firstPaid.values()].filter(inWeek).length,
    renewals: { due: due.length, paid, unpaid: due.length - paid },
    cancellations: subscriptions.filter(s => inWeek(s.canceled_at)).length,
    scheduled_to_end_at_period_end: {
      count: subscriptions.filter(s => s.cancel_at_period_end && !['canceled', 'incomplete_expired'].includes(s.status)).length,
      observed_at: now.toISOString(),
    },
    revenue: { currency: 'gbp', collected_gbp: gbp(collectMinor), refunded_gbp: gbp(refundMinor),
      net_gbp: gbp(collectMinor - refundMinor), tax_basis: beforeTax ? 'before_tax' : 'including_tax' },
    warnings: [...warnings],
  };
}

/** GET only; never stores provider payloads, customer PII, or credentials. */
export async function collectPayments(start: string, end: string, opts: {
  apiKey?: string; fetcher?: typeof fetch; now?: Date; timeZone?: string; excludedCustomerIds?: string[];
} = {}): Promise<PaymentsMetrics> {
  const now = opts.now ?? new Date();
  const timeZone = opts.timeZone ?? (process.env.REPORTING_TIME_ZONE?.trim() || 'Asia/Bangkok');
  const key = opts.apiKey ?? process.env.STRIPE_READ_ONLY_KEY?.trim();
  const mode = key?.startsWith('rk_live_') ? 'live' : 'test';
  const excluded_customer_ids = [...new Set(opts.excludedCustomerIds ??
    (process.env.STRIPE_EXCLUDED_CUSTOMER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean))].sort();
  const base: PaymentBase = { period: { start, end, time_zone: timeZone }, collected_at: now.toISOString(), mode, excluded_customer_ids };
  if (!key) return { ...base, status: 'unavailable', detail: 'Stripe payments unavailable: STRIPE_READ_ONLY_KEY is missing.' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    if (!/^rk_(live|test)_/.test(key)) throw new PaymentsError('Stripe payments require a restricted read-only key.');
    if (excluded_customer_ids.some(id => !/^cus_[A-Za-z0-9]+$/.test(id))) throw new PaymentsError('Stripe excluded customer IDs are invalid.');
    const window = stripeWindow(start, end, timeZone);
    const fetcher = opts.fetcher ?? fetch;
    async function list<T extends Row>(resource: string, params: Record<string, string> = {}): Promise<T[]> {
      const query = new URLSearchParams({ limit: '100', ...params });
      const rows: T[] = [];
      const seen = new Set<string>();
      while (true) {
        const response = await fetcher(`https://api.stripe.com/v1/${resource}?${query}`, {
          method: 'GET', headers: { Authorization: `Bearer ${key}`, 'Stripe-Version': '2025-02-24.acacia' },
          cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) throw new PaymentsError(`Stripe payments unavailable: ${resource.split('/')[0]} returned HTTP ${response.status}.`);
        const body = await response.json() as { data: T[]; has_more: boolean };
        if (!Array.isArray(body.data) || typeof body.has_more !== 'boolean') throw new PaymentsError('Stripe payments returned an unexpected response.');
        for (const row of body.data) {
          if (!row.id || seen.has(row.id) || row.livemode != null && row.livemode !== (mode === 'live')) {
            throw new PaymentsError('Stripe payments returned duplicate, invalid, or wrong-mode records.');
          }
          seen.add(row.id);
        }
        rows.push(...body.data);
        if (!body.has_more) return rows;
        const last = body.data.at(-1)?.id;
        if (!last) throw new PaymentsError('Stripe payments pagination was incomplete.');
        query.set('starting_after', last);
      }
    }
    const upper = String(Math.min(window.lt, Math.floor(now.getTime() / 1000) + 1));
    const dateFilter = { 'created[gte]': String(window.gte), 'created[lt]': upper };
    // Fetch all invoice history through the cutoff: first paid dates and old
    // annual coverage cannot be inferred from invoices created this week alone.
    const subscriptions = await list<Subscription>('subscriptions', { status: 'all', 'created[lt]': upper });
    const invoices = await list<Invoice>('invoices', { 'created[lt]': upper });
    for (const invoice of invoices) {
      if (excluded_customer_ids.includes(invoice.customer)) continue;
      if (invoice.lines.has_more) invoice.lines = { data: await list<Line>(`invoices/${encodeURIComponent(invoice.id)}/lines`), has_more: false };
    }
    const charges = await list<Charge>('charges', { ...dateFilter, 'expand[]': 'data.invoice' });
    const refunds = await list<Refund>('refunds', { ...dateFilter, 'expand[]': 'data.charge.invoice' });
    return summarizePayments({ start, end, timeZone, now, mode, excludedCustomerIds: excluded_customer_ids, subscriptions, invoices, charges, refunds });
  } catch (error) {
    return { ...base, status: 'unavailable', detail: error instanceof PaymentsError
      ? error.message : 'Stripe payments could not be read. The remaining evidence is still available.' };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
