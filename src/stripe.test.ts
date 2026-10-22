import assert from 'node:assert/strict';
import test from 'node:test';
import { collectStripeMetrics, stripeWindow, summarizeStripe } from './stripe.js';
import { stripeMoney } from '../lib/stripe-format.js';
import { computeEvidenceDelta } from './evidence-delta.js';
import type { MetricsSnapshot } from './types.js';

const now = new Date('2026-10-13T10:00:00Z');
const created = Date.parse('2026-10-12T18:00:00Z') / 1000;
const base = { start: '2026-10-12', end: '2026-10-13', timeZone: 'Asia/Bangkok', now, mode: 'live' as const };
function subscription(id: string, amount: number, interval = 'month', status = 'active') {
  return { id, created, customer: 'cus_subscriber', status, cancel_at_period_end: false,
    items: { data: [{ quantity: 1, price: { currency: 'usd', unit_amount: amount,
      recurring: { interval, interval_count: 1, usage_type: 'licensed' } } }] } };
}
function charge(id: string, amount: number, customer: string | null = 'cus_payer') {
  return { id, created, amount, amount_captured: amount, currency: 'usd', customer, paid: true, captured: true, status: 'succeeded' };
}

test('MRR normalizes annual/multi-month plans and seats, includes past due, excludes trials and canceled', () => {
  const seats = subscription('seats', 500);
  seats.items.data[0].quantity = 3;
  seats.items.data[0].price.recurring.interval_count = 3;
  const s = summarizeStripe({ ...base, charges: [], refunds: [], customers: [], subscriptions: [
    subscription('monthly', 1000), subscription('annual', 12000, 'year'), seats,
    subscription('past-due', 500, 'month', 'past_due'),
    subscription('trial', 90000, 'month', 'trialing'), subscription('canceled', 90000, 'month', 'canceled'),
  ] });
  assert.equal(s.currencies[0].mrr_before_discounts, 3000);
  assert.equal(s.currencies[0].arr_before_discounts, 36000);
  assert.equal(s.subscriptions?.current_subscribers, 1);
  assert.equal(s.subscriptions?.past_due, 1);
  assert.equal(s.subscriptions?.trialing, 1);
});

test('one-time captured cash, failed and uncaptured attempts, older purchase refunds, guests, and currencies stay distinct', () => {
  const s = summarizeStripe({ ...base, customers: [{ id: 'cus_new', created }], subscriptions: [],
    charges: [charge('paid', 1000), charge('repeat', 500), charge('guest', 250, null),
      { ...charge('eur', 900), currency: 'eur' },
      { ...charge('failed', 1000), status: 'failed', paid: false, captured: false, amount_captured: 0 },
      { ...charge('auth', 2000), captured: false, amount_captured: 0 }],
    refunds: [{ id: 're_old', created, currency: 'usd', amount: 2000, status: 'succeeded' },
      { id: 're_pending', created, currency: 'usd', amount: 800, status: 'pending' }],
  });
  const usd = s.currencies.find(c => c.currency === 'usd')!;
  assert.equal(usd.collected, 1750);
  assert.equal(usd.refunded, 2000);
  assert.equal(usd.collected_less_refunds, -250);
  assert.equal(usd.mrr_before_discounts, 0);
  assert.equal(usd.failed_payments, 1);
  assert.equal(usd.successful_payments, 3);
  assert.equal(s.paying_customers, 1);
  assert.equal(s.new_customers, 1);
  assert.equal(s.currencies.find(c => c.currency === 'eur')?.collected, 900);
  assert.equal(s.transactions.find(t => t.id === 'auth')?.status, 'uncaptured');
  assert.equal(s.daily.find(d => d.currency === 'usd')?.date, '2026-10-13');
  assert(s.warnings.some(w => w.includes('guest')));
});

test('unknown fixed pricing withholds MRR while metered usage does not inflate it', () => {
  const tiered = { ...subscription('tiered', 1000), items: { data: [{ quantity: 1, price: {
    ...subscription('p', 1000).items.data[0].price, billing_scheme: 'tiered',
  } }] } };
  const metered = subscription('metered', 100000);
  metered.items.data[0].price.recurring.usage_type = 'metered';
  const result = summarizeStripe({ ...base, charges: [], refunds: [], customers: [], subscriptions: [tiered, metered] });
  assert.equal(result.currencies[0].mrr_before_discounts, null);
  assert.equal(result.currencies[0].arr_before_discounts, null);
  assert(result.warnings.length > 0);
});

test('historical payment reports explicitly timestamp current subscription observations', () => {
  const s = summarizeStripe({ ...base, start: '2026-09-01', end: '2026-09-30', charges: [], refunds: [], customers: [], subscriptions: [subscription('sub', 1000)] });
  assert.equal(s.subscriptions_as_of, now.toISOString());
  assert.equal(s.period.end, '2026-09-30');
  assert.equal(s.subscriptions?.created_in_period, 0);
});

test('ARR retains annual-plan precision and incomplete metered item lists cannot imply zero MRR', () => {
  const annual = subscription('annual', 19000, 'year');
  const result = summarizeStripe({ ...base, charges: [], refunds: [], customers: [], subscriptions: [annual] });
  assert.equal(result.currencies[0].mrr_before_discounts, 1583);
  assert.equal(result.currencies[0].arr_before_discounts, 19000);
  const incomplete = { ...subscription('incomplete', 100), items: {
    ...subscription('incomplete', 100).items, has_more: true,
  } };
  incomplete.items.data[0].price.recurring.usage_type = 'metered';
  const withheld = summarizeStripe({ ...base, charges: [], refunds: [], customers: [], subscriptions: [incomplete] });
  assert.equal(withheld.currencies[0].mrr_before_discounts, null);
});

test('reporting boundaries use Bangkok midnight and DST, reject invalid or unbounded dates', () => {
  const bangkok = stripeWindow('2026-10-12', '2026-10-13', 'Asia/Bangkok');
  assert.equal(new Date(bangkok.gte * 1000).toISOString(), '2026-10-11T17:00:00.000Z');
  assert.equal(new Date(bangkok.lt * 1000).toISOString(), '2026-10-13T17:00:00.000Z');
  const dst = stripeWindow('2026-03-08', '2026-03-08', 'America/New_York');
  assert.equal(dst.lt - dst.gte, 23 * 3600);
  assert.throws(() => stripeWindow('2026-02-30', '2026-03-01', 'UTC'));
  assert.throws(() => stripeWindow('2025-01-01', '2026-10-01', 'UTC'));
  assert.throws(() => stripeWindow('2026-10-13', '2026-10-12', 'UTC'));
});

test('Stripe currency rendering respects zero-decimal and compatibility currencies', () => {
  assert.equal(stripeMoney(1234, 'usd'), 'USD\u00a012.34');
  assert.equal(stripeMoney(1234, 'jpy'), 'JPY\u00a01,234');
  assert.equal(stripeMoney(500, 'isk'), 'ISK\u00a05');
  assert.equal(stripeMoney(500, 'ugx'), 'UGX\u00a05');
  assert.equal(stripeMoney(null, 'usd'), 'Unavailable');
});

test('collector paginates using read-only requests and stores no customer PII', async () => {
  const urls: URL[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    urls.push(url);
    assert.equal(init?.method, 'GET');
    assert.equal(init?.cache, 'no-store');
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers['Stripe-Version'], '2025-02-24.acacia');
    let data: unknown[] = [];
    let has_more = false;
    if (url.pathname.endsWith('/charges')) {
      const second = url.searchParams.has('starting_after');
      data = [{ ...charge(second ? 'ch_second' : 'ch_first', 1000), livemode: true, billing_details: { email: 'private@example.test' } }];
      has_more = !second;
      assert.equal(url.searchParams.get('created[gte]'), String(stripeWindow(base.start, base.end, base.timeZone).gte));
    }
    if (url.pathname.endsWith('/subscriptions')) assert.equal(url.searchParams.get('status'), 'all');
    return new Response(JSON.stringify({ data, has_more }), { status: 200 });
  }) as typeof fetch;
  const result = await collectStripeMetrics(base.start, base.end, { apiKey: 'rk_live_synthetic', now, fetcher });
  assert.equal(result.status, 'available');
  assert.equal(result.currencies[0].collected, 2000);
  assert(urls.some(u => u.searchParams.get('starting_after') === 'ch_first'));
  assert.equal(JSON.stringify(result).includes('private@example'), false);
  assert.equal(JSON.stringify(result).includes('rk_live'), false);
});

test('permission errors, network errors, wrong-mode data, and missing keys never produce zero totals or leak secrets', async () => {
  let called = false;
  const noKey = await collectStripeMetrics(base.start, base.end, { apiKey: '', fetcher: (async () => { called = true; throw new Error(); }) as typeof fetch });
  assert.equal(called, false);
  assert.equal(noKey.status, 'not_configured');
  assert.equal(noKey.new_customers, null);
  for (const fetcher of [
    (async () => new Response('sensitive provider body', { status: 403 })) as typeof fetch,
    (async () => { throw new Error('https://rk_live_secret:private@example.test'); }) as typeof fetch,
    (async () => new Response(JSON.stringify({ data: [{ id: 'wrong_mode', created, livemode: false }], has_more: false }))) as typeof fetch,
  ]) {
    const result = await collectStripeMetrics(base.start, base.end, { apiKey: 'rk_live_synthetic', now, fetcher });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.new_customers, null);
    assert.equal(result.currencies.length, 0);
    assert.equal(JSON.stringify(result).includes('private@example'), false);
    assert.equal(JSON.stringify(result).includes('sensitive provider'), false);
  }
});

test('pagination limit withholds incomplete totals', async () => {
  let page = 0;
  const fetcher = (async () => new Response(JSON.stringify({ data: [{ id: `row_${++page}`, created, livemode: true }], has_more: true }))) as typeof fetch;
  const result = await collectStripeMetrics(base.start, base.end, { apiKey: 'rk_live_synthetic', now, fetcher });
  assert.equal(result.status, 'unavailable');
  assert.match(result.detail!, /bounded sync limit/);
  assert.deepEqual(result.currencies, []);
});

test('Stripe deltas do not invent baselines from missing data, absent currencies, or a different mode', () => {
  const stripe = summarizeStripe({ ...base, charges: [charge('ch', 1000)], refunds: [], customers: [], subscriptions: [] });
  const current = { week_start: base.start, week_end: base.end, stripe } as MetricsSnapshot;
  assert.equal(computeEvidenceDelta(current, null).stripe?.currencies[0].collected, null);
  const previous = { ...current, stripe: { ...stripe, mode: 'test' as const } };
  assert.equal(computeEvidenceDelta(current, previous).stripe?.currencies[0].collected, null);
  const same = computeEvidenceDelta(current, current);
  assert.equal(same.stripe?.currencies[0].collected?.change, 0);
  assert.equal('mrr' in same.stripe!, false);
});

test('test customers are excluded from payments, refunds of older purchases, subscriptions and customer counts', () => {
  const result = summarizeStripe({ ...base, excludedCustomerIds: ['cus_test'],
    customers: [{ id: 'cus_test', created }, { id: 'cus_real', created }],
    charges: [charge('ch_test', 9000, 'cus_test'), charge('ch_real', 800, 'cus_real')],
    subscriptions: [{ ...subscription('sub_test', 9000), customer: 'cus_test' },
      { ...subscription('sub_real', 800), customer: 'cus_real' }],
    refunds: [
      { id: 're_test', created, currency: 'usd', amount: 9000, status: 'succeeded', charge: { id: 'ch_old_test', customer: 'cus_test' } },
      { id: 're_real', created, currency: 'usd', amount: 200, status: 'succeeded', charge: { id: 'ch_old_real', customer: 'cus_real' } },
    ],
  });
  assert.equal(result.new_customers, 1);
  assert.equal(result.paying_customers, 1);
  assert.equal(result.subscriptions?.active, 1);
  assert.equal(result.currencies[0].mrr_before_discounts, 800);
  assert.equal(result.currencies[0].collected_less_refunds, 600);
  assert.deepEqual(result.exclusions?.records, { customers: 1, payments: 1, refunds: 1, subscriptions: 1 });
  assert.deepEqual(result.transactions.map(t => t.id).sort(), ['ch_real', 're_real']);
  assert.throws(() => summarizeStripe({ ...base, excludedCustomerIds: ['cus_test'],
    customers: [], charges: [], subscriptions: [],
    refunds: [{ id: 're_unknown', created, currency: 'usd', amount: 200, status: 'succeeded', charge: 'ch_old_unknown' }],
  }), /refund customer could not be resolved/);
});

test('collector expands refund ownership and Stripe comparisons require matching exclusions', async () => {
  let expanded = false;
  const result = await collectStripeMetrics(base.start, base.end, {
    apiKey: 'rk_live_synthetic', now, excludedCustomerIds: ['cus_test'],
    fetcher: (async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/refunds')) expanded = url.searchParams.get('expand[]') === 'data.charge';
      return new Response(JSON.stringify({ data: [], has_more: false }));
    }) as typeof fetch,
  });
  assert.equal(result.status, 'available');
  assert.equal(expanded, true);
  const withTests = summarizeStripe({ ...base, charges: [charge('ch', 800)], refunds: [], customers: [], subscriptions: [] });
  const withoutTests = summarizeStripe({ ...base, excludedCustomerIds: ['cus_test'], charges: [charge('ch', 800)], refunds: [], customers: [], subscriptions: [] });
  const current = { week_start: base.start, week_end: base.end, stripe: withoutTests } as MetricsSnapshot;
  const prior = { ...current, stripe: withTests };
  const delta = computeEvidenceDelta(current, prior).stripe!;
  assert.equal(delta.currencies[0].collected, null);
  assert.match(delta.comparison_note!, /exclusions changed/);
});
