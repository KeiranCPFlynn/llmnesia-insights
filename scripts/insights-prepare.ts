import '../src/env.js';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { collectEvidence } from '../src/evidence.js';
import { evidenceHash } from '../src/agent-review.js';
import {
  getLatestInsight,
  getStandingCaveats,
  getStrategyLedger,
} from '../src/supabase.js';
import type { AgentEvidencePack, AgentReview, WeeklyInsight } from '../src/types.js';

const OUTPUT_DIR = resolve(process.cwd(), '.insights');
const PACK_PATH = resolve(OUTPUT_DIR, 'evidence-pack.json');
const REVIEW_PATH = resolve(OUTPUT_DIR, 'review.json');
const REVIEW_TEMPLATE_PATH = resolve(OUTPUT_DIR, 'review.template.json');

const METRIC_DEFINITIONS: Record<string, string> = {
  installs: 'PostHog extension_installed events in the reporting period.',
  activation_rate: 'Share of installs with an activation event within 24 hours.',
  wau: 'Distinct installs with a user-initiated event during the reporting period.',
  searches_per_wau: 'search_submitted events divided by weekly active users.',
  click_rate: 'Result clicks divided by submitted searches.',
  zero_result_rate: 'Submitted searches returning zero results divided by submitted searches.',
  retention_w1: 'Share of users active in the prior week who returned in the reporting period.',
  retention_w4: 'Share of users active four weeks ago who returned in the reporting period.',
};

function sanitizePreviousReview(review: WeeklyInsight | null): WeeklyInsight | null {
  if (!review) return null;
  return {
    week_start: review.week_start,
    week_end: review.week_end,
    metrics_snapshot: review.metrics_snapshot,
    headline: review.headline,
    summary: review.summary,
    findings: review.findings,
    action_items: review.action_items,
    open_threads: review.open_threads,
    resolved_threads: review.resolved_threads,
    strategy: review.strategy,
    strategy_goal: review.strategy_goal,
    strategy_decisions: review.strategy_decisions,
    model_used: review.model_used,
    created_at: review.created_at,
  };
}

function reviewTemplate(pack: AgentEvidencePack): AgentReview {
  return {
    schema_version: 1,
    agent: { name: 'Codex or Claude Code', model: 'replace with the actual model' },
    evidence: {
      week_start: pack.reporting_period.week_start,
      week_end: pack.reporting_period.week_end,
      data_as_of: pack.reporting_period.data_as_of,
      prepared_at: pack.generated_at,
      snapshot_hash: evidenceHash({
        delta: pack.evidence.computed_delta,
        raw_snapshot: pack.evidence.current_snapshot,
      }),
    },
    headline: 'REPLACE: one evidence-grounded sentence',
    summary: 'REPLACE: concise synthesis separating evidence from interpretation',
    facts: ['REPLACE: directly observed fact with a metric or inspected source'],
    inferences: ['REPLACE: clearly labelled interpretation supported by the facts'],
    findings: [],
    action_items: [],
    open_threads: [],
    resolved_threads: [],
    ledger_patches: [],
    strategy: {
      narrative: 'REPLACE: what the evidence means for the current strategy',
      recommendations: [],
      risks: [],
      experiments: [],
    },
    sources: {
      git: [{ repo: 'REPLACE', refs: ['REPLACE commit SHA'], files_inspected: ['REPLACE path'], findings: ['REPLACE finding'] }],
      conversations: [{ conversation_id: 'REPLACE', reason: 'REPLACE decision, constraint, rejected idea, or recent work retrieved' }],
      follow_up_tools: [],
    },
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const evidence = await collectEvidence({ dryRun, log: (message) => console.log(`[evidence] ${message}`) });
  const [ledger, previousReview, standingCaveats] = await Promise.all([
    getStrategyLedger(),
    getLatestInsight(),
    getStandingCaveats(false),
  ]);
  const generatedAt = new Date().toISOString();
  const safePreviousReview = sanitizePreviousReview(previousReview);
  const pack: AgentEvidencePack = {
    schema_version: 1,
    generated_at: generatedAt,
    reporting_period: {
      week_start: evidence.weekStart,
      week_end: evidence.weekEnd,
      data_as_of: evidence.dataAsOf,
      partial: Boolean(evidence.currentSnapshot.partial),
    },
    freshness: evidence.freshness,
    evidence: {
      current_snapshot: evidence.currentSnapshot,
      prior_snapshot: evidence.priorSnapshot,
      computed_delta: evidence.delta,
    },
    strategy: {
      current_ledger: ledger,
      previous_review: safePreviousReview,
      recent_decisions: safePreviousReview?.strategy_decisions ?? [],
      standing_caveats: standingCaveats,
      goals: [
        ...(ledger?.north_star ? [ledger.north_star] : []),
        ...(safePreviousReview?.strategy_goal ? [safePreviousReview.strategy_goal] : []),
      ],
      constraints: ledger?.constraints ?? [],
      metric_definitions: METRIC_DEFINITIONS,
    },
    research_instructions: [
      'Inspect relevant repositories with the coding agent’s own Git and file tools; do not rely on commit-message summaries alone.',
      'Search LLMnesia MCP for decisions, rejected ideas, constraints, and recent work. Do not copy raw private transcripts into the review.',
      'Use PostHog or other source tools for follow-up queries when the prepared evidence raises a material question.',
      'Distinguish facts, inferences, and recommendations. Do not invent work to fill a section.',
      'Publish only with the validated insights:publish command.',
    ],
    output_contract: {
      review_path: '.insights/review.json',
      publish_command: 'npm run insights:publish -- .insights/review.json',
    },
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(PACK_PATH, `${JSON.stringify(pack, null, 2)}\n`, { mode: 0o600 });
  const template = `${JSON.stringify(reviewTemplate(pack), null, 2)}\n`;
  await writeFile(REVIEW_TEMPLATE_PATH, template, { mode: 0o600 });
  try {
    await writeFile(REVIEW_PATH, template, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
  }
  console.log(`\nPrepared ${PACK_PATH}`);
  console.log(`Current template: ${REVIEW_TEMPLATE_PATH}`);
  console.log(`Review draft: ${REVIEW_PATH}${await readFile(REVIEW_PATH, 'utf8').then((contents) => contents === template ? '' : ' (preserved; update its evidence envelope from the current template)')}`);
  console.log(dryRun ? 'Read-only dry run: evidence was not written to Supabase. Do not publish this pack.' : 'Evidence was saved. Research the sources, complete review.json, then publish it.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
