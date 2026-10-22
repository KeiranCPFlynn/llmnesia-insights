import assert from 'node:assert/strict';
import test from 'node:test';
import { getPlatformDistribution, getSearchQuality, getVaultFunnel } from './posthog.js';

const CANONICAL_PLATFORMS = [
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

test('platform distribution follows the intentional-search contract and preserves legacy series', async () => {
  const originalFetch = globalThis.fetch;
  const originalProjectId = process.env.POSTHOG_PROJECT_ID;
  const originalApiKey = process.env.POSTHOG_API_KEY;
  const queries: string[] = [];

  process.env.POSTHOG_PROJECT_ID = 'test-project';
  process.env.POSTHOG_API_KEY = 'test-key';
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { query: { query: string } };
    const query = body.query.query;
    queries.push(query);

    let results: unknown[][];
    if (query.includes("countIf(event = 'zero_results_submitted')")) {
      results = [[10, 4, 2, 15, 1, 6, 3, 8]];
    } else if (query.includes("event = 'search_submitted'")) {
      results = [CANONICAL_PLATFORMS.map((_, index) => index + 1)];
    } else if (query.includes("properties.surface, ''), 'overlay') != 'popup_recents'")) {
      results = [['chatgpt', 3], ['zai', 1]];
    } else if (query.includes("properties.surface = 'popup_recents'")) {
      results = [['chatgpt', 1], ['codex', 1]];
    } else if (query.includes("event = 'search_performed'")) {
      results = [[1, 1, 1, 1, 1, 1, 1, 1]];
    } else {
      results = [['chatgpt', 3], ['zai', 1], ['codex', 2]];
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const distribution = await getPlatformDistribution('2026-08-10', '2026-08-16');

    const submittedQuery = queries.find((query) => query.includes("event = 'search_submitted'"));
    assert.ok(submittedQuery);
    for (const platform of CANONICAL_PLATFORMS) {
      assert.match(submittedQuery, new RegExp(`properties\\.shown_${platform}\\b`));
      assert.ok(platform in distribution.searches);
    }
    for (const regressionPlatform of [
      'zai',
      'qwen',
      'character_ai',
      'copilot',
      'claude_code',
      'kimi',
      'ai_studio',
      'codex',
    ]) {
      assert.ok(distribution.searches[regressionPlatform] > 0);
    }
    assert.doesNotMatch(submittedQuery, /results_by_platform/);

    const searchResultOpenQuery = queries.find((query) => query.includes("properties.surface, ''), 'overlay')"));
    assert.ok(searchResultOpenQuery);
    assert.match(searchResultOpenQuery, /!= 'popup_recents'/);
    assert.deepEqual(distribution.clicks, { chatgpt: 0.75, zai: 0.25 });

    const popupRecentsQuery = queries.find((query) => query.includes("properties.surface = 'popup_recents'"));
    assert.ok(popupRecentsQuery);
    assert.deepEqual(distribution.popup_recents, { chatgpt: 0.5, codex: 0.5 });

    const legacySearchQuery = queries.find((query) => query.includes("event = 'search_performed'"));
    assert.ok(legacySearchQuery);
    assert.match(legacySearchQuery, /results_by_platform/);
    assert.doesNotMatch(legacySearchQuery, /shown_qwen/);
    assert.deepEqual(Object.keys(distribution.legacy.searches), [
      'chatgpt',
      'claude',
      'gemini',
      'deepseek',
      'perplexity',
      'grok',
      'mistral',
      'generic',
    ]);
    assert.deepEqual(distribution.legacy.clicks, {
      chatgpt: 0.5,
      zai: 0.1667,
      codex: 0.3333,
    });

    const quality = await getSearchQuality('2026-08-10', '2026-08-16');
    const qualityQuery = queries.find((query) => query.includes("countIf(event = 'zero_results_submitted')"));
    assert.ok(qualityQuery);
    assert.match(qualityQuery, /properties\.surface = 'popup_recents'/);
    assert.match(qualityQuery, /properties\.surface, ''\), 'overlay'\) != 'popup_recents'/);
    assert.match(qualityQuery, /properties\.from_search = true/);
    assert.match(qualityQuery, /properties\.from_search = false/);
    assert.match(qualityQuery, /properties\.from_search IS NULL/);
    assert.match(qualityQuery, /properties\.extension_version/);
    assert.match(qualityQuery, />= 18/);
    assert.deepEqual(quality, {
      searches: 10,
      clicks: 4,
      popup_recent_opens: 2,
      clicks_including_popup_recents: 15,
      zero_results: 1,
      overlay_recent_opens: 6,
      recent_opens: 8,
      origin_unknown_opens: 3,
      searches_with_origin_tracking: 8,
      click_rate_definition: 'from_search_v1',
      click_rate_coverage: 'Extension 0.4.18+ only; result_opened.from_search=true / search_submitted on 0.4.18+.',
      click_rate: 0.5,
      click_rate_including_popup_recents: 1.5,
      zero_result_rate: 0.1,
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalProjectId === undefined) delete process.env.POSTHOG_PROJECT_ID;
    else process.env.POSTHOG_PROJECT_ID = originalProjectId;
    if (originalApiKey === undefined) delete process.env.POSTHOG_API_KEY;
    else process.env.POSTHOG_API_KEY = originalApiKey;
  }
});

test('vault funnel counts unique identities per vault event within the reporting week', async () => {
  const originalFetch = globalThis.fetch;
  const originalProjectId = process.env.POSTHOG_PROJECT_ID;
  const originalApiKey = process.env.POSTHOG_API_KEY;
  const queries: string[] = [];

  process.env.POSTHOG_PROJECT_ID = 'test-project';
  process.env.POSTHOG_API_KEY = 'test-key';
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { query: { query: string } };
    queries.push(body.query.query);
    return new Response(JSON.stringify({ results: [[7, 5, 2, 2, 4, 3, 1, 2, 8, 3]] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const funnel = await getVaultFunnel('2026-09-28', '2026-10-04');

    assert.equal(queries.length, 1);
    const query = queries[0];
    // Unique-user counts keyed on PostHog's own distinct_id (the website
    // waitlist form has no anonymous_install_id property).
    for (const step of [
      'vault_waitlist_joined',
      'vault_created',
      'vault_checkout_opened',
      'vault_phone_qr_shown',
      'vault_unlocked',
      'vault_sync_completed',
      'vault_sync_failed',
      'vault_restore_completed',
      'vault_checkout_started',
      'vault_purchase_completed',
    ]) {
      assert.match(query, new RegExp(`uniqIf\\(distinct_id, event = '${step}'\\)`));
    }
    assert.match(query, /toDate\('2026-09-28'\)/);
    assert.match(query, /toDate\('2026-10-04'\)/);
    assert.deepEqual(funnel, {
      waitlist_joined: 7,
      created: 5,
      checkout_opened: 2,
      phone_qr_shown: 2,
      unlocked: 4,
      sync_completed: 3,
      sync_failed: 1,
      restore_completed: 2,
      website_checkout_started: 8,
      website_purchase_completed: 3,
    });

    // An empty result degrades to zeroes, never undefined.
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;
    const empty = await getVaultFunnel('2026-09-28', '2026-10-04');
    assert.deepEqual(empty, {
      waitlist_joined: 0,
      created: 0,
      checkout_opened: 0,
      phone_qr_shown: 0,
      unlocked: 0,
      sync_completed: 0,
      sync_failed: 0,
      restore_completed: 0,
      website_checkout_started: 0,
      website_purchase_completed: 0,
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalProjectId === undefined) delete process.env.POSTHOG_PROJECT_ID;
    else process.env.POSTHOG_PROJECT_ID = originalProjectId;
    if (originalApiKey === undefined) delete process.env.POSTHOG_API_KEY;
    else process.env.POSTHOG_API_KEY = originalApiKey;
  }
});

test('search rate without covered searches is unavailable, preserving legacy totals', async () => {
  const originalFetch = globalThis.fetch;
  const originalProjectId = process.env.POSTHOG_PROJECT_ID;
  const originalApiKey = process.env.POSTHOG_API_KEY;
  process.env.POSTHOG_PROJECT_ID = 'fixture-project';
  process.env.POSTHOG_API_KEY = 'fixture-key';
  globalThis.fetch = (async () => new Response(JSON.stringify({ results: [[100, 0, 2, 50, 1, 0, 48, 0]] }))) as typeof fetch;
  try {
    const quality = await getSearchQuality('2026-10-12', '2026-10-18');
    assert.equal(quality.click_rate, null);
    assert.equal(quality.click_rate_including_popup_recents, 0.5);
    assert.equal(quality.origin_unknown_opens, 48);
    assert.equal(quality.recent_opens, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalProjectId == null) delete process.env.POSTHOG_PROJECT_ID;
    else process.env.POSTHOG_PROJECT_ID = originalProjectId;
    if (originalApiKey == null) delete process.env.POSTHOG_API_KEY;
    else process.env.POSTHOG_API_KEY = originalApiKey;
  }
});
