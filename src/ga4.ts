import './env.js';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { OAuth2Client } from 'google-auth-library';
import type { GA4Metrics, GA4PropertyMetrics } from './types.js';

/**
 * Website property: service account.
 *
 * Locally, `GOOGLE_APPLICATION_CREDENTIALS` (a file path) is used by the
 * client automatically. On Vercel there is no such file (the filesystem is
 * `/var/task`, no `/Users`), so set `GOOGLE_CREDENTIALS_JSON` to the entire
 * contents of the key file instead — it's parsed and passed inline.
 */
function makeServiceClient(): BetaAnalyticsDataClient {
  const json = process.env.GOOGLE_CREDENTIALS_JSON;
  if (json) {
    const credentials = JSON.parse(json) as {
      client_email: string;
      private_key: string;
    };
    return new BetaAnalyticsDataClient({ credentials });
  }
  return new BetaAnalyticsDataClient(); // uses GOOGLE_APPLICATION_CREDENTIALS file
}

/**
 * Extension property (`529666179`) is a Chrome-Web-Store-auto-managed GA4
 * account that Google administers — a service account can never be added to
 * it. It's read as the founder's own Google account via an OAuth refresh
 * token instead. Returns null if OAuth isn't configured (extension skipped).
 */
function makeOAuthClient(): BetaAnalyticsDataClient | null {
  const clientId = process.env.GA4_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GA4_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GA4_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const authClient = new OAuth2Client({ clientId, clientSecret });
  authClient.setCredentials({ refresh_token: refreshToken });
  return new BetaAnalyticsDataClient({ authClient: authClient as never });
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
  opts: { storeInstalls?: boolean; conversionEvents?: string[] } = {},
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

  const result: GA4PropertyMetrics = {
    property: label,
    users: { total: totalUsers, new_users: newUsers, returning: Math.max(0, totalUsers - newUsers) },
    sessions,
    acquisition: acquisitionMap,
    top_pages: topPages,
    geo: geoMap,
    devices: devicesMap,
  };

  if (opts.storeInstalls) {
    const [installs] = await client.runReport({
      property,
      dateRanges,
      metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
      dimensionFilter: {
        filter: { fieldName: 'eventName', stringFilter: { value: 'install' } },
      },
    });
    const row = installs.rows?.[0];
    result.store_installs = {
      events: int(row?.metricValues?.[0]?.value),
      users: int(row?.metricValues?.[1]?.value),
    };
  }

  if (opts.conversionEvents && opts.conversionEvents.length > 0) {
    const [events] = await client.runReport({
      property,
      dateRanges,
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          inListFilter: { values: opts.conversionEvents },
        },
      },
    });
    // Seed with zeros so a missing event reads as "0 this week" not "missing".
    const conv: Record<string, number> = Object.fromEntries(
      opts.conversionEvents.map((n) => [n, 0]),
    );
    for (const row of events.rows ?? []) {
      const name = row.dimensionValues?.[0]?.value;
      if (name) conv[name] = int(row.metricValues?.[0]?.value);
    }
    result.conversions = conv;
  }

  return result;
}

export async function collectGA4Metrics(weekStart: string, weekEnd: string): Promise<GA4Metrics> {
  const ids = getPropertyIds();
  const serviceClient = makeServiceClient();
  const oauthClient = makeOAuthClient();

  const [website, extension] = await Promise.all([
    fetchProperty(serviceClient, ids.website, 'website', weekStart, weekEnd, {
      conversionEvents: ['install_click', 'email_signup', 'contact_submit'],
    }),
    ids.extension && oauthClient
      ? fetchProperty(oauthClient, ids.extension, 'extension', weekStart, weekEnd, {
          storeInstalls: true,
        })
      : Promise.resolve(undefined),
  ]);

  return extension ? { website, extension } : { website };
}
