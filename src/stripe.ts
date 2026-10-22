import './env.js';
import type { StripeCurrencyMetrics, StripeMetrics, StripeTransaction } from './stripe-types.js';

// Pin the response contract without changing the account's API configuration.
const API_VERSION = '2025-02-24.acacia';
const MAX_PAGES = 25;
interface StripeObject { id: string; livemode?: boolean; created: number }
interface Price {
  currency: string;
  unit_amount: number | null;
  unit_amount_decimal?: string;
  billing_scheme?: string;
  transform_quantity?: unknown;
  tax_behavior?: string;
  recurring?: { interval: string; interval_count: number; usage_type: string };
}
interface Subscription extends StripeObject {
  status: string;
  customer: string;
  cancel_at_period_end: boolean;
  cancel_at?: number | null;
  pause_collection?: unknown;
  discounts?: unknown[];
  items: { data: Array<{ quantity?: number; price: Price; discounts?: unknown[] }>; has_more?: boolean };
}
interface Charge extends StripeObject {
  amount: number;
  amount_captured: number;
  currency: string;
  customer: string | null;
  paid: boolean;
  captured: boolean;
  status: string;
}
interface Refund extends StripeObject {
  amount: number;
  currency: string;
  status: string;
  charge?: string | Pick<Charge, 'id' | 'customer'> | null;
  customer?: string | null;
}

export function stripeExcludedCustomerIds(): string[] {
  return [...new Set((process.env.STRIPE_EXCLUDED_CUSTOMER_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean))].sort();
}

function dateParts(date: Date, timeZone: string) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
}

export function stripeDate(date: Date, timeZone: string): string {
  const p = dateParts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Resolve local midnight using the offset at that date, including DST. */
function midnight(date: string, timeZone: string): number {
  const target = Date.parse(`${date}T00:00:00Z`);
  let value = target;
  for (let i = 0; i < 4; i++) {
    const p = dateParts(new Date(value), timeZone);
    const local = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    const adjustment = target - local;
    value += adjustment;
    if (!adjustment) break;
  }
  return value / 1000;
}

export function stripeWindow(start: string, end: string, timeZone: string) {
  for (const date of [start, end]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
      throw new Error('Choose valid dates in YYYY-MM-DD format.');
    }
  }
  const days = (Date.parse(end) - Date.parse(start)) / 86400000;
  if (days < 0 || days > 365) throw new Error('Choose an ordered date range of at most 366 days.');
  const next = new Date(`${end}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { gte: midnight(start, timeZone), lt: midnight(next.toISOString().slice(0, 10), timeZone) };
}

export function summarizeStripe(input: {
  start: string; end: string; timeZone: string; now: Date; mode: 'live' | 'test';
  charges: Charge[]; refunds: Refund[]; customers: StripeObject[]; subscriptions: Subscription[];
  excludedCustomerIds?: readonly string[];
}): StripeMetrics {
  const { start, end, timeZone, now, mode } = input;
  const excluded = new Set(input.excludedCustomerIds ?? []);
  const charges = input.charges.filter(charge => !charge.customer || !excluded.has(charge.customer));
  const customers = input.customers.filter(customer => !excluded.has(customer.id));
  const subscriptions = input.subscriptions.filter(sub => !excluded.has(sub.customer));
  // Refunds can belong to charges outside the selected period. Use the expanded
  // original charge, not just the period's payments, to identify their customer.
  const chargeCustomers = new Map(input.charges.map(charge => [charge.id, charge.customer]));
  function refundCustomer(refund: Refund): string | null {
    if (typeof refund.customer === 'string') return refund.customer;
    if (refund.charge && typeof refund.charge === 'object' && 'customer' in refund.charge) return refund.charge.customer;
    if (typeof refund.charge === 'string' && chargeCustomers.has(refund.charge)) return chargeCustomers.get(refund.charge)!;
    if (refund.customer === null || refund.charge === null) return null;
    if (excluded.size) throw new Error('Stripe refund customer could not be resolved. Totals are withheld to avoid including excluded test activity.');
    return null;
  }
  const refunds = input.refunds.filter(refund => {
    const customer = refundCustomer(refund);
    return !customer || !excluded.has(customer);
  });
  const window = stripeWindow(start, end, timeZone);
  const warnings = new Set<string>();
  const currencies = new Map<string, StripeCurrencyMetrics>();
  const daily = new Map<string, StripeMetrics['daily'][number]>();
  const currency = (code: string) => {
    if (!currencies.has(code)) currencies.set(code, {
      currency: code, collected: 0, refunded: 0, collected_less_refunds: 0,
      successful_payments: 0, failed_payments: 0, mrr_before_discounts: 0, arr_before_discounts: 0,
    });
    return currencies.get(code)!;
  };
  const day = (created: number, code: string) => {
    const date = stripeDate(new Date(created * 1000), timeZone);
    const key = `${date}:${code}`;
    if (!daily.has(key)) daily.set(key, { date, currency: code, collected: 0, refunded: 0, payments: 0 });
    return daily.get(key)!;
  };
  const transactions: StripeTransaction[] = [];
  const payers = new Set<string>();
  for (const charge of charges) {
    const c = currency(charge.currency);
    const amount = charge.status === 'succeeded' && charge.paid && charge.captured ? charge.amount_captured : 0;
    if (amount > 0) {
      c.collected += amount;
      c.successful_payments++;
      const d = day(charge.created, charge.currency);
      d.collected += amount;
      d.payments++;
      if (charge.customer) payers.add(charge.customer);
      else warnings.add('Paying customers counts distinct Stripe customer IDs; guest payments without a customer ID are excluded.');
    }
    if (charge.status === 'failed') c.failed_payments++;
    transactions.push({ id: charge.id, created: new Date(charge.created * 1000).toISOString(),
      kind: 'payment', status: charge.paid && !charge.captured ? 'uncaptured' : charge.status,
      amount: amount || charge.amount, currency: charge.currency, customer_id: charge.customer });
  }
  for (const refund of refunds) {
    if (refund.status === 'succeeded') {
      currency(refund.currency).refunded += refund.amount;
      day(refund.created, refund.currency).refunded += refund.amount;
    }
    transactions.push({ id: refund.id, created: new Date(refund.created * 1000).toISOString(),
      kind: 'refund', status: refund.status, amount: refund.amount, currency: refund.currency, customer_id: refundCustomer(refund) });
  }
  const health = { active: 0, trialing: 0, past_due: 0, unpaid: 0,
    scheduled_to_cancel: 0, created_in_period: 0, current_subscribers: 0 };
  const subscribers = new Set<string>();
  for (const sub of subscriptions) {
    if (sub.created >= window.gte && sub.created < window.lt) health.created_in_period++;
    if (sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due' || sub.status === 'unpaid') health[sub.status]++;
    if (['active', 'trialing', 'past_due', 'unpaid'].includes(sub.status) && (sub.cancel_at_period_end || sub.cancel_at)) health.scheduled_to_cancel++;
    if (!['active', 'past_due'].includes(sub.status)) continue;
    subscribers.add(sub.customer);
    if (sub.pause_collection) warnings.add('Paused collection subscriptions remain in the contractual run rate; collection may be delayed.');
    if (sub.discounts?.length || sub.items.data.some(i => i.discounts?.length)) {
      warnings.add('MRR is before discounts. Discounted subscriptions may collect less than this run rate.');
    }
    for (const item of sub.items.data) {
      const price = item.price;
      const c = currency(price.currency);
      if (sub.items.has_more) {
        c.mrr_before_discounts = null;
        warnings.add('MRR is unavailable for a currency with an incomplete subscription item list.');
        continue;
      }
      if (price.recurring?.usage_type === 'metered') continue;
      const amount = Number(price.unit_amount_decimal ?? price.unit_amount);
      const r = price.recurring;
      const divisor = r && ({ month: 1, year: 12, week: 12 / 52, day: 12 / 365 }[r.interval]);
      if (!r || !divisor || r.interval_count <= 0 ||
        price.unit_amount == null && price.unit_amount_decimal == null || !Number.isFinite(amount) ||
        price.billing_scheme === 'tiered' || price.transform_quantity || price.tax_behavior === 'inclusive') {
        c.mrr_before_discounts = null;
        warnings.add('MRR is unavailable for currencies with tiered, transformed, tax-inclusive, unknown, or incomplete fixed pricing.');
        continue;
      }
      if (c.mrr_before_discounts !== null) c.mrr_before_discounts += amount * (item.quantity ?? 1) / (divisor * r.interval_count);
    }
  }
  health.current_subscribers = subscribers.size;
  for (const c of currencies.values()) {
    c.collected_less_refunds = c.collected - c.refunded;
    // Annualize before display rounding so a yearly price reconciles exactly.
    c.arr_before_discounts = c.mrr_before_discounts === null ? null : Math.round(c.mrr_before_discounts * 12);
    if (c.mrr_before_discounts !== null) c.mrr_before_discounts = Math.round(c.mrr_before_discounts);
  }
  return {
    status: 'available', mode, period: { start, end, time_zone: timeZone },
    collected_at: now.toISOString(), subscriptions_as_of: now.toISOString(),
    currencies: [...currencies.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    new_customers: customers.length, paying_customers: payers.size, subscriptions: health,
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    transactions: transactions.sort((a, b) => b.created.localeCompare(a.created)).slice(0, 100),
    transaction_count: transactions.length,
    exclusions: {
      customer_ids: [...excluded].sort(),
      records: {
        customers: input.customers.length - customers.length,
        payments: input.charges.length - charges.length,
        refunds: input.refunds.length - refunds.length,
        subscriptions: input.subscriptions.length - subscriptions.length,
      },
    },
    warnings: [...warnings],
  };
}

/** Read-only Stripe v1 integration. No SDK, webhook, or account changes needed. */
export async function collectStripeMetrics(start: string, end: string, opts: {
  apiKey?: string; fetcher?: typeof fetch; now?: Date; timeZone?: string;
  excludedCustomerIds?: readonly string[];
} = {}): Promise<StripeMetrics> {
  const now = opts.now ?? new Date();
  const timeZone = opts.timeZone ?? (process.env.REPORTING_TIME_ZONE?.trim() || 'Asia/Bangkok');
  const base: StripeMetrics = {
    status: 'not_configured', period: { start, end, time_zone: timeZone }, collected_at: now.toISOString(),
    currencies: [], new_customers: null, paying_customers: null, daily: [], transactions: [], transaction_count: 0, warnings: [],
  };
  const apiKey = opts.apiKey ?? process.env.STRIPE_READ_ONLY_KEY?.trim();
  if (!apiKey) return { ...base, detail: 'Stripe is not connected. Configure STRIPE_READ_ONLY_KEY on the server with a restricted read-only key.' };
  const mode = apiKey.startsWith('rk_live_') || apiKey.startsWith('sk_live_') ? 'live' : 'test';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    if (!/^(rk|sk)_(live|test)_/.test(apiKey)) throw new Error('Use a Stripe restricted API key, not a publishable key.');
    const excludedCustomerIds = opts.excludedCustomerIds ?? stripeExcludedCustomerIds();
    if (excludedCustomerIds.some(id => !/^cus_[A-Za-z0-9]+$/.test(id))) throw new Error('Stripe excluded customer IDs are invalid. Check STRIPE_EXCLUDED_CUSTOMER_IDS.');
    const window = stripeWindow(start, end, timeZone);
    const fetcher = opts.fetcher ?? fetch;
    async function list<T extends StripeObject>(resource: string, params: Record<string, string>): Promise<T[]> {
      const rows: T[] = [];
      const query = new URLSearchParams({ limit: '100', ...params });
      for (let page = 0; page < MAX_PAGES; page++) {
        const response = await fetcher(`https://api.stripe.com/v1/${resource}?${query}`, {
          method: 'GET', headers: { Authorization: `Bearer ${apiKey}`, 'Stripe-Version': API_VERSION },
          cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) throw new Error(`Stripe access denied for ${resource}. Check the restricted key's read permissions.`);
          if (response.status === 429) throw new Error('Stripe rate limit reached. Try refreshing later.');
          throw new Error(`Stripe ${resource} request failed (HTTP ${response.status}).`);
        }
        const body = await response.json() as { data: T[]; has_more: boolean };
        if (!Array.isArray(body.data) || typeof body.has_more !== 'boolean') throw new Error('Stripe returned an unexpected response.');
        if (body.data.some(row => row.livemode != null && row.livemode !== (mode === 'live'))) throw new Error('Stripe returned data from an unexpected mode.');
        rows.push(...body.data);
        if (!body.has_more) return rows;
        const cursor = body.data.at(-1)?.id;
        if (!cursor || cursor === query.get('starting_after')) throw new Error('Stripe pagination could not be completed.');
        query.set('starting_after', cursor);
      }
      throw new Error('Stripe data exceeds the bounded sync limit. Totals are withheld to avoid showing partial figures.');
    }
    const dateFilter = { 'created[gte]': String(window.gte), 'created[lt]': String(Math.min(window.lt, Math.floor(now.getTime() / 1000) + 1)) };
    const [charges, refunds, customers, subscriptions] = await Promise.all([
      list<Charge>('charges', dateFilter), list<Refund>('refunds', {
        ...dateFilter, ...(excludedCustomerIds.length ? { 'expand[]': 'data.charge' } : {}),
      }),
      list<StripeObject>('customers', dateFilter), list<Subscription>('subscriptions', { status: 'all' }),
    ]);
    return summarizeStripe({ start, end, timeZone, now, mode, charges, refunds, customers, subscriptions, excludedCustomerIds });
  } catch (error) {
    // Never propagate provider bodies, request headers, customer details, or credentials.
    const message = error instanceof Error ? error.message : '';
    return { ...base, status: 'unavailable', mode, detail: message.startsWith('Stripe ') || message.startsWith('Use a Stripe') || message.startsWith('Choose ')
      ? message : 'Stripe could not be read. Check the connection and try again.' };
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
