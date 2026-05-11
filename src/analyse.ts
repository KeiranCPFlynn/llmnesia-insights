import Anthropic from '@anthropic-ai/sdk';
import type { AnalysisResult, HistoricalInsight, MetricsSnapshot } from './types.js';
import { SYSTEM_PROMPT } from './prompts/analysis-prompt.js';

const MODEL = 'claude-sonnet-4-6';

const ANALYSIS_TOOL: Anthropic.Tool = {
  name: 'submit_analysis',
  description: 'Submit the weekly product analysis result.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: '2-3 sentence executive summary' },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            metric: { type: 'string' },
            observation: { type: 'string' },
            severity: { type: 'string', enum: ['info', 'watch', 'concern', 'critical'] },
          },
          required: ['metric', 'observation', 'severity'],
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
    required: ['summary', 'findings', 'action_items', 'open_threads', 'resolved_threads'],
  },
};

export async function analyseMetrics(
  metrics: MetricsSnapshot,
  history: HistoricalInsight[],
): Promise<{ result: AnalysisResult; modelUsed: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required');

  const client = new Anthropic({ apiKey });

  console.log('Running analysis via Claude…');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [ANALYSIS_TOOL],
    tool_choice: { type: 'tool', name: 'submit_analysis' },
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `PREVIOUS 6 WEEKS OF ANALYSIS:\n${JSON.stringify(history, null, 2)}`,
            cache_control: { type: 'ephemeral' },
          },
          {
            type: 'text',
            text: `THIS WEEK'S METRICS:\n${JSON.stringify(metrics, null, 2)}`,
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Claude did not call submit_analysis tool');
  }

  const result = toolUse.input as AnalysisResult;

  const usage = response.usage as { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  console.log(
    `Analysis complete. Tokens: ${usage.input_tokens} in / ${usage.output_tokens} out` +
      (usage.cache_read_input_tokens ? ` / ${usage.cache_read_input_tokens} cache-read` : ''),
  );

  return { result, modelUsed: response.model };
}
