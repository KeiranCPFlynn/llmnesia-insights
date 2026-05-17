import { randomUUID } from 'node:crypto';
import type {
  ActionItem,
  Correction,
  Finding,
  StrategyDecision,
  StrategyRecommendation,
  StrategyResult,
  Thread,
} from './types.js';
import { STRATEGY_SYSTEM_PROMPT } from './prompts/strategy-prompt.js';
import { callLlm, resolveProvider, type LlmProvider, type LlmTool } from './llm.js';

const STRATEGY_TOOL: LlmTool = {
  name: 'submit_strategy',
  description: "Submit this week's revenue/PM strategy.",
  input_schema: {
    type: 'object',
    properties: {
      thesis: {
        type: 'string',
        description:
          'The single revenue idea this week is built around — one or two plain sentences.',
      },
      monetization: {
        type: 'object',
        properties: {
          model: { type: 'string', description: 'How the product makes money (e.g. freemium Pro tier).' },
          what_to_gate: {
            type: 'string',
            description: 'Exactly what becomes paid vs stays free, respecting the privacy/local-data constraint.',
          },
          pricing_hypothesis: {
            type: 'string',
            description: 'A concrete price point and why (e.g. "$4/mo — below the impulse threshold for a utility").',
          },
        },
        required: ['model', 'what_to_gate', 'pricing_hypothesis'],
      },
      recommendations: {
        type: 'array',
        description: '3-6, ranked: index 0 is the single thing to do first.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short imperative label.' },
            area: {
              type: 'string',
              enum: ['monetization', 'pricing', 'site', 'app', 'growth', 'retention'],
            },
            target_repo: {
              type: 'string',
              enum: ['llmnesia-site', 'LLMnesia', 'llmnesia-insights', 'none'],
              description:
                'Where the code change lands: llmnesia-site (marketing site), LLMnesia (the extension), llmnesia-insights (this dashboard), or none (ops/marketing only).',
            },
            recommendation: { type: 'string', description: 'What to do, concretely.' },
            rationale: { type: 'string', description: 'Why — tied to the thesis and the metrics.' },
            expected_impact: {
              type: 'string',
              description: 'Which metric moves, roughly how much, and why.',
            },
            effort: { type: 'string', enum: ['S', 'M', 'L'] },
            confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
            metrics_to_watch: { type: 'array', items: { type: 'string' } },
            handoff: {
              type: 'object',
              properties: {
                coding_agent_prompt: {
                  type: 'string',
                  description:
                    'For code work: a self-contained prompt to paste into Claude Code / Codex with the target repo open. Name the repo, the goal, the concrete change, and acceptance criteria. Must stand alone. Omit if no code is involved.',
                },
                founder_steps: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'For non-code work: an ordered checklist for the founder. Omit if purely code.',
                },
              },
            },
          },
          required: [
            'title',
            'area',
            'target_repo',
            'recommendation',
            'rationale',
            'expected_impact',
            'effort',
            'confidence',
            'metrics_to_watch',
            'handoff',
          ],
        },
      },
      risks: { type: 'array', items: { type: 'string' } },
      experiments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            hypothesis: { type: 'string' },
            measure: { type: 'string' },
          },
          required: ['hypothesis', 'measure'],
        },
      },
    },
    required: ['thesis', 'monetization', 'recommendations', 'risks', 'experiments'],
  },
};

export interface StrategyInputs {
  weekStart: string;
  weekEnd: string;
  /** Curated PROJECT_BRIEF.md text — grounds the strategist in the product. */
  brief: string;
  analysis: {
    headline?: string;
    summary: string;
    findings: Finding[];
    action_items: ActionItem[];
    open_threads: Thread[];
  };
  metrics: unknown;
  corrections: Correction[];
  /** Prior weeks' theses, oldest → newest, for continuity. */
  priorStrategies: { week_start: string; thesis: string }[];
  /** Founder decisions on prior + current recommendations (the loop). */
  priorDecisions: { week_start: string; decisions: StrategyDecision[] }[];
  provider?: LlmProvider | string | null;
}

export async function generateStrategy(
  inputs: StrategyInputs,
): Promise<{ result: StrategyResult; modelUsed: string }> {
  const resolved = resolveProvider((inputs.provider as string) ?? process.env.STRATEGY_PROVIDER ?? 'openai');

  console.log(`Generating PM strategy via ${resolved} for ${inputs.weekStart}…`);

  const { text, toolCall, modelUsed } = await callLlm({
    provider: resolved,
    // Reasoning model; let it run to the model max (truncation > token cost).
    tools: [STRATEGY_TOOL],
    toolChoice: { type: 'tool', name: 'submit_strategy' },
    system: [{ text: STRATEGY_SYSTEM_PROMPT, cache: true }],
    messages: [
      {
        role: 'user',
        blocks: [
          { text: `PROJECT BRIEF:\n${inputs.brief}`, cache: true },
          {
            text:
              `WEEK: ${inputs.weekStart} → ${inputs.weekEnd}\n\n` +
              `THIS WEEK'S ANALYSIS:\n${JSON.stringify(inputs.analysis)}\n\n` +
              `RAW METRICS:\n${JSON.stringify(inputs.metrics)}\n\n` +
              `FOUNDER-CONFIRMED CAVEATS/CONTEXT:\n${JSON.stringify(inputs.corrections)}\n\n` +
              `PRIOR STRATEGY THESES (oldest→newest):\n${JSON.stringify(inputs.priorStrategies)}\n\n` +
              `FOUNDER DECISIONS ON PRIOR/CURRENT RECOMMENDATIONS — respect these (don't re-pitch rejected; build on accepted/shipped):\n${JSON.stringify(inputs.priorDecisions)}`,
          },
        ],
      },
    ],
  });

  if (!toolCall || toolCall.name !== 'submit_strategy') {
    throw new Error(
      `${resolved} did not call submit_strategy${text ? ` (said: ${text.slice(0, 200)})` : ''}`,
    );
  }

  const raw = toolCall.input as Omit<
    StrategyResult,
    'recommendations' | 'model_used' | 'generated_at'
  > & { recommendations: Omit<StrategyRecommendation, 'id'>[] };

  const result: StrategyResult = {
    thesis: raw.thesis,
    monetization: raw.monetization,
    recommendations: (raw.recommendations ?? []).map((r) => ({
      ...r,
      id: randomUUID(),
    })),
    risks: raw.risks ?? [],
    experiments: raw.experiments ?? [],
    model_used: modelUsed,
    generated_at: new Date().toISOString(),
  };

  return { result, modelUsed };
}
