import { BetaAnalyticsDataClient } from '@google-analytics/data';
import type { GA4Metrics, GA4PropertyMetrics } from './types.js';

function makeClient(): BetaAnalyticsDataClient {
  return new BetaAnalyticsDataClient(); // uses GOOGLE_APPLICATION_CREDENTIALS
}

function getPropertyIds(): { website: string; extension: string | undefined } {
  const website = process.env.GA4_PROPERTY_ID_WEBSITE;
  if (!website) throw new Error('GA4_PROPERTY_ID_WEBSITE is required');
  const extension = process.env.GA4_PROPERTY_ID_EXTENSION || undefined;
  return { website, extension };
}

function int(v: string | null | undefined): number {
  return parseInt(v ?? '0', 10);
}

async function fetchProperty(
  client: BetaAnalyticsDataClient,
  propertyId: string,
  label: 'website' | 'extension',
  weekStart: string,
  weekEnd: string,
): Promise<GA4PropertyMetrics> {
  const property = `properties/${propertyId}`;
  const dateRanges = [{ startDate: weekStart, endDate: weekEnd }];

  const [[overview], [acquisition], [pages], [geo], [devices]] = await Promise.all([
    client.runReport({
      property,
      dateRanges,
      metrics: [{ name: 'totalUsers' }, { name: 'newUsers' }, { name: 'sessions' }],
    }),
    client.runReport({
      property,
      dateRanges,
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }],
    }),
    client.runReport({
      property,
      dateRanges,
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 10,
    }),
    client.runReport({
      property,
      dateRanges,
      dimensions: [{ name: 'country' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 10,
    }),
    client.runReport({
      property,
      dateRanges,
      dimensions: [{ name: 'deviceCategory' }],
      metrics: [{ name: 'sessions' }],
    }),
  ]);

  const ovRow = overview.rows?.[0];
  const totalUsers = int(ovRow?.metricValues?.[0]?.value);
  const newUsers = int(ovRow?.metricValues?.[1]?.value);
  const sessions = int(ovRow?.metricValues?.[2]?.value);

  const acquisitionMap: Record<string, number> = {};
  for (const row of acquisition.rows ?? []) {
    const ch = row.dimensionValues?.[0]?.value ?? 'unknown';
    acquisitionMap[ch] = int(row.metricValues?.[0]?.value);
  }

  const topPages = (pages.rows ?? []).map((row) => ({
    path: row.dimensionValues?.[0]?.value ?? '/',
    views: int(row.metricValues?.[0]?.value),
  }));

  const geoMap: Record<string, number> = {};
  for (const row of geo.rows ?? []) {
    geoMap[row.dimensionValues?.[0]?.value ?? 'unknown'] = int(row.metricValues?.[0]?.value);
  }

  const devicesMap: Record<string, number> = {};
  for (const row of devices.rows ?? []) {
    devicesMap[row.dimensionValues?.[0]?.value ?? 'unknown'] = int(row.metricValues?.[0]?.value);
  }

  return {
    property: label,
    users: { total: totalUsers, new_users: newUsers, returning: Math.max(0, totalUsers - newUsers) },
    sessions,
    acquisition: acquisitionMap,
    top_pages: topPages,
    geo: geoMap,
    devices: devicesMap,
  };
}

export async function collectGA4Metrics(weekStart: string, weekEnd: string): Promise<GA4Metrics> {
  const client = makeClient();
  const ids = getPropertyIds();

  const [website, extension] = await Promise.all([
    fetchProperty(client, ids.website, 'website', weekStart, weekEnd),
    ids.extension
      ? fetchProperty(client, ids.extension, 'extension', weekStart, weekEnd)
      : Promise.resolve(undefined),
  ]);

  return extension ? { website, extension } : { website };
}
