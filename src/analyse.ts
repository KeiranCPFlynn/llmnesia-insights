import Anthropic from '@anthropic-ai/sdk';
import type { AnalysisResult, HistoricalInsight, MetricsSnapshot } from './types.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts/analysis-prompt.js';

const MODEL = 'claude-sonnet-4-6';

export async function analyseMetrics(
  metrics: MetricsSnapshot,
  history: HistoricalInsight[],
): Promise<{ result: AnalysisResult; modelUsed: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required');

  const client = new Anthropic({ apiKey });
  const userPrompt = buildUserPrompt(history, metrics);

  console.log('Running analysis via Claude…');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
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
            // Cache the historical context — it's the same across any retries for this week's run
            text: `PREVIOUS 6 WEEKS OF ANALYSIS:\n${JSON.stringify(history, null, 2)}`,
            cache_control: { type: 'ephemeral' },
          },
          {
            type: 'text',
            text: `THIS WEEK'S METRICS:\n${JSON.stringify(metrics, null, 2)}\n\nReturn a JSON object with this exact shape:\n${JSON.stringify(
              {
                summary: '2-3 sentence executive summary',
                findings: [{ metric: '...', observation: '...', severity: 'info|watch|concern|critical' }],
                action_items: [{ action: '...', rationale: '...', priority: 'high|medium|low' }],
                open_threads: [{ thread: '...', first_flagged: 'YYYY-MM-DD', current_status: '...' }],
                resolved_threads: [{ thread: '...', resolution: '...' }],
              },
              null,
              2,
            )}\n\nReturn only the JSON object, no preamble or markdown fencing.`,
          },
        ],
      },
    ],
  });

  // Suppress unused variable warning — userPrompt is used only in dry-run context by callers
  void userPrompt;

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';

  let result: AnalysisResult;
  try {
    result = JSON.parse(raw) as AnalysisResult;
  } catch {
    console.error('Failed to parse Claude response as JSON. Raw response:\n', raw);
    throw new Error('Claude returned invalid JSON');
  }

  const usage = response.usage as { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  console.log(
    `Analysis complete. Tokens: ${usage.input_tokens} in / ${usage.output_tokens} out` +
      (usage.cache_read_input_tokens ? ` / ${usage.cache_read_input_tokens} cache-read` : ''),
  );

  return { result, modelUsed: response.model };
}
