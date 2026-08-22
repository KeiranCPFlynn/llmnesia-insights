import './env.js';

import { collectGA4Metrics } from './ga4.js';
import { computeEvidenceDelta } from './evidence-delta.js';
import { collectMetrics } from './posthog.js';
import { getCurrentWeek, getWeekFromArg } from './reporting-period.js';
import { getCombinedSearchDigest, syncSearchForInsights } from './search-digest.js';
import { getLatestEvidenceSnapshotBefore, saveEvidenceDelta } from './supabase.js';
import type { EvidenceDelta, EvidenceFreshness, MetricsSnapshot } from './types.js';

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
export async function collectEvidence(opts: {
  weekStart?: string | null;
  dryRun?: boolean;
  log?: (message: string) => void;
} = {}): Promise<EvidenceCollectionResult> {
  const log = opts.log ?? console.log;
  const current = opts.weekStart ? null : getCurrentWeek();
  const period = opts.weekStart ? getWeekFromArg(opts.weekStart) : current!;
  const partial = current && current.daysElapsed < 7
    ? { as_of: current.weekEnd, days_elapsed: current.daysElapsed }
    : null;
  const { weekStart, weekEnd } = period;

  log(`Collecting evidence for ${weekStart} → ${weekEnd}${partial ? ' (week-to-date)' : ''}.`);
  // A dry-run is genuinely read-only: use the latest stored search rows rather
  // than invoking the GSC/Bing sync, which upserts their raw source tables.
  const searchSync = opts.dryRun ? Promise.resolve() : syncSearchForInsights(log);
  const [posthog, ga4, priorSnapshot] = await Promise.all([
    collectMetrics(weekStart, weekEnd),
    collectGA4Metrics(weekStart, weekEnd),
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
    ...(searchPerformance ? { search_performance: searchPerformance } : {}),
    ...(partial ? { partial } : {}),
  };
  const delta = computeEvidenceDelta(currentSnapshot, priorSnapshot);
  const searchAsOfDate = new Date(`${weekEnd}T00:00:00Z`);
  if (current) searchAsOfDate.setUTCDate(searchAsOfDate.getUTCDate() - 1);
  const searchAsOf = searchAsOfDate.toISOString().slice(0, 10);
  const freshness: EvidenceFreshness[] = [
    { source: 'PostHog', status: 'fresh', data_as_of: weekEnd },
    { source: 'GA4', status: 'fresh', data_as_of: weekEnd },
    {
      source: 'Google Search Console',
      status: searchPerformance?.google ? 'fresh' : 'unavailable',
      data_as_of: searchAsOf,
      ...(!searchPerformance?.google ? { detail: 'No Google search rows were available for this period.' } : {}),
    },
    {
      source: 'Bing Webmaster Tools',
      status: searchPerformance?.bing ? 'fresh' : 'unavailable',
      data_as_of: searchAsOf,
      ...(!searchPerformance?.bing ? { detail: 'No Bing search rows were available for this period.' } : {}),
    },
  ];

  if (!opts.dryRun) {
    await saveEvidenceDelta(delta, currentSnapshot);
    log('Evidence snapshot and delta saved to Supabase.');
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
