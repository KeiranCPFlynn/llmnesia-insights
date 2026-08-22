import assert from 'node:assert/strict';
import test from 'node:test';
import { computeEvidenceDelta } from './evidence-delta.js';
import type { MetricsSnapshot } from './types.js';

function snapshot(input: {
  weekStart: string;
  weekEnd: string;
  installs: number;
  activationRate: number;
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
