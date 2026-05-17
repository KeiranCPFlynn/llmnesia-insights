import type { AnalysisResult, Correction, HistoricalInsight, MetricsSnapshot } from './types.js';
import { SYSTEM_PROMPT } from './prompts/analysis-prompt.js';
import { callLlm, resolveProvider, type LlmProvider, type LlmTool } from './llm.js';

const ANALYSIS_TOOL: LlmTool = {
  name: 'submit_analysis',
  description: 'Submit the weekly product analysis result.',
  input_schema: {
    type: 'object',
    properties: {
      headline: {
        type: 'string',
        description:
          'ONE plain-English sentence: the single most important thing the founder should know this week. No jargon, no metric names — say what it means.',
      },
      summary: {
        type: 'string',
        description:
          '2-3 sentences in plain language expanding on the headline. Write for a busy founder, not an analyst.',
      },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            metric: { type: 'string', description: 'Short plain label, e.g. "Activation" not "activation.rate"' },
            observation: {
              type: 'string',
              description: 'One plain sentence on what is happening and why it matters. No jargon.',
            },
            severity: { type: 'string', enum: ['info', 'watch', 'concern', 'critical'] },
            source: {
              type: 'string',
              enum: ['PostHog', 'GA4', 'Combined'],
              description:
                'Where this comes from: PostHog (in-product usage), GA4 (website / store traffic), or Combined (uses both).',
            },
          },
          required: ['metric', 'observation', 'severity', 'source'],
        },
      },
      action_items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            action: { type: 'string' },
            rationale: { type: 'string' },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: ['action', 'rationale', 'priority'],
        },
      },
      open_threads: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            thread: { type: 'string' },
            first_flagged: { type: 'string' },
            current_status: { type: 'string' },
          },
          required: ['thread', 'first_flagged', 'current_status'],
        },
      },
      resolved_threads: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            thread: { type: 'string' },
            resolution: { type: 'string' },
          },
          required: ['thread', 'resolution'],
        },
      },
    },
    required: ['headline', 'summary', 'findings', 'action_items', 'open_threads', 'resolved_threads'],
  },
};

export async function analyseMetrics(
  metrics: MetricsSnapshot,
  history: HistoricalInsight[],
  corrections: Correction[] = [],
  provider?: LlmProvider | string | null,
): Promise<{ result: AnalysisResult; modelUsed: string }> {
  const resolved = resolveProvider(provider ?? undefined);

  console.log(
    `Running analysis via ${resolved}…${corrections.length ? ` (${corrections.length} caveat(s) applied)` : ''}`,
  );

  const caveats = corrections.filter((c) => c.kind !== 'context');
  const contexts = corrections.filter((c) => c.kind === 'context');
  const caveatBlock = caveats.length
    ? `\n\nKNOWN DATA CAVEATS — the founder has confirmed these. Treat them as AUTHORITATIVE and override the raw numbers accordingly. Do NOT flag a problem that a caveat explains away; if a caveat invalidates a metric, say the metric is unreliable this week rather than drawing a negative conclusion from it:\n${caveats
        .map((c) => `- [${c.affected_metric}] ${c.note}`)
        .join('\n')}`
    : '';
  const contextBlock = contexts.length
    ? `\n\nFOUNDER CONTEXT — real-world facts the data doesn't capture. Treat as AUTHORITATIVE. Use them to explain movements (don't attribute a change to a user-behaviour cause a context note already accounts for) and factor them into your conclusions:\n${contexts
        .map((c) => `- [${c.affected_metric}] ${c.note}`)
        .join('\n')}`
    : '';

  const { text, toolCall, modelUsed } = await callLlm({
    provider: resolved,
    // No max_tokens: this is a weekly batch analytics run — a truncated report
    // is far worse than the token cost. Each provider runs to its model max
    // (DeepSeek reasoning models need the headroom for reasoning + the JSON).
    tools: [ANALYSIS_TOOL],
    toolChoice: { type: 'tool', name: 'submit_analysis' },
    system: [{ text: SYSTEM_PROMPT, cache: true }],
    messages: [
      {
        role: 'user',
        blocks: [
          // Compact JSON (no pretty-print): identical content to the model,
          // but ~20-30% fewer tokens than 2-space-indented data.
          { text: `PREVIOUS 6 WEEKS OF ANALYSIS:\n${JSON.stringify(history)}`, cache: true },
          {
            text: `THIS WEEK'S METRICS:\n${JSON.stringify(metrics)}${caveatBlock}${contextBlock}`,
          },
        ],
      },
    ],
  });

  if (!toolCall || toolCall.name !== 'submit_analysis') {
    throw new Error(
      `${resolved} did not call submit_analysis tool${text ? ` (said: ${text.slice(0, 200)})` : ''}`,
    );
  }

  return { result: toolCall.input as unknown as AnalysisResult, modelUsed };
}
