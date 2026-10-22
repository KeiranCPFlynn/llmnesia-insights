import '../src/env.js';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { collectEvidence } from '../src/evidence.js';
import { evidenceHash } from '../src/agent-review.js';
import { getReviewWeekStart } from '../src/reporting-period.js';
import {
  getEvidenceRecordByWeek,
  getLatestEvidenceSnapshotBefore,
  getLatestInsight,
  getSourceSyncStates,
  getStandingCaveats,
  getStrategyLedger,
} from '../src/data.js';
import type { AgentEvidencePack, AgentReview, EvidenceFreshness, PriorReviewContext, WeeklyInsight } from '../src/types.js';

const OUTPUT_DIR = resolve(process.cwd(), '.insights');
const PACK_PATH = resolve(OUTPUT_DIR, 'evidence-pack.json');
const REVIEW_PATH = resolve(OUTPUT_DIR, 'review.json');
const REVIEW_TEMPLATE_PATH = resolve(OUTPUT_DIR, 'review.template.json');

const METRIC_DEFINITIONS: Record<string, string> = {
  payments: 'Weekly Stripe payment evidence excluding configured founder test customers. Read status first: unavailable is not zero, and test mode is not real revenue. Active at week end means paid recurring invoice coverage at the cutoff; plans and discounts come from that invoice, not current subscription settings. New paid counts subscriptions first collecting a positive invoice payment in the week, excluding out-of-band payments. Renewals count subscription_cycle invoices due that week, paid by cutoff; zero invoices can settle without collecting cash. Cancellations are requests dated canceled_at; scheduled period-end cancellations are current observations with their own timestamp. Revenue is GBP major units: captured charges created in the week less successful refunds created in the week, before fees, disputes and payouts. tax_basis says before_tax or including_tax; refunds use proportional invoice tax allocation. No FX conversion. Do not compare different modes, timezones, exclusion sets, or tax bases. This is the purchase source of truth; the extension Vault funnel cannot see website purchases.',
  stripe: 'Configured test customer IDs and all their subscriptions, payments, and refunds are excluded before any metric is computed; inspect stripe.exclusions for the applied customer IDs and omitted record counts. Do not compare periods with different exclusion sets. Account-wide data for the configured Stripe account, not product-filtered. Do not attribute all revenue to LLMnesia unless this account is dedicated to it. Payments, successful refunds, and new Stripe customer records cover the reporting period in the configured timezone. Subscription health and MRR are CURRENT observations at subscriptions_as_of, never reconstructed historical balances. MRR is fixed-price monthly run rate before discounts and tax, includes active and past_due, excludes trials/canceled/unpaid/metered usage and one-time purchases. Money is in Stripe minor units grouped by currency. Collected less refunds is before fees, disputes, tax, and payouts. New customers means records created, not first-time buyers. Failed payments means charge attempts, not distinct customers. Missing/unavailable Stripe is not zero. Test mode is not real revenue.',
  installs: 'PostHog extension_installed events in the reporting period.',
  activation_rate: 'Share of installs with an activation event within 24 hours.',
  wau: 'Distinct installs with a user-initiated event during the reporting period.',
  searches_per_wau: 'search_submitted events divided by weekly active users.',
  click_rate: 'from_search_v1: result_opened with from_search=true divided by search_submitted on extension 0.4.18+ only. No covered searches means null, not zero. recent_opens combines overlay from_search=false and popup_recents; origin_unknown_opens counts other opens missing origin. Legacy clicks_including_popup_recents and click_rate_including_popup_recents retain all opens/all searches. Never compare primary click rate or open counts to snapshots without the same definition. A click rate counts opens, not searches with at least one open, so it can exceed 100%.',
  zero_result_rate: 'Submitted searches returning zero results divided by submitted searches.',
  platform_distribution: 'Intentional search-result impressions from search_submitted shown_{platform}, compared with result_opened platform_source on search surfaces; popup_recents and the frozen legacy keystroke series are separate.',
  retention_w1: 'Share of users active in the prior week who returned in the reporting period.',
  retention_w4: 'Share of users active four weeks ago who returned in the reporting period.',
  vault_funnel: 'Unique PostHog identities per Vault event in the reporting period. Funnel order: waitlist_joined (extension offer and website waitlist form), created, checkout_opened, phone_qr_shown, unlocked. checkout_opened fires on the subscribe-in-extension paywall only; the site purchase flow emits no analytics event, so it is not a drop-off point. sync_completed, sync_failed, and restore_completed are background scheduler runs (unsampled), reliability signals rather than user progression.',
};

function sanitizePreviousReview(review: WeeklyInsight | null): PriorReviewContext | null {
  if (!review) return null;
  return {
    week_start: review.week_start,
    week_end: review.week_end,
    headline: review.headline,
    summary: review.summary,
    findings: review.findings,
    action_items: review.action_items,
    open_threads: review.open_threads,
    resolved_threads: review.resolved_threads,
    strategy: review.strategy,
    strategy_goal: review.strategy_goal,
    strategy_decisions: review.strategy_decisions,
    corrections: review.corrections,
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
  const refreshEvidence = process.argv.includes('--refresh-evidence');
  const weekStart = getReviewWeekStart(process.argv.slice(2));
  // A normal review refreshes through the run date. Historical/completed-week
  // requests can reuse their stored evidence unless explicitly refreshed.
  const stored = weekStart ? await getEvidenceRecordByWeek(weekStart).catch(() => null) : null;
  const collected = !stored || refreshEvidence
    ? await collectEvidence({
      weekStart,
      dryRun,
      log: (message) => console.log(`[evidence] ${message}`),
    })
    : null;
  if (stored && !refreshEvidence) {
    console.log(`Using stored evidence for ${stored.delta.week_start} → ${stored.delta.week_end}. Use --refresh-evidence only to force a fresh ingestion run.`);
  }
  const [ledger, previousReview, standingCaveats, sourceStates, storedPriorSnapshot] = await Promise.all([
    getStrategyLedger(),
    getLatestInsight(),
    getStandingCaveats(false),
    getSourceSyncStates().catch(() => []),
    stored ? getLatestEvidenceSnapshotBefore(stored.delta.week_start).catch(() => null) : Promise.resolve(null),
  ]);
  const evidence = collected
    ? collected
    : stored
      ? {
        weekStart: stored.delta.week_start,
        weekEnd: stored.delta.week_end,
        dataAsOf: stored.raw_snapshot.partial?.as_of ?? stored.delta.week_end,
        currentSnapshot: stored.raw_snapshot,
        priorSnapshot: storedPriorSnapshot,
        delta: stored.delta,
        freshness: sourceStates.map((state): EvidenceFreshness => ({
          source: state.source,
          status: state.status === 'fresh' ? 'fresh' : 'unavailable',
          data_as_of: state.latest_data_date ?? stored.delta.week_end,
          ...(state.detail ? { detail: state.detail } : {}),
        })),
        saved: true,
      }
      : null;
  if (!evidence) throw new Error('No evidence was available.');
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
      'For Stripe, use the raw snapshot and its definitions. Do not call the current subscription snapshot historical MRR, infer churn or first-time paying customers from record creation, sum currencies, treat test mode as live revenue, or interpret unavailable data as zero.',
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
  console.log(dryRun ? 'Read-only dry run: evidence was not written to the database. Do not publish this pack.' : 'Evidence was saved. Research the sources, complete review.json, then publish it.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
