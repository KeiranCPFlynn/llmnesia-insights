import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evidenceHash, validateAgentReview } from '../src/agent-review.js';
import { createInitialLedgerState } from '../src/ledger.js';
import type { AgentReview, EvidenceDeltaRecord, MetricsSnapshot } from '../src/types.js';

const fixturePath = resolve(process.cwd(), 'fixtures/agent-review.valid.json');
const review = JSON.parse(await readFile(fixturePath, 'utf8')) as AgentReview;
const snapshot = {
  week_start: review.evidence.week_start,
  week_end: review.evidence.week_end,
  partial: { as_of: review.evidence.data_as_of, days_elapsed: 6 },
} as MetricsSnapshot;
const evidence = {
  raw_snapshot: snapshot,
  delta: {
    week_start: review.evidence.week_start,
    week_end: review.evidence.week_end,
    prior_week_start: '2026-08-10',
    partial: snapshot.partial,
    notable_changes: [],
  },
} as unknown as EvidenceDeltaRecord;
review.evidence.snapshot_hash = evidenceHash(evidence);
const validated = validateAgentReview(
  review,
  evidence,
  createInitialLedgerState(),
  new Date('2026-08-22T12:00:00.000Z'),
);

console.log(`Fixture publish validation passed: ${validated.appliedPatches.length} patch(es), ${validated.strategy.recommendations.length} recommendation(s), ${validated.contextSources.length} provenance record(s).`);
