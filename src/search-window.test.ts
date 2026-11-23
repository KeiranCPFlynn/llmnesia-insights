import assert from 'node:assert/strict';
import test from 'node:test';
import { compareCompleteDays, type DailySearchTotal } from './search-window.js';

// Google daily clicks as read on 23 November 2026. Search Console marked
// 22 November as the first incomplete day (34 clicks against ~200 normally).
const clicks: Record<string, number> = {
  '2026-11-09': 270, '2026-11-10': 240, '2026-11-11': 239, '2026-11-12': 221,
  '2026-11-13': 191, '2026-11-14': 145, '2026-11-15': 183,
  '2026-11-16': 214, '2026-11-17': 236, '2026-11-18': 211, '2026-11-19': 198,
  '2026-11-20': 162, '2026-11-21': 139, '2026-11-22': 34,
};
const days: DailySearchTotal[] = Object.entries(clicks).map(([date, value]) => ({ date, clicks: value, impressions: value * 200 }));
const window = { weekStart: '2026-11-16', weekEnd: '2026-11-22', priorStart: '2026-11-09' };

test('an incomplete last day is left out and the prior week is cut to match', () => {
  const result = compareCompleteDays(days, window, '2026-11-21');
  assert.ok(result);
  assert.equal(result.clicks, 1160);
  assert.equal(result.prior_clicks, 1306);
  assert.deepEqual(result.compared_window, {
    current: { start: '2026-11-16', end: '2026-11-21' },
    prior: { start: '2026-11-09', end: '2026-11-14' },
    excluded_from: '2026-11-22',
  });
  // −11%, not the −20% a partial week against a full week reported.
  assert.equal(Math.round((result.clicks / result.prior_clicks - 1) * 100), -11);
});

test('a complete week compares all seven days of both weeks', () => {
  const result = compareCompleteDays(days, window, null);
  assert.ok(result);
  assert.equal(result.clicks, 1194);
  assert.equal(result.prior_clicks, 1489);
  assert.equal(result.compared_window.excluded_from, null);
  assert.equal(compareCompleteDays(days, window, '2026-11-30')?.compared_window.excluded_from, null);
});

test('no complete day in the reporting week returns null', () => {
  assert.equal(compareCompleteDays(days, window, '2026-11-15'), null);
});

test('a single complete day compares with the first prior day only', () => {
  const result = compareCompleteDays(days, window, '2026-11-16');
  assert.equal(result?.clicks, 214);
  assert.equal(result?.prior_clicks, 270);
  assert.equal(result?.compared_window.prior.end, '2026-11-09');
});
