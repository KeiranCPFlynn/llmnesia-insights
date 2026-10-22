import assert from 'node:assert/strict';
import test from 'node:test';
import { collectPayments, summarizePayments } from './payments.js';
import { computeEvidenceDelta } from './evidence-delta.js';
import type { MetricsSnapshot } from './types.js';

type Input = Parameters<typeof summarizePayments>[0];
const ts = (date: string) => Date.parse(`${date}T12:00:00Z`) / 1000;
const now = new Date('2026-10-20T12:00:00Z');
function sub(id: string, extra = {}): Input['subscriptions'][number] {
  return { id, created: ts('2026-09-08'), customer: `cus_${id}`, ended_at: null, canceled_at: null,
    cancel_at_period_end: false, status: 'active', ...extra };
}
function invoice(id: string, subscription: string, created: string, extra: Partial<Input['invoices'][number]> = {}): Input['invoices'][number] {
  return { id, created: ts(created), customer: `cus_${subscription}`, subscription, billing_reason: 'subscription_create',
    collection_method: 'charge_automatically', due_date: null, status: 'paid', amount_paid: 1200, total: 1200, total_excluding_tax: 1000,
    status_transitions: { paid_at: ts(created) }, lines: { has_more: false, data: [
      { id: `il_${id}`, created: ts(created), period: { start: ts(created), end: ts('2026-11-08') },
        price: { recurring: { interval: 'month', interval_count: 1 } } },
    ] }, ...extra };
}
function charge(id = 'ch_paid', extra = {}): Input['charges'][number] {
  return { id, created: ts('2026-10-13'), customer: 'cus_month', currency: 'gbp', paid: true, captured: true,
    status: 'succeeded', amount_captured: 1200, invoice: invoice('in_charge', 'month', '2026-10-13'), ...extra };
}
function input(extra: Partial<Input> = {}): Input {
  return { start: '2026-10-12', end: '2026-10-18', timeZone: 'Asia/Bangkok', now, mode: 'live', excludedCustomerIds: ['cus_founder'],
    subscriptions: [], invoices: [], charges: [], refunds: [], ...extra };
}
function available(value: ReturnType<typeof summarizePayments>) {
  assert.equal(value.status, 'available');
  return value;
}

test('historical coverage uses invoices, excludes tests and future/ended subscriptions, and counts discounts', () => {
  const annual = invoice('annual', 'year', '2026-09-08');
  annual.lines.data[0].price!.recurring!.interval = 'year';
  annual.lines.data[0].period.end = ts('2027-09-08');
  annual.total_discount_amounts = [{ amount: 100 }];
  const after = invoice('future', 'future', '2026-10-19');
  const result = available(summarizePayments(input({
    subscriptions: [sub('month', { status: 'canceled', ended_at: ts('2026-10-19') }), sub('year'),
      sub('ended', { status: 'canceled', ended_at: ts('2026-10-15'), canceled_at: ts('2026-10-14') }),
      sub('founder'), sub('future'), sub('trial', { status: 'trialing' }), sub('scheduled', { cancel_at_period_end: true, canceled_at: ts('2026-10-16') })],
    invoices: [invoice('monthly', 'month', '2026-10-08'), annual, invoice('ended', 'ended', '2026-10-13'),
      invoice('founder', 'founder', '2026-10-13'), after, invoice('trial', 'trial', '2026-10-13', { amount_paid: 0 }),
      invoice('scheduled', 'scheduled', '2026-10-13')],
  })));
  assert.deepEqual(result.active_subscriptions_at_week_end, { total: 3, monthly: 2, annual: 1, other: 0, discounted: 1 });
  assert.equal(result.new_paid_subscriptions, 2); // ended and scheduled first paid this week
  assert.equal(result.cancellations, 2);
  assert.deepEqual(result.scheduled_to_end_at_period_end, { count: 1, observed_at: now.toISOString() });
});

test('new paid uses first positive settlement, excluding trials, repeat invoices and out-of-band payments', () => {
  const old = invoice('old', 'old', '2026-09-08');
  old.lines.data[0].period.end = ts('2026-10-08');
  const result = available(summarizePayments(input({ subscriptions: [sub('old'), sub('delayed'), sub('manual')],
    invoices: [old, invoice('repeat', 'old', '2026-10-13', { billing_reason: 'subscription_cycle' }),
      invoice('delayed', 'delayed', '2026-10-01', { status_transitions: { paid_at: ts('2026-10-12') } }),
      invoice('manual', 'manual', '2026-10-13', { paid_out_of_band: true })],
  })));
  assert.equal(result.new_paid_subscriptions, 1);
});

test('renewals use due dates and cutoff settlement, retaining unpaid and excluding voided invoices', () => {
  const result = available(summarizePayments(input({ subscriptions: [sub('old')], invoices: [
    invoice('paid', 'old', '2026-10-13', { billing_reason: 'subscription_cycle' }),
    invoice('late', 'old', '2026-10-14', { billing_reason: 'subscription_cycle', status_transitions: { paid_at: ts('2026-10-19') } }),
    invoice('unpaid', 'old', '2026-10-14', { billing_reason: 'subscription_cycle', status: 'open', status_transitions: { paid_at: null } }),
    invoice('sent', 'old', '2026-10-01', { billing_reason: 'subscription_cycle', collection_method: 'send_invoice', due_date: ts('2026-10-15') }),
    invoice('void', 'old', '2026-10-14', { billing_reason: 'subscription_cycle', status: 'void', status_transitions: { paid_at: null, voided_at: ts('2026-10-15') } }),
  ] })));
  assert.deepEqual(result.renewals, { due: 4, paid: 2, unpaid: 2 });
});

test('GBP cash deducts successful refunds including older charges, excludes founder refunds and other currencies', () => {
  const old = charge('ch_old', { created: ts('2026-09-08') });
  const result = available(summarizePayments(input({ charges: [charge(), charge('ch_test', { customer: 'cus_founder' }),
    charge('ch_failed', { status: 'failed' }), charge('ch_eur', { currency: 'eur' })], refunds: [
    { id: 're_old', created: ts('2026-10-16'), currency: 'gbp', amount: 600, status: 'succeeded', charge: old },
    { id: 're_test', created: ts('2026-10-16'), currency: 'gbp', amount: 1200, status: 'succeeded', charge: charge('ch_test', { customer: 'cus_founder' }) },
    { id: 're_pending', created: ts('2026-10-16'), currency: 'gbp', amount: 1200, status: 'pending', charge: old },
  ] })));
  assert.deepEqual(result.revenue, { currency: 'gbp', collected_gbp: 10, refunded_gbp: 5, net_gbp: 5, tax_basis: 'before_tax' });
  assert(result.warnings.some(w => w.includes('Non-GBP')));
  const fallback = available(summarizePayments(input({ charges: [charge('guest', { invoice: null })] })));
  assert.equal(fallback.revenue.tax_basis, 'including_tax');
  assert.equal(fallback.revenue.net_gbp, 12);
});

test('collector fully paginates lists and embedded invoice lines, sends only GET and never retains PII', async () => {
  const urls: URL[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(init?.method, 'GET');
    const u = new URL(String(url)); urls.push(u);
    let data: unknown[] = [];
    let has_more = false;
    if (u.pathname.endsWith('/subscriptions')) data = [sub('month')];
    if (u.pathname.endsWith('/invoices')) data = [invoice('in1', 'month', '2026-10-13', { lines: { data: [], has_more: true } })];
    if (u.pathname.endsWith('/lines')) {
      const second = u.searchParams.has('starting_after');
      data = [{ ...invoice(second ? 'line2' : 'line1', 'month', '2026-10-13').lines.data[0], customer_email: 'secret@example.test' }];
      has_more = !second;
    }
    if (u.pathname.endsWith('/charges')) {
      const second = u.searchParams.has('starting_after');
      data = [charge(second ? 'ch2' : 'ch1')]; has_more = !second;
    }
    return new Response(JSON.stringify({ data, has_more }));
  }) as typeof fetch;
  const result = available(await collectPayments('2026-10-12', '2026-10-18', { apiKey: 'rk_live_fixture', now, fetcher, excludedCustomerIds: [] }));
  assert.equal(result.revenue.net_gbp, 20);
  assert.equal(result.active_subscriptions_at_week_end.total, 1);
  assert(urls.some(u => u.pathname.endsWith('/lines') && u.searchParams.has('starting_after')));
  assert(urls.some(u => u.searchParams.get('starting_after') === 'ch1'));
  assert(!JSON.stringify(result).includes('secret@example'));
  assert(!JSON.stringify(result).includes('rk_live_fixture'));
});

test('missing key, access failure, invalid pagination, wrong mode and network errors yield unavailable without secrets', async () => {
  let calls = 0;
  const missing = await collectPayments('2026-10-12', '2026-10-18', { apiKey: '', fetcher: (async () => { calls++; throw new Error(); }) as typeof fetch });
  assert.equal(missing.status, 'unavailable'); assert.equal(calls, 0);
  for (const fetcher of [
    async () => new Response('provider secrets', { status: 403 }),
    async () => { throw new Error('rk_live_secret customer@example.test'); },
    async () => new Response(JSON.stringify({ data: [], has_more: true })),
    async () => new Response(JSON.stringify({ data: [sub('wrong', { livemode: false })], has_more: false })),
    async () => new Response(JSON.stringify({ data: [sub('duplicate')], has_more: true })),
  ]) {
    const result = await collectPayments('2026-10-12', '2026-10-18', { apiKey: 'rk_live_fixture', now, fetcher: fetcher as typeof fetch });
    assert.equal(result.status, 'unavailable');
    assert(!JSON.stringify(result).includes('rk_live_secret'));
    assert(!JSON.stringify(result).includes('provider secrets'));
  }
});

test('payments deltas need matching mode, exclusions, timezone and tax basis, never a fabricated zero baseline', () => {
  const payments = available(summarizePayments(input({ charges: [charge()] })));
  const current = { payments } as MetricsSnapshot;
  assert.equal(computeEvidenceDelta(current, null).payments?.net_revenue_gbp, null);
  assert.equal(computeEvidenceDelta(current, current).payments?.net_revenue_gbp?.change, 0);
  const prior = { payments: { ...payments, excluded_customer_ids: [] } } as unknown as MetricsSnapshot;
  assert.equal(computeEvidenceDelta(current, prior).payments?.net_revenue_gbp, null);
  prior.payments = { ...payments, mode: 'test' };
  assert.equal(computeEvidenceDelta(current, prior).payments?.net_revenue_gbp, null);
  prior.payments = { ...payments, revenue: { ...payments.revenue, tax_basis: 'including_tax' } };
  assert.equal(computeEvidenceDelta(current, prior).payments?.net_revenue_gbp, null);
});

test('a previously paying subscription retains coverage on a fully discounted renewal, while a free trial does not', () => {
  const old = invoice('old', 'month', '2026-09-08');
  old.lines.data[0].period.end = ts('2026-10-08');
  const free = invoice('free', 'month', '2026-10-13', { amount_paid: 0, total: 0, total_excluding_tax: 0,
    billing_reason: 'subscription_cycle', total_discount_amounts: [{ amount: 1200 }] });
  const result = available(summarizePayments(input({ subscriptions: [sub('month'), sub('trial')],
    invoices: [old, free, invoice('trial', 'trial', '2026-10-13', { amount_paid: 0, total: 0 })] })));
  assert.equal(result.active_subscriptions_at_week_end.total, 1);
  assert.equal(result.active_subscriptions_at_week_end.discounted, 1);
  assert.equal(result.new_paid_subscriptions, 0);
  assert.deepEqual(result.renewals, { due: 1, paid: 1, unpaid: 0 });
});

test('pagination continues beyond 25 pages instead of returning partial totals', async () => {
  let pages = 0;
  const fetcher = (async (url: string | URL | Request) => {
    if (!new URL(String(url)).pathname.endsWith('/charges')) return new Response(JSON.stringify({ data: [], has_more: false }));
    pages++;
    return new Response(JSON.stringify({ data: [charge(`ch_${pages}`)], has_more: pages < 27 }));
  }) as typeof fetch;
  const result = available(await collectPayments('2026-10-12', '2026-10-18', { apiKey: 'rk_live_fixture', now, fetcher, excludedCustomerIds: [] }));
  assert.equal(pages, 27);
  assert.equal(result.revenue.net_gbp, 270);
});

test('a cancellation scheduled through a future cancel_at counts as ending at period end', () => {
  const result = available(summarizePayments(input({
    subscriptions: [sub('dated', { cancel_at: ts('2026-11-10'), canceled_at: ts('2026-10-08') }),
      sub('past', { cancel_at: ts('2026-10-01'), status: 'canceled', ended_at: ts('2026-10-01') }), sub('plain')],
    invoices: [invoice('dated', 'dated', '2026-10-07'), invoice('plain', 'plain', '2026-10-07')],
  })));
  assert.equal(result.scheduled_to_end_at_period_end.count, 1);
});
