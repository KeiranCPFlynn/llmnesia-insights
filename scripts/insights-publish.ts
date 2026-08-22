import '../src/env.js';

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  ReviewValidationError,
  reviewAuditId,
  validateAgentReview,
} from '../src/agent-review.js';
import {
  deleteStrategyLedger,
  getEvidenceRecordByWeek,
  getLedgerEntryById,
  getStrategyLedger,
  insertInsight,
  upsertContextSources,
  upsertLedgerEntries,
  upsertStrategyLedger,
} from '../src/supabase.js';
import type { AgentReview, WeeklyInsight } from '../src/types.js';
import type { StrategyLedgerState } from '../src/types.js';

function reviewWeek(input: unknown): string {
  const value = input as { evidence?: { week_start?: unknown } };
  if (typeof value?.evidence?.week_start !== 'string') {
    throw new ReviewValidationError(['evidence.week_start is required.']);
  }
  return value.evidence.week_start;
}

async function main() {
  const pathArg = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
  if (!pathArg) throw new Error('Usage: npm run insights:publish -- .insights/review.json');
  const reviewPath = resolve(process.cwd(), pathArg);
  const input = JSON.parse(await readFile(reviewPath, 'utf8')) as unknown;
  const weekStart = reviewWeek(input);

  // All reads and all validation happen before the first write. A ledger read
  // failure is fatal; it can never be interpreted as an empty first-run state.
  const [evidenceRecord, previousLedger, existingAudit] = await Promise.all([
    getEvidenceRecordByWeek(weekStart),
    getStrategyLedger(),
    getLedgerEntryById(reviewAuditId(weekStart)),
  ]);
  if (!evidenceRecord) {
    throw new ReviewValidationError([`No persisted evidence exists for ${weekStart}. Run npm run insights:prepare first.`]);
  }
  const existingPatch = existingAudit?.patch as { review_hash?: unknown; ledger_before?: unknown } | null;
  const replayLedger = existingPatch?.ledger_before as StrategyLedgerState | undefined;
  if (existingAudit && (!replayLedger || typeof replayLedger.version !== 'number')) {
    throw new Error(`The existing ${weekStart} audit predates safe replay metadata. Refusing to stack patches onto it.`);
  }
  const validated = validateAgentReview(input, evidenceRecord, replayLedger ?? previousLedger);
  const existingHash = (existingAudit?.patch as { review_hash?: unknown } | null)?.review_hash;
  if (existingAudit) {
    if (existingHash === validated.hash) {
      console.log(`Review ${weekStart} is already published with the same content; no writes were needed.`);
      return;
    }
    console.log(`Replacing the prior ${weekStart} review by replaying patches from its saved pre-review ledger.`);
  }

  const review = validated.review as AgentReview;
  const agentLabel = validated.strategy.model_used;
  const insight: Omit<WeeklyInsight, 'id' | 'created_at'> = {
    week_start: evidenceRecord.delta.week_start,
    week_end: evidenceRecord.delta.week_end,
    metrics_snapshot: evidenceRecord.raw_snapshot,
    headline: review.headline,
    summary: review.summary,
    findings: review.findings,
    action_items: review.action_items,
    open_threads: review.open_threads,
    resolved_threads: review.resolved_threads,
    strategy: validated.strategy,
    model_used: agentLabel,
  };

  // The ledger is written only after report/provenance writes succeed. If its
  // audit write fails, restore the exact previous singleton before surfacing
  // the failure so a failed publish never leaves strategy half-updated.
  await upsertContextSources(validated.contextSources);
  await insertInsight(insight);
  await upsertStrategyLedger(validated.ledgerState, agentLabel);
  try {
    await upsertLedgerEntries([...validated.patchEntries, validated.auditEntry]);
  } catch (error) {
    try {
      if (previousLedger) await upsertStrategyLedger(previousLedger, 'publish-rollback');
      else await deleteStrategyLedger();
    } catch (rollbackError) {
      throw new Error(
        `Audit write failed and Strategy Ledger rollback also failed. Audit: ${error instanceof Error ? error.message : String(error)}. ` +
        `Rollback: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
      );
    }
    throw error;
  }

  console.log(`Published agent review for ${weekStart}.`);
  console.log(`Agent: ${agentLabel}`);
  console.log(`Evidence: ${review.evidence.week_start} → ${review.evidence.week_end}, data as of ${review.evidence.data_as_of}`);
  console.log(`Wrote: weekly insight, ${validated.appliedPatches.length} ledger patch(es), ${validated.strategy.recommendations.length} recommendation(s), ${validated.contextSources.length} provenance record(s), and one audit record.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
