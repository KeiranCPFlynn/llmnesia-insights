import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReferralSeries, isKnownAssistantSource, referralWeeks, type ReferralRow } from './ai-referrals.js';

const row = (overrides: Partial<ReferralRow> = {}): ReferralRow => ({
  date: '2026-10-05', source: 'gemini.google.com', medium: 'ai-assistant',
  landingPage: '/', channel: 'AI Assistant', host: 'www.llmnesia.com', sessions: 1, ...overrides,
});

test('preserves the channel series and supplements unassigned Gemini without double counting', () => {
  const result = buildReferralSeries([row({sessions: 3}), row({source: 'gemini', medium: '(not set)', channel: 'Unassigned', sessions: 2})]);
  assert.equal(result.weeks['2026-10-05'].sessions, 3);
  assert.equal(result.known_source_supplement.weeks['2026-10-05'].sessions, 5);
  assert.equal(result.known_source_supplement.outside_ai_channel_weeks['2026-10-05'].sessions, 2);
  assert.equal(result.production_combined.weeks['2026-10-05'].sessions, 5);
});
test('keeps unknown AI-channel sources and excludes preview hosts from supplements', () => {
  const result = buildReferralSeries([row({source:'new-assistant.example'}), row({host:'localhost', sessions:9})]);
  assert.equal(result.weeks['2026-10-05'].sessions, 10);
  assert.equal(result.production_combined.weeks['2026-10-05'].sessions, 1);
  assert.deepEqual(result.known_source_supplement.weeks, {});
});
test('does not match domains that merely contain an assistant name', () => {
  for (const source of ['notchatgpt.com','gemini.google.com.evil.test','my-gemini-blog','openai.com']) assert.equal(isKnownAssistantSource(source), false);
  assert.equal(isKnownAssistantSource('Gemini.Google.Com'), true);
});
test('retains every landing and source-by-day row beyond the top fifteen', () => {
  const rows = Array.from({length:20}, (_, i) => row({landingPage:`/page-${i}`}));
  const week = referralWeeks(rows)['2026-10-05'];
  assert.equal(Object.keys(week.landing_pages).length, 15);
  assert.equal(Object.keys(week.all_landing_pages).length, 20);
  assert.equal(week.source_page_days.length, 20);
  assert.equal(week.days['2026-10-05'], 20);
});
test('uses property calendar dates across Sunday/Monday without local timezone shifting', () => {
  const weeks = referralWeeks([row({date:'2026-10-04'}),row({date:'2026-10-05'})]);
  assert.equal(weeks['2026-09-28'].sessions,1);
  assert.equal(weeks['2026-10-05'].sessions,1);
  assert.throws(()=>referralWeeks([row({date:'2026-02-30'})]),/Invalid/);
});
