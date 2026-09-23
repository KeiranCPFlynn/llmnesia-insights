import assert from 'node:assert/strict';
import test from 'node:test';
import { getReviewWeekStart } from './reporting-period.js';

const runDate = new Date('2026-09-20T16:34:43Z');
test('a normal Sunday review requests fresh current evidence, not the prior week', () => {
  assert.equal(getReviewWeekStart([], runDate), null);
  assert.equal(getReviewWeekStart(['--week-to-date'], runDate), null);
});
test('historical periods must be explicitly requested', () => {
  assert.equal(getReviewWeekStart(['--completed-week'], runDate), '2026-09-07');
  assert.equal(getReviewWeekStart(['--week-start', '2026-09-14'], runDate), '2026-09-14');
  assert.throws(() => getReviewWeekStart(['--week-start'], runDate), /requires/);
});
