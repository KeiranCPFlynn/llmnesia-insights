import assert from 'node:assert/strict';
import test from 'node:test';
import { evidenceHash, ReviewValidationError, validateAgentReview } from './agent-review.js';
import { createInitialLedgerState } from './ledger.js';
import type { AgentReview, EvidenceDeltaRecord, MetricsSnapshot } from './types.js';

const NOW = new Date('2026-08-22T12:00:00.000Z');

function evidence(): EvidenceDeltaRecord {
  const snapshot = {
    week_start: '2026-08-17',
    week_end: '2026-08-22',
    partial: { as_of: '2026-08-22', days_elapsed: 6 },
  } as MetricsSnapshot;
  return {
    raw_snapshot: snapshot,
    delta: {
      week_start: '2026-08-17',
      week_end: '2026-08-22',
      prior_week_start: '2026-08-10',
      partial: snapshot.partial,
      notable_changes: [],
    } as unknown as EvidenceDeltaRecord['delta'],
  };
}

function review(): AgentReview {
  const result: AgentReview = {
    schema_version: 1,
    agent: { name: 'Codex', model: 'GPT-5' },
    evidence: {
      week_start: '2026-08-17',
      week_end: '2026-08-22',
      data_as_of: '2026-08-22',
      prepared_at: '2026-08-22T10:00:00.000Z',
      snapshot_hash: '',
    },
    headline: 'Activation improved while acquisition remained stable.',
    summary: 'The evidence supports staying focused on activation.',
    facts: ['Activation rate rose by 5 percentage points.'],
    inferences: ['The onboarding change is the most plausible contributor.'],
    findings: [{ metric: 'Activation', observation: 'Rate increased.', severity: 'info', source: 'PostHog' }],
    action_items: [{ action: 'Measure another week.', rationale: 'One partial week is not conclusive.', priority: 'medium' }],
    open_threads: [],
    resolved_threads: [],
    ledger_patches: [{
      operation: 'update_north_star',
      changes: { north_star: 'Improve activation before expanding acquisition.' },
      rationale: 'Activation is the clearest current leverage point.',
    }],
    strategy: {
      narrative: 'Keep the current focus and measure the activation change.',
      recommendations: [{
        title: 'Measure onboarding activation',
        area: 'app',
        target_repo: 'LLMnesia',
        recommendation: 'Instrument the remaining onboarding step.',
        rationale: 'The current rate movement needs confirmation.',
        expected_impact: 'Higher-confidence activation diagnosis.',
        effort: 'S',
        confidence: 'medium',
        metrics_to_watch: ['activation_rate'],
        handoff: { coding_agent_prompt: 'Inspect onboarding instrumentation and add the missing event.' },
      }],
      risks: [],
      experiments: [],
    },
    sources: {
      git: [{ repo: 'LLMnesia', refs: ['abc1234'], files_inspected: ['src/onboarding.ts'], findings: ['Onboarding changed this week.'] }],
      conversations: [{ conversation_id: 'conv-1', reason: 'Captured the founder decision to prioritize activation.' }],
      follow_up_tools: ['PostHog'],
    },
  };
  result.evidence.snapshot_hash = evidenceHash(evidence());
  return result;
}

test('validates a complete agent review and fully applies its ledger patches', () => {
  const input = review();
  const result = validateAgentReview(input, evidence(), createInitialLedgerState(), NOW);
  assert.equal(result.ledgerState.north_star, 'Improve activation before expanding acquisition.');
  assert.equal(result.appliedPatches.length, 1);
  assert.equal(result.strategy.recommendations.length, 1);
  assert.match(result.strategy.recommendations[0].id, /^[0-9a-f-]{36}$/);
  assert.equal(result.contextSources.length, 3);
});

test('rejects an unknown ledger operation before any persistence is possible', () => {
  const input = review() as unknown as { ledger_patches: Array<Record<string, unknown>> };
  input.ledger_patches[0].operation = 'replace_everything';
  assert.throws(
    () => validateAgentReview(input, evidence(), createInitialLedgerState(), NOW),
    (error) => error instanceof ReviewValidationError && error.message.includes('operation is unknown'),
  );
});

test('rejects malformed recommendations and missing provenance', () => {
  const input = review();
  input.strategy.recommendations[0].metrics_to_watch = [''];
  input.sources.git = [];
  assert.throws(
    () => validateAgentReview(input, evidence(), createInitialLedgerState(), NOW),
    (error) => error instanceof ReviewValidationError &&
      error.message.includes('metrics_to_watch') && error.message.includes('sources.git'),
  );
});

test('rejects mismatched and stale evidence periods', () => {
  const input = review();
  input.evidence.week_end = '2026-08-21';
  input.evidence.prepared_at = '2026-08-01T00:00:00.000Z';
  assert.throws(
    () => validateAgentReview(input, evidence(), createInitialLedgerState(), NOW),
    (error) => error instanceof ReviewValidationError &&
      error.message.includes('week_end must match') && error.message.includes('evidence pack is stale'),
  );
});

test('rejects patches that target absent ledger entities', () => {
  const input = review();
  input.ledger_patches = [{
    operation: 'retire_hypothesis',
    target_id: 'missing',
    changes: {},
    rationale: 'This should not silently succeed.',
  }];
  assert.throws(
    () => validateAgentReview(input, evidence(), createInitialLedgerState(), NOW),
    (error) => error instanceof ReviewValidationError && error.message.includes('does not exist'),
  );
});

test('a replacement review can replay from the saved pre-review ledger without stacking patches', () => {
  const originalLedger = createInitialLedgerState();
  const first = validateAgentReview(review(), evidence(), originalLedger, NOW);
  const ledgerBefore = (first.auditEntry.patch as { ledger_before: typeof originalLedger }).ledger_before;
  const replacement = review();
  replacement.ledger_patches = [];
  replacement.headline = 'Replacement review with no warranted ledger change.';
  const second = validateAgentReview(replacement, evidence(), ledgerBefore, NOW);
  assert.equal(second.ledgerState.version, originalLedger.version);
  assert.equal(second.ledgerState.north_star, originalLedger.north_star);
});

test('evidence hashes survive JSONB-style object key reordering', () => {
  const left = {
    delta: { week_start: '2026-08-17', nested: { b: 2, a: 1 } },
    raw_snapshot: { week_end: '2026-08-22', week_start: '2026-08-17' },
  } as unknown as EvidenceDeltaRecord;
  const right = {
    raw_snapshot: { week_start: '2026-08-17', week_end: '2026-08-22' },
    delta: { nested: { a: 1, b: 2 }, week_start: '2026-08-17' },
  } as unknown as EvidenceDeltaRecord;
  assert.equal(evidenceHash(left), evidenceHash(right));
});

test('accepts a current prepared_at on the fixed clock', () => {
  const input = review();
  input.evidence.prepared_at = '2026-08-22T11:00:00.000Z';
  const result = validateAgentReview(input, evidence(), createInitialLedgerState(), NOW);
  assert.equal(result.review.evidence.prepared_at, '2026-08-22T11:00:00.000Z');
});

test('accepts the exact 48-hour boundary and rejects just beyond it', () => {
  const boundary = review();
  boundary.evidence.prepared_at = '2026-08-20T12:00:00.000Z';
  assert.doesNotThrow(() => validateAgentReview(boundary, evidence(), createInitialLedgerState(), NOW));

  const beyond = review();
  beyond.evidence.prepared_at = '2026-08-20T11:59:59.999Z';
  assert.throws(
    () => validateAgentReview(beyond, evidence(), createInitialLedgerState(), NOW),
    (error) => error instanceof ReviewValidationError && error.message.includes('evidence pack is stale'),
  );
});

test('rejects prepared_at that is not a parseable timezone-aware timestamp', () => {
  const cases: Array<[unknown, string]> = [
    ['not-a-date', 'valid ISO 8601 timestamp'],
    ['2026-02-30T10:00:00.000Z', 'valid ISO 8601 timestamp'],
    ['2025-02-29T10:00:00.000Z', 'valid ISO 8601 timestamp'],
    ['2026-13-01T10:00:00.000Z', 'valid ISO 8601 timestamp'],
    ['2026-08-22T25:00:00.000Z', 'valid ISO 8601 timestamp'],
    ['2026-08-22T10:00:00', 'valid ISO 8601 timestamp'],
    ['2026-08-22', 'valid ISO 8601 timestamp'],
    [42, 'required and must be a string'],
    [null, 'required and must be a string'],
    [undefined, 'required and must be a string'],
  ];
  for (const [value, expected] of cases) {
    const input = review();
    (input.evidence as unknown as Record<string, unknown>).prepared_at = value;
    assert.throws(
      () => validateAgentReview(input, evidence(), createInitialLedgerState(), NOW),
      (error) => error instanceof ReviewValidationError &&
        error.message.includes('evidence.prepared_at') &&
        error.message.includes(expected),
      `prepared_at ${String(value)} should be rejected with an identifying message`,
    );
  }
});

test('rejects a prepared_at later than the supplied validator clock', () => {
  const input = review();
  input.evidence.prepared_at = '2026-08-22T12:00:00.001Z';
  assert.throws(
    () => validateAgentReview(input, evidence(), createInitialLedgerState(), NOW),
    (error) => error instanceof ReviewValidationError && error.message.includes('in the future'),
  );
});

test('treats numeric-offset timestamps as their actual instant', () => {
  // 14:00+02:00 and 07:00-05:00 are both exactly the validator clock, so both
  // count as brand-new evidence rather than stale or future.
  for (const preparedAt of ['2026-08-22T14:00:00+02:00', '2026-08-22T07:00:00-05:00']) {
    const input = review();
    input.evidence.prepared_at = preparedAt;
    assert.doesNotThrow(() => validateAgentReview(input, evidence(), createInitialLedgerState(), NOW));
  }
  // 12:00+02:00 is 10:00Z, two hours old and still fresh.
  const offsetInput = review();
  offsetInput.evidence.prepared_at = '2026-08-22T12:00:00+02:00';
  assert.doesNotThrow(() => validateAgentReview(offsetInput, evidence(), createInitialLedgerState(), NOW));
  // 13:59:59+02:00 is 11:59:59Z, one second past the 48-hour boundary.
  const staleOffset = review();
  staleOffset.evidence.prepared_at = '2026-08-20T13:59:59+02:00';
  assert.throws(
    () => validateAgentReview(staleOffset, evidence(), createInitialLedgerState(), NOW),
    (error) => error instanceof ReviewValidationError && error.message.includes('evidence pack is stale'),
  );
});

test('leaves the review, evidence record, and ledger untouched on rejection', () => {
  const input = review();
  const evidenceRecord = evidence();
  const ledger = createInitialLedgerState();
  const reviewBefore = structuredClone(input);
  const evidenceBefore = structuredClone(evidenceRecord);
  const ledgerBefore = structuredClone(ledger);
  input.evidence.prepared_at = 'not-a-date';
  assert.throws(() => validateAgentReview(input, evidenceRecord, ledger, NOW), ReviewValidationError);
  // Only the field the test deliberately set may differ; the validator itself
  // must not have mutated anything.
  const expectedAfter = structuredClone(reviewBefore);
  expectedAfter.evidence.prepared_at = 'not-a-date';
  assert.deepEqual(input, expectedAfter);
  assert.deepEqual(evidenceRecord, evidenceBefore);
  assert.deepEqual(ledger, ledgerBefore);
});
