process.env.INSIGHTS_DB_PATH = ':memory:';

import test from 'node:test';
import assert from 'node:assert/strict';
import { getClient } from './db/query.js';

const db = getClient();

test('seed: a site row for the foreign keys used by later tests', async () => {
  const { error } = await db
    .from('sites')
    .insert({ id: 's1', name: 'Seed', root_url: 'https://seed', gsc_property: 'sc-domain:seed', enabled: true });
  assert.equal(error, null);
});

test('insert applies column defaults and select round-trips json columns', async () => {
  const { error } = await db.from('weekly_insights').insert({
    week_start: '2026-09-28',
    week_end: '2026-10-04',
    metrics_snapshot: { installs: { total: 10 } },
    summary: 'test week',
    findings: [{ metric: 'installs', observation: 'up', severity: 'info' }],
    action_items: [],
    open_threads: [],
    resolved_threads: [],
    model_used: 'test',
  });
  assert.equal(error, null);

  const { data, error: fetchError } = await db
    .from('weekly_insights')
    .select('*')
    .eq('week_start', '2026-09-28')
    .maybeSingle();
  assert.equal(fetchError, null);
  const row = data as Record<string, unknown>;
  assert.equal(typeof row.id, 'string');
  assert.match(row.id as string, /^[0-9a-f-]{36}$/);
  assert.equal(typeof row.created_at, 'string');
  assert.deepEqual(row.findings, [{ metric: 'installs', observation: 'up', severity: 'info' }]);
  assert.deepEqual(row.metrics_snapshot, { installs: { total: 10 } });
  assert.deepEqual(row.corrections, []); // DDL default '[]' parsed
  assert.deepEqual(row.chat, []); // DDL default '[]' parsed
});

test('select(column list) returns only requested columns, decoded', async () => {
  await db.from('weekly_insights').insert({
    week_start: '2026-10-05',
    week_end: '2026-10-11',
    metrics_snapshot: {},
    summary: 's',
    findings: [],
    action_items: [],
    open_threads: [],
    resolved_threads: [],
    model_used: 'm',
  });
  const { data } = await db
    .from('weekly_insights')
    .select('week_start, summary, findings, action_items, open_threads')
    .order('week_start', { ascending: false });
  const rows = data as Record<string, unknown>[];
  assert.equal(rows.length, 2);
  assert.equal(rows[0].week_start, '2026-10-05'); // desc order
  assert.deepEqual(Object.keys(rows[0]).sort(), ['action_items', 'findings', 'open_threads', 'summary', 'week_start']);
  assert.deepEqual(rows[0].findings, []);
});

test('numeric filters: gte/lte/lt and ordering with limit', async () => {
  for (const score of [10, 20, 30, 40, 50]) {
    await db.from('growth_opportunities').insert({
      site_id: 's1',
      week_start: '2026-09-28',
      type: 'near_win',
      evidence: { reasons: ['x'] },
      score,
    });
  }
  const { data } = await db
    .from('growth_opportunities')
    .select('*')
    .gte('score', 20)
    .lt('score', 50)
    .order('score', { ascending: false })
    .limit(2);
  assert.deepEqual((data as Record<string, unknown>[]).map((r) => r.score), [40, 30]);
});

test('range() paginates PostgREST-style (inclusive)', async () => {
  const { count } = await db.from('growth_opportunities').select('*', { count: 'exact', head: true });
  assert.equal(count, 5);
  const { data } = await db
    .from('growth_opportunities')
    .select('score')
    .order('score', { ascending: true })
    .range(1, 3);
  assert.deepEqual((data as Record<string, unknown>[]).map((r) => r.score), [20, 30, 40]);
});

test('ilike and in() filters', async () => {
  await db.from('sites').insert({ name: 'LLMnesia', root_url: 'https://x', gsc_property: 'sc-domain:x', enabled: true });
  await db.from('sites').insert({ name: 'Other', root_url: 'https://y', gsc_property: 'sc-domain:y', enabled: false });

  const { data: byName } = await db.from('sites').select('*').ilike('name', 'llmnesia').maybeSingle();
  assert.equal((byName as Record<string, unknown>).name, 'LLMnesia');
  assert.equal((byName as Record<string, unknown>).enabled, true); // boolean decoded

  const { data: enabledRows } = await db.from('sites').select('name').eq('enabled', true);
  const enabledNames = (enabledRows as Record<string, unknown>[]).map((r) => r.name);
  assert.deepEqual(enabledNames.sort(), ['LLMnesia', 'Seed']); // 'Other' is disabled

  const { data: inRows } = await db.from('sites').select('name').in('name', ['LLMnesia', 'nope']);
  assert.equal((inRows as unknown[]).length, 1);
});

test('not(col, is, null) filters null values out', async () => {
  await db.from('weekly_insights').update({ strategy_goal: 'grow' }).eq('week_start', '2026-09-28');
  const { data } = await db
    .from('weekly_insights')
    .select('week_start, strategy_goal')
    .lt('week_start', '2026-10-01')
    .not('strategy_goal', 'is', null);
  const rows = data as Record<string, unknown>[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].strategy_goal, 'grow');
});

test('maybeSingle returns null for no match; single errors', async () => {
  const { data, error } = await db.from('weekly_insights').select('*').eq('week_start', '1999-01-01').maybeSingle();
  assert.equal(data, null);
  assert.equal(error, null);
  const single = await db.from('weekly_insights').select('*').eq('week_start', '1999-01-01').single();
  assert.notEqual(single.error, null);
});

test('upsert updates supplied columns and preserves unsupplied ones', async () => {
  await db.from('weekly_insights').update({ chat: [{ role: 'user', content: 'hi', ts: 't' }] }).eq('week_start', '2026-09-28');
  const { error } = await db.from('weekly_insights').upsert(
    {
      week_start: '2026-09-28',
      week_end: '2026-10-04',
      metrics_snapshot: { v: 2 },
      summary: 'regenerated',
      findings: [],
      action_items: [],
      open_threads: [],
      resolved_threads: [],
      model_used: 'm2',
    },
    { onConflict: 'week_start' },
  );
  assert.equal(error, null);
  const { data } = await db.from('weekly_insights').select('summary, chat, corrections').eq('week_start', '2026-09-28').maybeSingle();
  const row = data as Record<string, unknown>;
  assert.equal(row.summary, 'regenerated');
  assert.deepEqual(row.chat, [{ role: 'user', content: 'hi', ts: 't' }]); // survived
  assert.deepEqual(row.corrections, []); // survived
});

test('composite-key upsert on source_sync_state preserves omitted columns', async () => {
  const { error: first } = await db.from('source_sync_state').upsert(
    { source: 'PostHog', scope: 'llmnesia', status: 'fresh', last_success_at: '2026-10-01T00:00:00.000Z', last_attempt_at: '2026-10-01T00:00:00.000Z' },
    { onConflict: 'source,scope' },
  );
  assert.equal(first, null);
  const { error: second } = await db.from('source_sync_state').upsert(
    { source: 'PostHog', scope: 'llmnesia', status: 'failed', detail: '500', last_attempt_at: '2026-10-02T00:00:00.000Z' },
    { onConflict: 'source,scope' },
  );
  assert.equal(second, null);
  const { data } = await db.from('source_sync_state').select('*').eq('source', 'PostHog').maybeSingle();
  const row = data as Record<string, unknown>;
  assert.equal(row.status, 'failed');
  assert.equal(row.detail, '500');
  assert.equal(row.last_success_at, '2026-10-01T00:00:00.000Z'); // preserved
});

test('update().in().select() returns affected rows', async () => {
  for (const q of ['a', 'b', 'c', 'd']) {
    await db.from('growth_actions').insert({
      site_id: 's1',
      week_start: '2026-09-28',
      action_type: 'improve',
      status: 'planned',
      target_query: q,
    });
  }
  const { data, error } = await db
    .from('growth_actions')
    .update({ status: 'published', status_updated_at: '2026-10-06T00:00:00.000Z' })
    .in('target_query', ['a', 'b'])
    .select();
  assert.equal(error, null);
  const rows = data as Record<string, unknown>[];
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.status === 'published'));
});

test('delete removes matching rows only', async () => {
  const { error } = await db.from('growth_actions').delete().eq('target_query', 'a');
  assert.equal(error, null);
  const { count } = await db.from('growth_actions').select('*', { count: 'exact', head: true });
  assert.equal(count, 3);
});

test('unique constraint violation surfaces as { error } with a code', async () => {
  const dup = await db.from('weekly_insights').insert({
    week_start: '2026-09-28',
    week_end: '2026-10-04',
    metrics_snapshot: {},
    summary: 'dup',
    findings: [],
    action_items: [],
    open_threads: [],
    resolved_threads: [],
    model_used: 'm',
  });
  assert.notEqual(dup.error, null);
  assert.ok(dup.error!.code); // SQLITE_CONSTRAINT_UNIQUE or similar
});

test('batch insert of differing key shapes applies defaults per shape', async () => {
  const { error } = await db.from('ledger_entries').insert([
    { week_start: '2026-09-28', entry_type: 'patch', operation: 'add', model_used: 'm', patch: { a: 1 } },
    { week_start: '2026-09-28', entry_type: 'evidence', operation: 'add', model_used: 'm' }, // no patch → NULL
  ]);
  assert.equal(error, null);
  const { data } = await db.from('ledger_entries').select('patch, entry_type').order('entry_type');
  const rows = data as Record<string, unknown>[];
  assert.deepEqual(rows[0].patch, null); // 'evidence' row: patch omitted → NULL
  assert.deepEqual(rows[1].patch, { a: 1 }); // 'patch' row
});
