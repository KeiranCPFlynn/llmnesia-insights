import './env.js';

import { collectGA4Metrics } from './ga4.js';
import { collectPayments } from './payments.js';
import { collectStripeMetrics } from './stripe.js';
import { computeEvidenceDelta } from './evidence-delta.js';
import { collectMetrics } from './posthog.js';
import { getCurrentWeek, getWeekFromArg } from './reporting-period.js';
import { getCombinedSearchDigest, syncSearchForInsights } from './search-digest.js';
import {
  saveEvidenceDelta,
  saveSourceSnapshot,
  saveSourceSyncState,
  getLatestEvidenceSnapshotBefore,
} from './data.js';
import type { EvidenceDelta, EvidenceFreshness, MetricsSnapshot, SearchSourceDigest } from './types.js';

export interface EvidenceCollectionResult {
  weekStart: string;
  weekEnd: string;
  dataAsOf: string;
  currentSnapshot: MetricsSnapshot;
  priorSnapshot: MetricsSnapshot | null;
  delta: EvidenceDelta;
  freshness: EvidenceFreshness[];
  saved: boolean;
}

/**
 * Collect and persist analytics evidence. This module deliberately imports no
 * LLM, prompt, Git, MCP, or strategy code; cron and prepare both stop here.
 */
function searchWindowDetail(
  engine: string,
  window: SearchSourceDigest['compared_window'],
): string {
  if (!window) return `Latest observed ${engine} date; provider data may lag or be incomplete.`;
  const { current, prior, excluded_from } = window;
  return excluded_from
    ? `${engine} totals cover complete days ${current.start} to ${current.end}, compared with ${prior.start} to ${prior.end}; ${excluded_from} onward was incomplete and left out.`
    : `${engine} totals cover the full week ${current.start} to ${current.end}, compared with ${prior.start} to ${prior.end}.`;
}

export async function collectEvidence(opts: {
  weekStart?: string | null;
  dryRun?: boolean;
  skipSearchSync?: boolean;
  log?: (message: string) => void;
} = {}): Promise<EvidenceCollectionResult> {
  const log = opts.log ?? console.log;
  const current = opts.weekStart ? null : getCurrentWeek();
  const period = opts.weekStart ? getWeekFromArg(opts.weekStart) : current!;
  const partial = current
    ? { as_of: current.weekEnd, days_elapsed: current.daysElapsed }
    : null;
  const { weekStart, weekEnd } = period;

  log(`Collecting evidence for ${weekStart} → ${weekEnd}${partial ? ' (week-to-date)' : ''}.`);
  // A dry-run is genuinely read-only: use the latest stored search rows rather
  // than invoking the GSC/Bing sync, which upserts their raw source tables.
  const searchSync = opts.dryRun || opts.skipSearchSync ? Promise.resolve() : syncSearchForInsights(log);
  const [posthog, ga4, stripe, payments, priorSnapshot] = await Promise.all([
    collectMetrics(weekStart, weekEnd),
    collectGA4Metrics(weekStart, weekEnd),
    collectStripeMetrics(weekStart, weekEnd),
    collectPayments(weekStart, weekEnd),
    getLatestEvidenceSnapshotBefore(weekStart),
  ]);
  await searchSync;
  const searchPerformance = await getCombinedSearchDigest(weekStart, weekEnd).catch((error) => {
    log(`Search evidence unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  });

  const currentSnapshot: MetricsSnapshot = {
    ...posthog,
    ga4,
    stripe,
    payments,
    ...(searchPerformance ? { search_performance: searchPerformance } : {}),
    ...(partial ? { partial } : {}),
  };
  const delta = computeEvidenceDelta(currentSnapshot, priorSnapshot);
  const googleAsOf = searchPerformance?.data_as_of?.google ?? null;
  const bingAsOf = searchPerformance?.data_as_of?.bing ?? null;
  const freshness: EvidenceFreshness[] = [
    { source: 'Stripe payments', status: payments.status === 'available' ? 'fresh' : 'unavailable', data_as_of: payments.status === 'available' ? weekEnd : null, detail: payments.status === 'available' ? 'Historical paid subscription coverage and weekly payments, excluding configured test customers.' : payments.detail },
    { source: 'Stripe', status: stripe.status === 'available' ? 'fresh' : 'unavailable', data_as_of: stripe.status === 'available' ? weekEnd : null, detail: stripe.detail ?? `Payments cover the reporting period; subscription state was observed at ${stripe.subscriptions_as_of}.` },
    { source: 'PostHog', status: 'fresh', data_as_of: weekEnd, detail: current ? 'Queried through this date at collection time; the current day is incomplete.' : 'Queried through the requested historical end date.' },
    { source: 'GA4', status: 'fresh', data_as_of: weekEnd, detail: 'Queried through this date at collection time; recent GA4 data may still be processing.' },
    {
      source: 'Google Search Console',
      status: searchPerformance?.google ? 'fresh' : 'unavailable',
      data_as_of: googleAsOf,
      detail: googleAsOf ? searchWindowDetail('Google', searchPerformance?.google?.compared_window) : 'No Google search rows were available for this period.',
    },
    {
      source: 'Bing Webmaster Tools',
      status: searchPerformance?.bing ? 'fresh' : 'unavailable',
      data_as_of: bingAsOf,
      detail: bingAsOf ? `${searchWindowDetail('Bing', searchPerformance?.bing?.compared_window)} Query breakdowns are weekly.` : 'No Bing traffic data was available for this period.',
    },
  ];

  if (!opts.dryRun) {
    // The review reads this durable ingestion record. Saving the individual
    // source payloads means a later review never has to query analytics again
    // merely to reconstruct the same weekly evidence.
    await Promise.all([
      saveEvidenceDelta(delta, currentSnapshot),
      saveSourceSnapshot({ source: 'Stripe payments', periodStart: weekStart, periodEnd: weekEnd, snapshot: payments }),
      saveSourceSyncState({ source: 'Stripe payments', latestDataDate: payments.status === 'available' ? weekEnd : null, status: payments.status === 'available' ? 'fresh' : 'failed', detail: payments.status === 'unavailable' ? payments.detail : null }),
      saveSourceSnapshot({ source: 'Stripe', periodStart: weekStart, periodEnd: weekEnd, snapshot: stripe }),
      saveSourceSyncState({ source: 'Stripe', latestDataDate: stripe.status === 'available' ? weekEnd : null, status: stripe.status === 'available' ? 'fresh' : 'failed', detail: stripe.detail ?? null }),
      saveSourceSnapshot({ source: 'PostHog', periodStart: weekStart, periodEnd: weekEnd, snapshot: posthog }),
      saveSourceSnapshot({ source: 'GA4', periodStart: weekStart, periodEnd: weekEnd, snapshot: ga4 }),
      saveSourceSyncState({ source: 'PostHog', latestDataDate: weekEnd, status: 'fresh' }),
      saveSourceSyncState({ source: 'GA4', latestDataDate: weekEnd, status: 'fresh' }),
      saveSourceSnapshot({
        source: 'Google Search Console',
        periodStart: weekStart,
        periodEnd: weekEnd,
        snapshot: searchPerformance?.google ?? { unavailable: true, reason: 'No Google search rows available for this period.' },
      }),
      saveSourceSnapshot({
        source: 'Bing Webmaster Tools',
        periodStart: weekStart,
        periodEnd: weekEnd,
        snapshot: searchPerformance?.bing ?? { unavailable: true, reason: 'No Bing traffic data available for this period.' },
      }),
      saveSourceSyncState({
        source: 'Google Search Console',
        latestDataDate: googleAsOf,
        status: searchPerformance?.google ? 'fresh' : 'failed',
        detail: searchPerformance?.google ? null : 'No Google search rows were available for this period.',
      }),
      saveSourceSyncState({
        source: 'Bing Webmaster Tools',
        latestDataDate: bingAsOf,
        status: searchPerformance?.bing ? 'fresh' : 'failed',
        detail: searchPerformance?.bing ? null : 'No Bing traffic data was available for this period.',
      }),
    ]);
    log('Evidence snapshot and delta saved.');
  }
  return {
    weekStart,
    weekEnd,
    dataAsOf: partial?.as_of ?? weekEnd,
    currentSnapshot,
    priorSnapshot,
    delta,
    freshness,
    saved: !opts.dryRun,
  };
}
