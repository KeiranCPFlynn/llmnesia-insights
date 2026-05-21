/**
 * One-off GA4 audit for llmnesia.com conversion events over the last 7 days.
 * Answers the eight questions in the user's audit request.
 *
 * Run: npx tsx scripts/ga4-conversion-audit.ts
 */
import '../src/env.js';
import { BetaAnalyticsDataClient } from '@google-analytics/data';

const EXPECTED_EVENTS = new Set([
  'page_view',
  'install_click',
  'how_it_works_click',
  'email_signup',
  'contact_submit',
  // GA4 automatically-collected events we shouldn't flag as unexpected:
  'session_start',
  'first_visit',
  'user_engagement',
  'scroll',
  'click',
  'view_search_results',
  'form_start',
  'form_submit',
  'file_download',
  'video_start',
  'video_progress',
  'video_complete',
]);

const TRACKED_PAGE_GROUPS: Array<{ label: string; prefix: string }> = [
  { label: 'homepage', prefix: '/' }, // matched as exact below
  { label: 'blog', prefix: '/blog/' },
  { label: 'compare', prefix: '/compare/' },
  { label: 'use-cases', prefix: '/use-cases/' },
];

function int(v: string | null | undefined): number {
  return parseInt(v ?? '0', 10);
}

function makeClient(): BetaAnalyticsDataClient {
  const json = process.env.GOOGLE_CREDENTIALS_JSON;
  if (json) {
    const credentials = JSON.parse(json) as { client_email: string; private_key: string };
    return new BetaAnalyticsDataClient({ credentials });
  }
  return new BetaAnalyticsDataClient();
}

function pct(num: number, denom: number): string {
  if (!denom) return 'n/a';
  return `${((num / denom) * 100).toFixed(2)}%`;
}

function header(s: string): void {
  console.log(`\n=== ${s} ===`);
}

async function main(): Promise<void> {
  const propertyId = process.env.GA4_PROPERTY_ID_WEBSITE;
  if (!propertyId) throw new Error('GA4_PROPERTY_ID_WEBSITE is required');
  const property = `properties/${propertyId}`;
  const dateRanges = [{ startDate: '7daysAgo', endDate: 'today' }];

  const client = makeClient();

  console.log(`GA4 audit — property ${propertyId} — last 7 days (through today)\n`);

  // ----- 1. Page views: page_view counts by pagePath, plus content_group coverage
  header('1. Page views');
  const [pageViews] = await client.runReport({
    property,
    dateRanges,
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'eventCount' }, { name: 'screenPageViews' }],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'page_view' } } },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 200,
  });
  const pvRows = (pageViews.rows ?? []).map((r) => ({
    path: r.dimensionValues?.[0]?.value ?? '(not set)',
    events: int(r.metricValues?.[0]?.value),
    views: int(r.metricValues?.[1]?.value),
  }));
  const totalPV = pvRows.reduce((s, r) => s + r.events, 0);
  console.log(`Total page_view events: ${totalPV}`);
  const home = pvRows.find((r) => r.path === '/' || r.path === '');
  console.log(`  / : ${home?.events ?? 0} events`);
  for (const g of TRACKED_PAGE_GROUPS.slice(1)) {
    const rows = pvRows.filter((r) => r.path.startsWith(g.prefix));
    const sum = rows.reduce((s, r) => s + r.events, 0);
    console.log(`  ${g.prefix}* : ${sum} events across ${rows.length} paths`);
    rows.slice(0, 3).forEach((r) => console.log(`      ${r.path}  (${r.events})`));
  }
  const notSetPath = pvRows.find((r) => r.path === '(not set)');
  console.log(`  page_path = "(not set)" rows: ${notSetPath ? notSetPath.events : 0}`);

  // content_group coverage
  const [cg] = await client.runReport({
    property,
    dateRanges,
    dimensions: [{ name: 'contentGroup' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'page_view' } } },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 50,
  });
  console.log('  content_group breakdown:');
  for (const row of cg.rows ?? []) {
    const name = row.dimensionValues?.[0]?.value ?? '(not set)';
    console.log(`      ${name}: ${int(row.metricValues?.[0]?.value)}`);
  }

  // ----- 2. install_click by page_path
  header('2. install_click by page_path');
  const [installs] = await client.runReport({
    property,
    dateRanges,
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'install_click' } } },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 100,
  });
  const installRows = (installs.rows ?? []).map((r) => ({
    path: r.dimensionValues?.[0]?.value ?? '(not set)',
    events: int(r.metricValues?.[0]?.value),
  }));
  const totalInstalls = installRows.reduce((s, r) => s + r.events, 0);
  console.log(`Total install_click events: ${totalInstalls}`);
  installRows.forEach((r) => console.log(`  ${r.path}: ${r.events}`));

  // ----- 3. how_it_works_click
  header('3. how_it_works_click');
  const [hiw] = await client.runReport({
    property,
    dateRanges,
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'how_it_works_click' } } },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 50,
  });
  const hiwRows = (hiw.rows ?? []).map((r) => ({
    path: r.dimensionValues?.[0]?.value ?? '(not set)',
    events: int(r.metricValues?.[0]?.value),
  }));
  const totalHiw = hiwRows.reduce((s, r) => s + r.events, 0);
  console.log(`Total how_it_works_click events: ${totalHiw}`);
  hiwRows.forEach((r) => console.log(`  ${r.path}: ${r.events}`));

  // ----- 4. email_signup vs homepage sessions
  header('4. email_signup');
  const [signups] = await client.runReport({
    property,
    dateRanges,
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'email_signup' } } },
  });
  const signupRow = signups.rows?.[0];
  const signupEvents = int(signupRow?.metricValues?.[0]?.value);
  const signupUsers = int(signupRow?.metricValues?.[1]?.value);

  const [homeSessions] = await client.runReport({
    property,
    dateRanges,
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
    dimensionFilter: { filter: { fieldName: 'landingPagePlusQueryString', stringFilter: { value: '/' } } },
  });
  const homeSessRow = homeSessions.rows?.[0];
  const homeSess = int(homeSessRow?.metricValues?.[0]?.value);
  const homeUsers = int(homeSessRow?.metricValues?.[1]?.value);
  console.log(`email_signup events: ${signupEvents} (across ${signupUsers} users)`);
  console.log(`homepage landing sessions: ${homeSess} (${homeUsers} users)`);
  console.log(`rough signup rate vs homepage sessions: ${pct(signupEvents, homeSess)}`);

  // ----- 5. contact_submit
  header('5. contact_submit');
  const [contact] = await client.runReport({
    property,
    dateRanges,
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'contact_submit' } } },
  });
  const contactRow = contact.rows?.[0];
  console.log(`contact_submit events: ${int(contactRow?.metricValues?.[0]?.value)} (across ${int(contactRow?.metricValues?.[1]?.value)} users)`);

  // ----- 6. Funnel: users landing on / -> install_click
  header('6. Homepage → install_click conversion');
  const [installFromHome] = await client.runReport({
    property,
    dateRanges,
    metrics: [{ name: 'totalUsers' }, { name: 'eventCount' }],
    dimensionFilter: {
      andGroup: {
        expressions: [
          { filter: { fieldName: 'eventName', stringFilter: { value: 'install_click' } } },
          { filter: { fieldName: 'landingPagePlusQueryString', stringFilter: { value: '/' } } },
        ],
      },
    },
  });
  const ifhRow = installFromHome.rows?.[0];
  const installUsersFromHome = int(ifhRow?.metricValues?.[0]?.value);
  const installEventsFromHome = int(ifhRow?.metricValues?.[1]?.value);
  console.log(`Users landing on / : ${homeUsers}`);
  console.log(`Of those, users who fired install_click: ${installUsersFromHome} (${installEventsFromHome} events)`);
  console.log(`Headline install-CTA conversion rate: ${pct(installUsersFromHome, homeUsers)}`);

  // ----- 7. All event names with > 0 count, flag unexpected
  header('7. All event names (last 7d) — flag unexpected');
  const [allEvents] = await client.runReport({
    property,
    dateRanges,
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 200,
  });
  const eventRows = (allEvents.rows ?? []).map((r) => ({
    name: r.dimensionValues?.[0]?.value ?? '(not set)',
    count: int(r.metricValues?.[0]?.value),
  }));
  const unexpected: typeof eventRows = [];
  for (const r of eventRows) {
    const marker = EXPECTED_EVENTS.has(r.name) ? '  ' : 'X ';
    if (!EXPECTED_EVENTS.has(r.name)) unexpected.push(r);
    console.log(`  ${marker}${r.name}: ${r.count}`);
  }
  if (unexpected.length) {
    console.log(`\n  Flagged (not in expected set): ${unexpected.map((u) => u.name).join(', ')}`);
  } else {
    console.log('\n  No unexpected events.');
  }

  // ----- 8. Realtime check
  header('8. Realtime (last 30 min) — install_click / how_it_works_click');
  const [rt] = await client.runRealtimeReport({
    property,
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        inListFilter: { values: ['install_click', 'how_it_works_click', 'email_signup', 'contact_submit', 'page_view'] },
      },
    },
  });
  if (!rt.rows || rt.rows.length === 0) {
    console.log('  (no matching events in the last 30 minutes)');
  } else {
    for (const row of rt.rows) {
      console.log(`  ${row.dimensionValues?.[0]?.value}: ${int(row.metricValues?.[0]?.value)}`);
    }
  }

  console.log('\nDone.');
  console.log('Note: "unused custom dimensions/metrics" is an Admin-API/Custom-Definitions concept;');
  console.log('the Data API cannot read it. Check it in GA4 UI: Admin → Custom definitions.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
