import '../src/env.js';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { buildReferralSeries, KNOWN_ASSISTANT_SOURCES, mondayOf } from '../src/ai-referrals.js';

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function completedWeekStart(now = new Date()): Date {
  const start = mondayOf(now);
  start.setUTCDate(start.getUTCDate() - 7);
  return start;
}

function parseWeekStart(): Date {
  const arg = process.argv.find((value) => value.startsWith('--week-start='));
  if (!arg) return completedWeekStart();
  const value = arg.slice('--week-start='.length);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || isoDate(mondayOf(parsed)) !== value) {
    throw new Error('--week-start must be a valid Monday in YYYY-MM-DD format');
  }
  return parsed;
}

function makeClient(): BetaAnalyticsDataClient {
  const raw = process.env.GOOGLE_CREDENTIALS_JSON;
  if (!raw) return new BetaAnalyticsDataClient();
  const credentials = JSON.parse(raw) as { client_email: string; private_key: string };
  return new BetaAnalyticsDataClient({ credentials });
}

const propertyId = process.env.GA4_PROPERTY_ID_WEBSITE;
if (!propertyId) throw new Error('GA4_PROPERTY_ID_WEBSITE is required');

const currentStart = parseWeekStart();
const currentEnd = new Date(currentStart);
currentEnd.setUTCDate(currentEnd.getUTCDate() + 6);
const seriesStart = new Date(currentStart);
seriesStart.setUTCDate(seriesStart.getUTCDate() - 35);

const [report] = await makeClient().runReport({
  property: `properties/${propertyId}`,
  dateRanges: [{ startDate: isoDate(seriesStart), endDate: isoDate(currentEnd) }],
  dimensions: [
    { name: 'date' },
    { name: 'sessionSource' },
    { name: 'sessionMedium' },
    { name: 'landingPage' },
    { name: 'sessionDefaultChannelGroup' },
    { name: 'hostName' },
  ],
  metrics: [{ name: 'sessions' }],
  dimensionFilter: {
    orGroup: { expressions: [{ filter: {
      fieldName: 'sessionDefaultChannelGroup',
      stringFilter: { value: 'AI Assistant', matchType: 'EXACT' },
    } }, { filter: {
      fieldName: 'sessionSource',
      inListFilter: { values: [...KNOWN_ASSISTANT_SOURCES], caseSensitive: false },
    } }] },
  },
  limit: 100000,
});

if ((report.rowCount ?? 0) > (report.rows?.length ?? 0)) {
  throw new Error('GA4 returned an incomplete row set; audit not written. Narrow the period or add pagination.');
}
const rows = (report.rows ?? []).map(row => {
  const rawDate = row.dimensionValues?.[0]?.value ?? '';
  return {
    date: `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`,
    source: row.dimensionValues?.[1]?.value ?? '(unknown)',
    medium: row.dimensionValues?.[2]?.value ?? '(unknown)',
    landingPage: row.dimensionValues?.[3]?.value ?? '(unknown)',
    channel: row.dimensionValues?.[4]?.value ?? '(unknown)',
    host: row.dimensionValues?.[5]?.value ?? '(unknown)',
    sessions: Number(row.metricValues?.[0]?.value ?? 0),
  };
});
const series = buildReferralSeries(rows);
const { weeks } = series;

const outputArg = process.argv.find((value) => value.startsWith('--output='));
const outputPath = path.resolve(process.cwd(), outputArg?.slice('--output='.length) || '.insights/ai-assistant-referral-audit.json');
let previousRun: unknown = null;
try {
  const previous = JSON.parse(await readFile(outputPath, 'utf8'));
  previousRun = {
    generated_at: previous.generated_at, current_window: previous.current_window,
    sessions: previous.weeks?.[isoDate(currentStart)]?.sessions ?? null,
    same_window: previous.current_window?.start === isoDate(currentStart) && previous.current_window?.end === isoDate(currentEnd),
    note: 'Same-window differences are reporting restatements, not week-over-week changes. Dated citation audit snapshots are not modified.',
  };
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const payload = {
  generated_at: new Date().toISOString(),
  metric: 'GA4 sessions classified as AI Assistant',
  caveat:
    'This measures referral clicks from AI assistants, not citation appearances that received no click.',
  current_window: { start: isoDate(currentStart), end: isoDate(currentEnd) },
  calendar_timezone: report.metadata?.timeZone ?? '(not returned)',
  freshness: 'Completed calendar week, not guaranteed final. GA4 may restate recent dates.',
  channel_host_scope: 'Original all-host channel population retained for compatibility; supplements use production hosts only.',
  metadata: report.metadata,
  row_count: report.rowCount,
  previous_run: previousRun,
  ...series,
};
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

const current = weeks[isoDate(currentStart)] ?? { sessions: 0, sources: {}, landing_pages: {} };
console.log(`AI Assistant referral audit: ${isoDate(currentStart)} to ${isoDate(currentEnd)}`);
console.log(`Sessions: ${current.sessions}`);
console.log(`Known-source supplement (production, all channels): ${series.known_source_supplement.weeks[isoDate(currentStart)]?.sessions ?? 0}`);
console.log(`Production combined union: ${series.production_combined.weeks[isoDate(currentStart)]?.sessions ?? 0}`);
for (const [source, sessions] of Object.entries(current.sources)) {
  console.log(`  ${source}: ${sessions}`);
}
console.log(`Wrote ${outputPath}`);
