import './env.js';
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

/**
 * Ground-truth event-name → count for a range. Unlike the weekly metrics (which
 * intentionally key off the newer `search_submitted` / `user_initiated`
 * instrumentation and read 0 until the new extension build propagates), this is
 * the raw picture of what's actually in the data — used by the Data explorer so
 * nothing shows a misleading 0.
 */
export async function getEventBreakdown(
  weekStart: string,
  weekEnd: string,
): Promise<Array<{ event: string; count: number }>> {
  const rows = await runQuery(`
    SELECT event, count() AS c
    FROM events
    WHERE toDate(timestamp) >= toDate('${weekStart}')
      AND toDate(timestamp) <= toDate('${weekEnd}')
    GROUP BY event
    ORDER BY c DESC
  `);
  return rows.map((r) => ({ event: String(r[0]), count: Number(r[1] ?? 0) }));
}

export async function getActivationRate(
  weekStart: string,
  weekEnd: string,
): Promise<{ installs: number; activated_within_24h: number; rate: number }> {
  // Activation = a real (search_submitted) search within 24h of install, where
  // the search timestamp is >= the install timestamp. The old query had no lower
  // bound and counted ANY search_performed in the window (even ones before the
  // install, and keystroke-level noise), returning an inflated ~97% artifact.
  // We join each install's install time to its search_submitted timestamps and
  // require at least one in the half-open window [install_ts, install_ts + 24h].
  const rows = await runQuery(`
    SELECT
      uniq(install_id) AS installs,
      uniqIf(install_id, activated = 1) AS activated
    FROM (
      SELECT
        i.install_id AS install_id,
        max(if(s.ts >= i.install_ts AND s.ts <= i.install_ts + INTERVAL 24 HOUR, 1, 0)) AS activated
      FROM (
        SELECT properties.anonymous_install_id AS install_id, min(timestamp) AS install_ts
        FROM events
        WHERE event = 'extension_installed'
          AND toDate(timestamp) >= toDate('${weekStart}')
          AND toDate(timestamp) <= toDate('${weekEnd}')
        GROUP BY install_id
      ) AS i
      LEFT JOIN (
        SELECT properties.anonymous_install_id AS install_id, timestamp AS ts
        FROM events
        WHERE event = 'search_submitted'
          AND toDate(timestamp) >= toDate('${weekStart}')
          AND toDate(timestamp) <= toDate('${weekEnd}') + 2
      ) AS s ON i.install_id = s.install_id
      GROUP BY i.install_id
    )
  `);
  const installs = Number(rows[0]?.[0] ?? 0);
  const activated_within_24h = Number(rows[0]?.[1] ?? 0);

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
  // Retention is now defined on genuine search activity: an install is "active"
  // in a window if it fired search_submitted there, and "returned" if it fired
  // search_submitted in both the prior window and the current one. Previously
  // this counted ANY event, so passive background traffic looked like retention.
  const priorRows = await runQuery(`
    SELECT uniq(properties.anonymous_install_id) AS cnt
    FROM events
    WHERE event = 'search_submitted'
      AND toDate(timestamp) >= toDate('${weekStart}') - ${offsetDays}
      AND toDate(timestamp) <= toDate('${weekEnd}') - ${offsetDays}
  `);
  const active_prior = Number(priorRows[0]?.[0] ?? 0);

  const returnedRows = await runQuery(`
    SELECT uniq(properties.anonymous_install_id) AS cnt
    FROM events
    WHERE event = 'search_submitted'
      AND toDate(timestamp) >= toDate('${weekStart}')
      AND toDate(timestamp) <= toDate('${weekEnd}')
      AND properties.anonymous_install_id IN (
        SELECT DISTINCT properties.anonymous_install_id
        FROM events
        WHERE event = 'search_submitted'
          AND toDate(timestamp) >= toDate('${weekStart}') - ${offsetDays}
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
): Promise<{ wau: number; wau_any_event: number; total_searches: number; searches_per_wau: number }> {
  // WAU is now distinct installs with at least one USER-INITIATED event in the
  // week (properties.user_initiated = 'true' — properties surface as strings in
  // this schema). This excludes passive lifecycle/impression/backfill traffic
  // that inflated the old count. `wau_any_event` reproduces the OLD definition
  // (any event at all) and is reported alongside for one month so the
  // discontinuity is visible rather than silent — REMOVE around 2026-08-10.
  // Because `user_initiated` only exists on events emitted after this instrument
  // change shipped, `wau` will read low until the new build has propagated.
  // total_searches now counts search_submitted (intentional searches), never the
  // keystroke-level search_performed.
  const rows = await runQuery(`
    SELECT
      uniqIf(properties.anonymous_install_id, properties.user_initiated = 'true') AS wau,
      uniq(properties.anonymous_install_id) AS wau_any_event,
      countIf(event = 'search_submitted') AS total_searches
    FROM events
    WHERE toDate(timestamp) >= toDate('${weekStart}')
      AND toDate(timestamp) <= toDate('${weekEnd}')
  `);
  const wau = Number(rows[0]?.[0] ?? 0);
  const wau_any_event = Number(rows[0]?.[1] ?? 0);
  const total_searches = Number(rows[0]?.[2] ?? 0);
  return { wau, wau_any_event, total_searches, searches_per_wau: wau > 0 ? round(total_searches / wau, 2) : 0 };
}

export async function getSearchQuality(weekStart: string, weekEnd: string) {
  // Click rate and zero-result rate are now measured against search_submitted
  // (intentional searches), with zero-results counted from zero_results_submitted
  // so numerator and denominator share the same event definition. The keystroke
  // events (search_performed / zero_results_returned) are never used here.
  // popup_recents opens have no search denominator and are split out; the old
  // all-surface numerator/rate remain explicit for historical continuity.
  const rows = await runQuery(`
    SELECT
      countIf(event = 'search_submitted') AS searches,
      countIf(
        event = 'result_opened'
        AND coalesce(nullIf(properties.surface, ''), 'overlay') != 'popup_recents'
      ) AS clicks,
      countIf(event = 'result_opened' AND properties.surface = 'popup_recents') AS popup_recent_opens,
      countIf(event = 'result_opened') AS clicks_including_popup_recents,
      countIf(event = 'zero_results_submitted') AS zero_results
    FROM events
    WHERE toDate(timestamp) >= toDate('${weekStart}')
      AND toDate(timestamp) <= toDate('${weekEnd}')
      AND event IN ('search_submitted', 'result_opened', 'zero_results_submitted')
  `);
  const searches = Number(rows[0]?.[0] ?? 0);
  const clicks = Number(rows[0]?.[1] ?? 0);
  const popup_recent_opens = Number(rows[0]?.[2] ?? 0);
  const clicks_including_popup_recents = Number(rows[0]?.[3] ?? 0);
  const zero_results = Number(rows[0]?.[4] ?? 0);
  return {
    searches,
    clicks,
    popup_recent_opens,
    clicks_including_popup_recents,
    zero_results,
    click_rate: searches > 0 ? round(clicks / searches) : 0,
    click_rate_including_popup_recents:
      searches > 0 ? round(clicks_including_popup_recents / searches) : 0,
    zero_result_rate: searches > 0 ? round(zero_results / searches) : 0,
  };
}

export async function getPlatformDistribution(weekStart: string, weekEnd: string) {
  // Canonical Platform union from LLMnesia's @llmnesia/shared-types package.
  // Keep this exhaustive: search_submitted emits one numeric shown_{slug}
  // property per platform represented in the visible result set.
  const PLATFORMS = [
    'chatgpt',
    'claude',
    'gemini',
    'deepseek',
    'perplexity',
    'grok',
    'mistral',
    'kimi',
    'qwen',
    'copilot',
    'ai_studio',
    'anthropic_console',
    'character_ai',
    'zai',
    'claude_code',
    'codex',
    'generic',
  ] as const;

  // Frozen at the original definition. Do not expand this list: the point of
  // the legacy series is to reproduce already-reported historical periods,
  // not to retrofit them to today's platform contract.
  const LEGACY_PLATFORMS = [
    'chatgpt',
    'claude',
    'gemini',
    'deepseek',
    'perplexity',
    'grok',
    'mistral',
    'generic',
  ] as const;

  const [searchRows, clickRows, popupRecentRows, legacySearchRows, legacyClickRows] = await Promise.all([
    runQuery(`
      SELECT
        ${PLATFORMS.map((platform) => `sum(toIntOrZero(properties.shown_${platform})) AS ${platform}`).join(',\n        ')}
      FROM events
      WHERE event = 'search_submitted'
        AND toDate(timestamp) >= toDate('${weekStart}')
        AND toDate(timestamp) <= toDate('${weekEnd}')
    `),
    runQuery(`
      SELECT
        coalesce(nullIf(properties.platform_source, ''), 'unknown') AS platform,
        count() AS cnt
      FROM events
      WHERE event = 'result_opened'
        AND toDate(timestamp) >= toDate('${weekStart}')
        AND toDate(timestamp) <= toDate('${weekEnd}')
        AND coalesce(nullIf(properties.surface, ''), 'overlay') != 'popup_recents'
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
        AND properties.surface = 'popup_recents'
      GROUP BY platform
    `),
    runQuery(`
      SELECT
        ${LEGACY_PLATFORMS.map((platform) => `sum(JSONExtractInt(properties.results_by_platform, '${platform}')) AS ${platform}`).join(',\n        ')}
      FROM events
      WHERE event = 'search_performed'
        AND toDate(timestamp) >= toDate('${weekStart}')
        AND toDate(timestamp) <= toDate('${weekEnd}')
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

  function searchRowToRatios(
    row: unknown[],
    platforms: readonly string[],
  ): Record<string, number> {
    const counts: Record<string, number> = {};
    let total = 0;
    for (let i = 0; i < platforms.length; i++) {
      const cnt = Number(row[i]) || 0;
      counts[platforms[i]] = cnt;
      total += cnt;
    }
    const ratios: Record<string, number> = {};
    for (const [platform, cnt] of Object.entries(counts)) {
      ratios[platform] = total > 0 ? round(cnt / total) : 0;
    }
    return ratios;
  }

  function clickRowsToRatios(rows: unknown[][]): Record<string, number> {
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
    searches: searchRowToRatios(searchRows[0] ?? [], PLATFORMS),
    clicks: clickRowsToRatios(clickRows),
    popup_recents: clickRowsToRatios(popupRecentRows),
    legacy: {
      searches: searchRowToRatios(legacySearchRows[0] ?? [], LEGACY_PLATFORMS),
      clicks: clickRowsToRatios(legacyClickRows),
    },
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

/**
 * Daily and weekly unique users per extension version. Every extension event
 * carries `properties.extension_version` (set from the manifest), so this
 * shows a rollout propagating: after a fix ships, its version should climb
 * while older versions decay. Use it to judge whether a fix actually reached
 * users and to correlate metric changes with version transitions.
 */
export async function getVersionAdoption(
  weekStart: string,
  weekEnd: string,
): Promise<MetricsSnapshot['version_adoption']> {
  const [dailyRows, weeklyRows] = await Promise.all([
    runQuery(`
      SELECT
        toDate(timestamp) AS day,
        coalesce(nullIf(properties.extension_version, ''), 'unknown') AS version,
        uniq(properties.anonymous_install_id) AS users
      FROM events
      WHERE toDate(timestamp) >= toDate('${weekStart}')
        AND toDate(timestamp) <= toDate('${weekEnd}')
      GROUP BY day, version
      ORDER BY day ASC, users DESC
    `),
    runQuery(`
      SELECT
        coalesce(nullIf(properties.extension_version, ''), 'unknown') AS version,
        uniq(properties.anonymous_install_id) AS users
      FROM events
      WHERE toDate(timestamp) >= toDate('${weekStart}')
        AND toDate(timestamp) <= toDate('${weekEnd}')
      GROUP BY version
      ORDER BY users DESC
    `),
  ]);

  return {
    daily: dailyRows.map((r) => ({
      date: String(r[0]).slice(0, 10),
      version: String(r[1]),
      users: Number(r[2]),
    })),
    weekly: weeklyRows.map((r) => ({
      version: String(r[0]),
      users: Number(r[1]),
    })),
  };
}

/**
 * Correlates completing the initial backfill with subsequent search engagement.
 * Lets us test DIRECTLY whether search activity rises after a user's historical
 * import finishes, rather than inferring it. Keyed on `backfill_first_completed`
 * (fired once per platform per install when the initial import finishes) joined
 * to `search_submitted` events that happen AFTER completion.
 *
 * Reports: how many installs finished a backfill this week, how many of those
 * searched afterward, that share, and searches per backfilled install.
 */
export async function getBackfillSearchCorrelation(
  weekStart: string,
  weekEnd: string,
): Promise<{
  backfilled_installs: number;
  searched_after: number;
  rate: number;
  searches_per_backfilled_install: number;
}> {
  const rows = await runQuery(`
    SELECT
      uniq(install_id) AS backfilled_installs,
      uniqIf(install_id, searches_after > 0) AS searched_after,
      sum(searches_after) AS total_searches_after
    FROM (
      SELECT
        b.install_id AS install_id,
        countIf(s.ts > b.completed_ts) AS searches_after
      FROM (
        SELECT properties.anonymous_install_id AS install_id, min(timestamp) AS completed_ts
        FROM events
        WHERE event = 'backfill_first_completed'
          AND toDate(timestamp) >= toDate('${weekStart}')
          AND toDate(timestamp) <= toDate('${weekEnd}')
        GROUP BY install_id
      ) AS b
      LEFT JOIN (
        SELECT properties.anonymous_install_id AS install_id, timestamp AS ts
        FROM events
        WHERE event = 'search_submitted'
          AND toDate(timestamp) >= toDate('${weekStart}')
          AND toDate(timestamp) <= toDate('${weekEnd}') + 14
      ) AS s ON b.install_id = s.install_id
      GROUP BY b.install_id
    )
  `);
  const backfilled_installs = Number(rows[0]?.[0] ?? 0);
  const searched_after = Number(rows[0]?.[1] ?? 0);
  const total_searches_after = Number(rows[0]?.[2] ?? 0);
  return {
    backfilled_installs,
    searched_after,
    rate: backfilled_installs > 0 ? round(searched_after / backfilled_installs) : 0,
    searches_per_backfilled_install:
      backfilled_installs > 0 ? round(total_searches_after / backfilled_installs, 2) : 0,
  };
}

export async function collectMetrics(weekStart: string, weekEnd: string): Promise<Omit<MetricsSnapshot, 'ga4'>> {
  console.log(`Fetching PostHog metrics for ${weekStart} → ${weekEnd}…`);

  const [
    installs,
    activation,
    retention,
    engagement,
    search_quality,
    platforms,
    email_capture,
    version_adoption,
    backfill_correlation,
  ] = await Promise.all([
    getWeeklyInstalls(weekStart, weekEnd),
    getActivationRate(weekStart, weekEnd),
    getRetention(weekStart, weekEnd),
    getEngagement(weekStart, weekEnd),
    getSearchQuality(weekStart, weekEnd),
    getPlatformDistribution(weekStart, weekEnd),
    getEmailCaptureRate(weekStart, weekEnd),
    getVersionAdoption(weekStart, weekEnd),
    getBackfillSearchCorrelation(weekStart, weekEnd),
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
    version_adoption,
    backfill_correlation,
  };
}
