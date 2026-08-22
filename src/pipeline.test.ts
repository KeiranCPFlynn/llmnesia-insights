import assert from 'node:assert/strict';
import test from 'node:test';
import { getCurrentWeek } from './pipeline.js';

test('getCurrentWeek uses the reporting timezone rather than the server UTC date', () => {
  const result = getCurrentWeek(
    new Date('2026-08-21T18:30:00.000Z'),
    'Asia/Bangkok',
  );

  assert.deepEqual(result, {
    weekStart: '2026-08-17',
    weekEnd: '2026-08-22',
    daysElapsed: 6,
  });
});

test('getCurrentWeek treats Sunday as day seven of the Monday reporting week', () => {
  const result = getCurrentWeek(
    new Date('2026-08-23T08:00:00.000Z'),
    'Asia/Bangkok',
  );

  assert.deepEqual(result, {
    weekStart: '2026-08-17',
    weekEnd: '2026-08-23',
    daysElapsed: 7,
  });
});
