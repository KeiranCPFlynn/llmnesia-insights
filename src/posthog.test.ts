import assert from 'node:assert/strict';
import test from 'node:test';
import { getPlatformDistribution, getSearchQuality } from './posthog.js';

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
      results = [[10, 4, 2, 6, 1]];
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
    assert.deepEqual(quality, {
      searches: 10,
      clicks: 4,
      popup_recent_opens: 2,
      clicks_including_popup_recents: 6,
      zero_results: 1,
      click_rate: 0.4,
      click_rate_including_popup_recents: 0.6,
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
