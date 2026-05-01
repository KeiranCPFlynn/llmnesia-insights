import type { MetricsSnapshot } from './types.js';

const BASE_URL = 'https://eu.posthog.com';

function getConfig() {
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const apiKey = process.env.POSTHOG_API_KEY;
  if (!projectId || !apiKey) throw new Error('POSTHOG_PROJECT_ID and POSTHOG_API_KEY are required');
  return { projectId, apiKey };
}

async function runQuery(query: string): Promise<unknown[][]> {
  const { projectId, apiKey } = getConfig();
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/query/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostHog query failed ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { results: unknown[][] };
  return json.results ?? [];
}

function round(n: number, decimals = 4): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

export async function getWeeklyInstalls(
  weekStart: string,
  weekEnd: string,
): Promise<{ total: number }> {
  const rows = await runQuery(`
    SELECT count() AS total
    FROM events
    WHERE event = 'extension_installed'
      AND toDate(timestamp) >= toDate('${weekStart}')
      AND toDate(timestamp) <= toDate('${weekEnd}')
  `);
  return { total: Number(rows[0]?.[0] ?? 0) };
}

export async function getActivationRate(
  weekStart: string,
  weekEnd: string,
): Promise<{ installs: number; activated_within_24h: number; rate: number }> {
  // Count installs in the week
  const installRows = await runQuery(`
    SELECT uniq(properties.anonymous_install_id) AS installs
    FROM events
    WHERE event = 'extension_installed'
      AND toDate(timestamp) >= toDate('${weekStart}')
      AND toDate(timestamp) <= toDate('${weekEnd}')
  `);
  const installs = Number(installRows[0]?.[0] ?? 0);

  // Count installs where the same ID had a search within the week (approx 24h activation)
  const activatedRows = await runQuery(`
    SELECT uniq(properties.anonymous_install_id) AS activated
    FROM events
    WHERE event = 'extension_installed'
      AND toDate(timestamp) >= toDate('${weekStart}')
      AND toDate(timestamp) <= toDate('${weekEnd}')
      AND properties.anonymous_install_id IN (
        SELECT properties.anonymous_install_id
        FROM events
        WHERE event = 'search_performed'
          AND toDate(timestamp) >= toDate('${weekStart}')
          AND toDate(timestamp) <= toDate('${weekEnd}') + INTERVAL 1 DAY
      )
  `);
  const activated_within_24h = Number(activatedRows[0]?.[0] ?? 0);

  return {
    installs,
    activated_within_24h,
    rate: installs > 0 ? round(activated_within_24h / installs) : 0,
  };
}

async function getRetentionWindow(
  weekStart: string,
  weekEnd: string,
  offsetDays: number,
): Promise<{ active_prior: number; returned: number; rate: number }> {
  const priorRows = await runQuery(`
    SELECT uniq(properties.anonymous_install_id) AS cnt
    FROM events
    WHERE toDate(timestamp) >= toDate('${weekStart}') - ${offsetDays}
      AND toDate(timestamp) <= toDate('${weekEnd}') - ${offsetDays}
  `);
  const active_prior = Number(priorRows[0]?.[0] ?? 0);

  const returnedRows = await runQuery(`
    SELECT uniq(properties.anonymous_install_id) AS cnt
    FROM events
    WHERE toDate(timestamp) >= toDate('${weekStart}')
      AND toDate(timestamp) <= toDate('${weekEnd}')
      AND properties.anonymous_install_id IN (
        SELECT DISTINCT properties.anonymous_install_id
        FROM events
        WHERE toDate(timestamp) >= toDate('${weekStart}') - ${offsetDays}
          AND toDate(timestamp) <= toDate('${weekEnd}') - ${offsetDays}
      )
  `);
  const returned = Number(returnedRows[0]?.[0] ?? 0);

  return { active_prior, returned, rate: active_prior > 0 ? round(returned / active_prior) : 0 };
}

export async function getRetention(weekStart: string, weekEnd: string) {
  const [w1, w4] = await Promise.all([
    getRetentionWindow(weekStart, weekEnd, 7),
    getRetentionWindow(weekStart, weekEnd, 28),
  ]);

  return {
    w1_rolling: { active_prior_week: w1.active_prior, returned: w1.returned, rate: w1.rate },
    w4_rolling: { active_4w_ago: w4.active_prior, returned: w4.returned, rate: w4.rate },
  };
}

export async function getEngagement(
  weekStart: string,
  weekEnd: string,
): Promise<{ wau: number; total_searches: number; searches_per_wau: number }> {
  const rows = await runQuery(`
    SELECT
      uniq(properties.anonymous_install_id) AS wau,
      countIf(event = 'search_performed') AS total_searches
    FROM events
    WHERE toDate(timestamp) >= toDate('${weekStart}')
      AND toDate(timestamp) <= toDate('${weekEnd}')
  `);
  const wau = Number(rows[0]?.[0] ?? 0);
  const total_searches = Number(rows[0]?.[1] ?? 0);
  return { wau, total_searches, searches_per_wau: wau > 0 ? round(total_searches / wau, 2) : 0 };
}

export async function getSearchQuality(weekStart: string, weekEnd: string) {
  const rows = await runQuery(`
    SELECT
      countIf(event = 'search_performed') AS searches,
      countIf(event = 'result_opened') AS clicks,
      countIf(event = 'zero_results_returned') AS zero_results
    FROM events
    WHERE toDate(timestamp) >= toDate('${weekStart}')
      AND toDate(timestamp) <= toDate('${weekEnd}')
      AND event IN ('search_performed', 'result_opened', 'zero_results_returned')
  `);
  const searches = Number(rows[0]?.[0] ?? 0);
  const clicks = Number(rows[0]?.[1] ?? 0);
  const zero_results = Number(rows[0]?.[2] ?? 0);
  return {
    searches,
    clicks,
    zero_results,
    click_rate: searches > 0 ? round(clicks / searches) : 0,
    zero_result_rate: searches > 0 ? round(zero_results / searches) : 0,
  };
}

export async function getPlatformDistribution(weekStart: string, weekEnd: string) {
  const [searchRows, clickRows] = await Promise.all([
    runQuery(`
      SELECT
        coalesce(nullIf(properties.platform_source, ''), 'unknown') AS platform,
        count() AS cnt
      FROM events
      WHERE event = 'search_performed'
        AND toDate(timestamp) >= toDate('${weekStart}')
        AND toDate(timestamp) <= toDate('${weekEnd}')
      GROUP BY platform
    `),
    runQuery(`
      SELECT
        coalesce(nullIf(properties.platform_source, ''), 'unknown') AS platform,
        count() AS cnt
      FROM events
      WHERE event = 'result_opened'
        AND toDate(timestamp) >= toDate('${weekStart}')
        AND toDate(timestamp) <= toDate('${weekEnd}')
      GROUP BY platform
    `),
  ]);

  function toRatios(rows: unknown[][]): Record<string, number> {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      const platform = String(row[0]);
      const cnt = Number(row[1]);
      counts[platform] = cnt;
      total += cnt;
    }
    const ratios: Record<string, number> = {};
    for (const [platform, cnt] of Object.entries(counts)) {
      ratios[platform] = total > 0 ? round(cnt / total) : 0;
    }
    return ratios;
  }

  return {
    searches: toRatios(searchRows),
    clicks: toRatios(clickRows),
  };
}

export async function getEmailCaptureRate(weekStart: string, weekEnd: string) {
  const wauRows = await runQuery(`
    SELECT uniq(properties.anonymous_install_id) AS wau
    FROM events
    WHERE toDate(timestamp) >= toDate('${weekStart}')
      AND toDate(timestamp) <= toDate('${weekEnd}')
  `);
  const wau = Number(wauRows[0]?.[0] ?? 0);

  const identifiedRows = await runQuery(`
    SELECT uniq(properties.anonymous_install_id) AS identified
    FROM events
    WHERE event = '$identify'
      AND toDate(timestamp) <= toDate('${weekEnd}')
  `);
  const identified = Number(identifiedRows[0]?.[0] ?? 0);

  return { wau, identified, rate: wau > 0 ? round(identified / wau) : 0 };
}

export async function collectMetrics(weekStart: string, weekEnd: string): Promise<MetricsSnapshot> {
  console.log(`Fetching PostHog metrics for ${weekStart} → ${weekEnd}…`);

  const [installs, activation, retention, engagement, search_quality, platforms, email_capture] =
    await Promise.all([
      getWeeklyInstalls(weekStart, weekEnd),
      getActivationRate(weekStart, weekEnd),
      getRetention(weekStart, weekEnd),
      getEngagement(weekStart, weekEnd),
      getSearchQuality(weekStart, weekEnd),
      getPlatformDistribution(weekStart, weekEnd),
      getEmailCaptureRate(weekStart, weekEnd),
    ]);

  return {
    week_start: weekStart,
    week_end: weekEnd,
    installs,
    activation,
    retention,
    engagement,
    search_quality,
    platforms,
    email_capture,
  };
}
