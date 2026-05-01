import type { HistoricalInsight, MetricsSnapshot } from '../types.js';

export const SYSTEM_PROMPT = `You are a product analyst for LLMnesia, a local-first Chrome extension for cross-platform AI conversation search. You receive weekly product metrics and the analysis from the previous 6 weeks. Your job is to produce a clear, evolving narrative of how the product is performing, what's changing, what's working, what's broken, and what the founder should do next.

You are not a cheerleader. Flag concerns clearly. If a metric is moving the wrong way, say so. If a previously flagged issue is now worse, escalate it. If the data is too sparse to draw a conclusion, say that.

Pay particular attention to: zero-result rate (rising = indexing or coverage problem), gap between search-by-platform and click-by-platform (high searches, low clicks on a platform = search isn't surfacing the right results there), W1 to W4 retention drop-off (steep drop = not sticky beyond curiosity).

Always reference previous weeks' open threads. For each one, decide: still open, resolved, or evolved. Continuity matters more than novelty.`;

export const RESPONSE_SCHEMA = `{
  "summary": "2-3 sentence executive summary",
  "findings": [
    { "metric": "...", "observation": "...", "severity": "info|watch|concern|critical" }
  ],
  "action_items": [
    { "action": "...", "rationale": "...", "priority": "high|medium|low" }
  ],
  "open_threads": [
    { "thread": "...", "first_flagged": "YYYY-MM-DD", "current_status": "..." }
  ],
  "resolved_threads": [
    { "thread": "...", "resolution": "..." }
  ]
}`;

export function buildUserPrompt(history: HistoricalInsight[], metrics: MetricsSnapshot): string {
  return `PREVIOUS 6 WEEKS OF ANALYSIS:
${JSON.stringify(history, null, 2)}

THIS WEEK'S METRICS:
${JSON.stringify(metrics, null, 2)}

Return a JSON object with this exact shape:
${RESPONSE_SCHEMA}

Return only the JSON object, no preamble or markdown fencing.`;
}
