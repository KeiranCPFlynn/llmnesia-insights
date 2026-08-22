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
