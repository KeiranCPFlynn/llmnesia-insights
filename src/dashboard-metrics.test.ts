import assert from 'node:assert/strict';
import test from 'node:test';
import { toTrend } from '../lib/dashboard.js';
import type { WeeklyInsight } from './types.js';

test('the search chart leaves gaps for legacy definitions and missing coverage instead of plotting false zeroes', () => {
  const row = (search_quality: object) => ({ week_start: '2026-10-12', metrics_snapshot: { search_quality } }) as WeeklyInsight;
  const points = toTrend([
    row({ click_rate: 2.07 }),
    row({ click_rate_definition: 'from_search_v1', click_rate: null }),
    row({ click_rate_definition: 'from_search_v1', click_rate: 0 }),
    row({ click_rate_definition: 'from_search_v1', click_rate: 68 / 163 }),
  ]);
  assert.deepEqual(points.map(p => p.clickRate), [null, null, 0, 41.7]);
});
