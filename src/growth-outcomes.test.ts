import assert from 'node:assert/strict';
import test from 'node:test';
import { outcomeCounts, outcomeQuery, outcomeWindows } from './growth-outcomes.js';

test('Monday audit excludes Sunday installs and matches weekdays; return cohort has seven full days',()=>{
  const w=outcomeWindows('2026-10-19',new Date('2026-10-26T02:03:11Z'));
  assert.deepEqual(w.activation.current,{start:'2026-10-19',end:'2026-10-24'});
  assert.deepEqual(w.activation.previous,{start:'2026-10-12',end:'2026-10-17'});
  assert.deepEqual(w.activation.omitted_install_dates,['2026-10-25']);
  assert.deepEqual(w.retention.current,{start:'2026-10-12',end:'2026-10-18'});
  assert.deepEqual(w.retention.previous,{start:'2026-10-05',end:'2026-10-11'});
});
test('historical rerun uses full requested week and never future cohorts',()=>{
  const w=outcomeWindows('2026-10-05',new Date('2026-10-26T02:03:11Z'));
  assert.equal(w.activation.current.end,'2026-10-11');
  assert.equal(w.retention.current.start,'2026-09-28');
  assert.throws(()=>outcomeWindows('2026-10-26',new Date('2026-10-26T02:03:11Z')));
  assert.throws(()=>outcomeQuery("2026-10-19'; DROP",'2026-10-24'));
});
test('partial cohorts do not present immature returns or small-cell rates',()=>{
  const row=[20,8,5,3,10,12,7,4,2,6,0,0];
  const partial=outcomeCounts(row);
  assert.equal(partial.returned_after_first_day,null);
  assert.equal(partial.intentional_search_rate_24h,null);
  assert.equal(partial.search_with_results_24h,5);
  assert.equal(partial.search_result_count_missing_installs,2);
  assert.equal(outcomeCounts(row,7).returned_after_first_day,2);
  assert.equal(outcomeCounts([100,40,30,20,50,60,35,25,15,40,0,0],7).return_rate_among_first_day_searchers,0.375);
  assert.equal(outcomeCounts([100,40,30,0,50,60,35,25,15,40,0,20]).opened_search_result_rate_24h,null);
  assert.equal(outcomeCounts([100,40,20,0,50,60,35,25,15,30,0,20]).search_with_results_rate_24h,null);
  assert.throws(()=>outcomeCounts([10,20,0,0,0,0,0,0,0,0,0,0]),/Inconsistent/);
  assert.throws(()=>outcomeCounts([]),/Invalid/);
});
test('query measures actual positive searches and search-origin opens, excludes internal IDs and guards windows',()=>{
  const query=outcomeQuery('2026-10-19','2026-10-24');
  assert.match(query,/toFloat\(e.props.result_count\) > 0/);
  assert.match(query,/toString\(e.props.from_search\) = 'true'/);
  assert.match(query,/WHERE internal_n = 0/);
  assert.match(query,/e.ts >= i.installed AND e.ts < i.installed \+ INTERVAL 7 DAY/);
  assert.match(query,/timestamp < toDateTime\('2026-10-25 00:00:00'/);
});
