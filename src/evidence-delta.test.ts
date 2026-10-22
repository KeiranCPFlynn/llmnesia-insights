import assert from 'node:assert/strict';
import test from 'node:test';
import { computeEvidenceDelta } from './evidence-delta.js';
import type { MetricsSnapshot } from './types.js';

function snapshot(input: {
  weekStart: string;
  weekEnd: string;
  installs: number;
  activationRate: number;
  vaultFunnel?: MetricsSnapshot['vault_funnel'];
  partial?: MetricsSnapshot['partial'];
}): MetricsSnapshot {
  return {
    week_start: input.weekStart,
    week_end: input.weekEnd,
    installs: { total: input.installs },
    activation: { rate: input.activationRate },
    retention: { w1_rolling: { rate: 0 }, w4_rolling: { rate: 0 } },
    engagement: { wau: input.installs, searches_per_wau: 0 },
    search_quality: { click_rate: 0, zero_result_rate: 0 },
    email_capture: { rate: 0 },
    ga4: {
      website: { sessions: input.installs },
      extension: { store_installs: { events: input.installs } },
    },
    ...(input.vaultFunnel ? { vault_funnel: input.vaultFunnel } : {}),
    ...(input.partial ? { partial: input.partial } : {}),
  } as unknown as MetricsSnapshot;
}

test('partial reports do not promote incomplete count totals as notable changes', () => {
  const prior = snapshot({
    weekStart: '2026-08-10',
    weekEnd: '2026-08-16',
    installs: 100,
    activationRate: 0.2,
  });
  const current = snapshot({
    weekStart: '2026-08-17',
    weekEnd: '2026-08-19',
    installs: 20,
    activationRate: 0.3,
    partial: { as_of: '2026-08-19', days_elapsed: 3 },
  });

  const result = computeEvidenceDelta(current, prior);
  const labels = result.notable_changes.map((change) => change.metric);

  assert.equal(result.installs.direction, 'down');
  assert.equal(labels.includes('Installs'), false);
  assert.equal(labels.includes('Website sessions'), false);
  assert.equal(labels.includes('Activation rate'), true);
});

test('completed reports still surface meaningful count changes', () => {
  const prior = snapshot({
    weekStart: '2026-08-10',
    weekEnd: '2026-08-16',
    installs: 100,
    activationRate: 0.2,
  });
  const current = snapshot({
    weekStart: '2026-08-17',
    weekEnd: '2026-08-23',
    installs: 120,
    activationRate: 0.2,
  });

  const result = computeEvidenceDelta(current, prior);
  assert.equal(result.notable_changes.some((change) => change.metric === 'Installs'), true);
});

test('vault funnel steps diff against the prior week with direction', () => {
  const prior = snapshot({
    weekStart: '2026-09-21',
    weekEnd: '2026-09-27',
    installs: 100,
    activationRate: 0.2,
    vaultFunnel: {
      waitlist_joined: 4,
      created: 3,
      checkout_opened: 2,
      phone_qr_shown: 1,
      unlocked: 2,
      sync_completed: 9,
      sync_failed: 0,
      restore_completed: 1,
      website_checkout_started: 10,
      website_purchase_completed: 2,
    },
  });
  const current = snapshot({
    weekStart: '2026-09-28',
    weekEnd: '2026-10-04',
    installs: 100,
    activationRate: 0.2,
    vaultFunnel: {
      waitlist_joined: 6,
      created: 3,
      checkout_opened: 5,
      phone_qr_shown: 1,
      unlocked: 1,
      sync_completed: 9,
      sync_failed: 3,
      restore_completed: 1,
      website_checkout_started: 12,
      website_purchase_completed: 3,
    },
  });

  const result = computeEvidenceDelta(current, prior);

  assert.deepEqual(result.vault_funnel.waitlist_joined, {
    current: 6,
    prior: 4,
    change: 2,
    pct_change: 0.5,
    direction: 'up',
  });
  assert.equal(result.vault_funnel.created.direction, 'flat');
  assert.equal(result.vault_funnel.checkout_opened.direction, 'up');
  assert.equal(result.vault_funnel.unlocked.direction, 'down');
  assert.equal(result.vault_funnel.sync_failed.direction, 'up');
  assert.equal(result.vault_funnel.restore_completed.direction, 'flat');
  assert.equal(result.vault_funnel.website_checkout_started?.change, 2);
  assert.equal(result.vault_funnel.website_purchase_completed?.change, 1);

  // Old snapshots have no website collection; never invent a zero baseline.
  delete prior.vault_funnel.website_checkout_started;
  delete prior.vault_funnel.website_purchase_completed;
  const firstCollection = computeEvidenceDelta(current, prior);
  assert.equal(firstCollection.vault_funnel.website_checkout_started, null);
  assert.equal(firstCollection.vault_funnel.website_purchase_completed, null);
  assert.equal(firstCollection.notable_changes.some(change => change.metric.startsWith('Website Vault')), false);

  const labels = result.notable_changes.map((change) => change.metric);
  assert.equal(labels.includes('Vault waitlist joins'), true);
  assert.equal(labels.includes('Vault checkout opens'), true);
  assert.equal(labels.includes('Vault sync failures'), true);
  assert.equal(labels.includes('Vault unlocked'), true);
  assert.equal(labels.includes('Vault created'), false);
});

test('vault funnel counts degrade to zero when the prior snapshot predates the section', () => {
  const prior = snapshot({
    weekStart: '2026-09-14',
    weekEnd: '2026-09-20',
    installs: 100,
    activationRate: 0.2,
  });
  const current = snapshot({
    weekStart: '2026-09-21',
    weekEnd: '2026-09-27',
    installs: 100,
    activationRate: 0.2,
    vaultFunnel: {
      waitlist_joined: 2,
      created: 1,
      checkout_opened: 1,
      phone_qr_shown: 0,
      unlocked: 1,
      sync_completed: 4,
      sync_failed: 0,
      restore_completed: 0,
    },
  });

  const result = computeEvidenceDelta(current, prior);
  assert.deepEqual(result.vault_funnel.created, {
    current: 1,
    prior: 0,
    change: 1,
    pct_change: null,
    direction: 'up',
  });
});

test('click rate refuses legacy baselines and compares only matching definitions with coverage', () => {
  const prior = snapshot({ weekStart: '2026-10-05', weekEnd: '2026-10-11', installs: 1, activationRate: 0 });
  const current = structuredClone(prior);
  current.search_quality = { ...current.search_quality, click_rate_definition: 'from_search_v1', click_rate: 0.5,
    clicks: 5, recent_opens: 10, origin_unknown_opens: 4 };
  prior.search_quality.click_rate = 2.07;
  const legacy = computeEvidenceDelta(current, prior);
  assert.equal(legacy.click_rate, null);
  assert.equal(legacy.search_opens?.clicks, null);
  assert.match(legacy.click_rate_comparison_note!, /0.4.18/);
  assert.equal(legacy.notable_changes.some(n => n.metric === 'Search click rate'), false);
  const matching = structuredClone(current);
  matching.search_quality.click_rate = 0.4;
  matching.search_quality.recent_opens = 6;
  const result = computeEvidenceDelta(current, matching);
  assert.equal(result.click_rate?.prior, 0.4);
  assert.equal(result.click_rate?.current, 0.5);
  assert.equal(result.search_opens?.recents?.change, 4);
  matching.search_quality.click_rate = null;
  assert.equal(computeEvidenceDelta(current, matching).click_rate, null);
});
