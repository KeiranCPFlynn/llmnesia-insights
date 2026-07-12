import { NextResponse } from 'next/server';
import { collectMetrics, getEventBreakdown } from '../../../src/posthog.js';
import { collectGA4Metrics } from '../../../src/ga4.js';
import { getCombinedSearchDigest } from '../../../src/search-digest.js';
import { isAuthorized } from '../../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Detailed data for an arbitrary date range across all three sources — the
 * "Data" explorer's backend. Fetches live from PostHog + GA4 for the range, and
 * reads already-synced Google/Bing search rows. Search is fail-soft (omitted if
 * the growth tables aren't set up) so the explorer still works without it.
 */
export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { start, end } = (await req.json().catch(() => ({}))) as {
    start?: string;
    end?: string;
  };
  if (!start || !end || !ISO_DATE.test(start) || !ISO_DATE.test(end)) {
    return NextResponse.json(
      { error: 'start and end are required (YYYY-MM-DD)' },
      { status: 400 },
    );
  }
  if (start > end) {
    return NextResponse.json({ error: 'start must be on or before end' }, { status: 400 });
  }

  try {
    const [posthog, events, ga4, search] = await Promise.all([
      collectMetrics(start, end),
      getEventBreakdown(start, end),
      collectGA4Metrics(start, end),
      getCombinedSearchDigest(start, end).catch((e) => {
        console.warn('[data] search digest failed (omitting):', e);
        return null;
      }),
    ]);

    return NextResponse.json({ range: { start, end }, posthog, events, ga4, search });
  } catch (e) {
    console.error('[data] fetch failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to fetch data' },
      { status: 500 },
    );
  }
}
