import '../src/env.js';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BetaAnalyticsDataClient } from '@google-analytics/data';

interface RowBucket {
  sessions: number;
  sources: Record<string, number>;
  landing_pages: Record<string, number>;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function mondayOf(date: Date): Date {
  const out = new Date(date);
  const day = out.getUTCDay();
  out.setUTCDate(out.getUTCDate() - (day === 0 ? 6 : day - 1));
  out.setUTCHours(0, 0, 0, 0);
  return out;
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
  ],
  metrics: [{ name: 'sessions' }],
  dimensionFilter: {
    filter: {
      fieldName: 'sessionDefaultChannelGroup',
      stringFilter: { value: 'AI Assistant', matchType: 'EXACT' },
    },
  },
  limit: 100000,
});

const buckets: Record<string, RowBucket> = {};
for (const row of report.rows ?? []) {
  const rawDate = row.dimensionValues?.[0]?.value ?? '';
  const date = new Date(
    `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}T00:00:00Z`,
  );
  const week = isoDate(mondayOf(date));
  const bucket = (buckets[week] ??= { sessions: 0, sources: {}, landing_pages: {} });
  const source = row.dimensionValues?.[1]?.value ?? '(unknown)';
  const medium = row.dimensionValues?.[2]?.value ?? '(unknown)';
  const landingPage = row.dimensionValues?.[3]?.value ?? '(unknown)';
  const sessions = Number(row.metricValues?.[0]?.value ?? 0);
  bucket.sessions += sessions;
  const sourceKey = `${source} / ${medium}`;
  bucket.sources[sourceKey] = (bucket.sources[sourceKey] ?? 0) + sessions;
  bucket.landing_pages[landingPage] = (bucket.landing_pages[landingPage] ?? 0) + sessions;
}

const sortRecord = (record: Record<string, number>, limit?: number) =>
  Object.fromEntries(
    Object.entries(record)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit),
  );

const weeks = Object.fromEntries(
  Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, bucket]) => [
      week,
      {
        sessions: bucket.sessions,
        sources: sortRecord(bucket.sources),
        landing_pages: sortRecord(bucket.landing_pages, 15),
      },
    ]),
);

const payload = {
  generated_at: new Date().toISOString(),
  metric: 'GA4 sessions classified as AI Assistant',
  caveat:
    'This measures referral clicks from AI assistants, not citation appearances that received no click.',
  current_window: { start: isoDate(currentStart), end: isoDate(currentEnd) },
  weeks,
};

const outputArg = process.argv.find((value) => value.startsWith('--output='));
const outputPath = path.resolve(
  process.cwd(),
  outputArg?.slice('--output='.length) || '.insights/ai-assistant-referral-audit.json',
);
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

const current = weeks[isoDate(currentStart)] ?? { sessions: 0, sources: {}, landing_pages: {} };
console.log(`AI Assistant referral audit: ${isoDate(currentStart)} to ${isoDate(currentEnd)}`);
console.log(`Sessions: ${current.sessions}`);
for (const [source, sessions] of Object.entries(current.sources)) {
  console.log(`  ${source}: ${sessions}`);
}
console.log(`Wrote ${outputPath}`);
