import { NextResponse } from 'next/server';
import { getInsightByWeek, saveStrategyChat } from '../../../../src/supabase.js';
import { readBrief } from '../../../../src/brief.js';
import type { ChatMessage, StrategyRecommendation } from '../../../../src/types.js';
import { callLlm, chatToLlmMessages, resolveProvider, type LlmTool } from '../../../../src/llm.js';
import { isAuthorized } from '../../../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const REVISE_TOOL: LlmTool = {
  name: 'revise_strategy',
  description:
    "Call this when the founder asks you to change, replace, or add a recommendation, or wants a fresh/updated handoff prompt for one. Return the FULL revised recommendation. Only call after the founder has asked for a concrete change — not speculatively.",
  input_schema: {
    type: 'object',
    properties: {
      replaces_id: {
        type: 'string',
        description:
          'The id of the existing recommendation this replaces. Omit to add a brand-new recommendation.',
      },
      recommendation: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          area: {
            type: 'string',
            enum: ['monetization', 'pricing', 'site', 'app', 'growth', 'retention'],
          },
          target_repo: {
            type: 'string',
            enum: ['llmnesia-site', 'LLMnesia', 'llmnesia-insights', 'none'],
          },
          recommendation: { type: 'string' },
          rationale: { type: 'string' },
          expected_impact: { type: 'string' },
          effort: { type: 'string', enum: ['S', 'M', 'L'] },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          metrics_to_watch: { type: 'array', items: { type: 'string' } },
          handoff: {
            type: 'object',
            properties: {
              coding_agent_prompt: { type: 'string' },
              founder_steps: { type: 'array', items: { type: 'string' } },
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
    required: ['recommendation'],
  },
};

type StrategyRevision = {
  replaces_id?: string;
  recommendation: Omit<StrategyRecommendation, 'id'>;
};

function formatRevisionReply(text: string, revision: StrategyRevision | null): string {
  if (!revision) return text || 'No response.';

  const r = revision.recommendation;
  const lines = [
    text ||
      (revision.replaces_id
        ? "I've drafted a revised recommendation. Review it below, then apply it if it's right."
        : "I've drafted a new recommendation. Review it below, then add it to the strategy if it's right."),
    `### ${r.title}`,
    `**Area:** ${r.area}${r.target_repo !== 'none' ? ` · **Repo:** ${r.target_repo}` : ''}`,
    r.recommendation,
    `**Why:** ${r.rationale}`,
    `**Expected impact:** ${r.expected_impact}`,
    `**Effort:** ${r.effort} · **Confidence:** ${r.confidence}`,
  ];

  if (r.metrics_to_watch?.length) {
    lines.push(`**Metrics to watch:** ${r.metrics_to_watch.join(', ')}`);
  }

  if (r.handoff?.coding_agent_prompt) {
    lines.push(`#### Coding-agent prompt\n\n\`\`\`text\n${r.handoff.coding_agent_prompt.trim()}\n\`\`\``);
  }

  if (r.handoff?.founder_steps?.length) {
    lines.push(
      `#### Founder steps\n\n${r.handoff.founder_steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}`,
    );
  }

  return lines.join('\n\n');
}

function systemPrompt(
  insight: NonNullable<Awaited<ReturnType<typeof getInsightByWeek>>>,
  brief: string,
) {
  return `You are LLMnesia's acting Head of Product & Growth, in conversation with the solo founder about THIS week's revenue strategy. Be concise, plain, and operator-minded. Monetization comes first — the product is currently free with no revenue.

When the founder asks for a concrete change to a recommendation (cheaper price, different gating, a new/updated coding-agent prompt, a brand-new idea), call revise_strategy with the FULL revised recommendation so they can apply it. Otherwise just answer. If they ask for a handoff prompt, write it self-contained and repo-targeted (name the repo, goal, change, acceptance criteria) so it pastes straight into Claude Code / Codex.

PROJECT BRIEF:
${brief}

WEEK ${insight.week_start} → ${insight.week_end}

CURRENT STRATEGY:
${JSON.stringify(insight.strategy ?? null)}

FOUNDER DECISIONS THIS WEEK (respect them — don't re-push rejected):
${JSON.stringify(insight.strategy_decisions ?? [])}

THIS WEEK'S ANALYSIS (for grounding):
${JSON.stringify({
  headline: insight.headline,
  summary: insight.summary,
  findings: insight.findings,
})}`;
}

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { week, messages, provider } = (await req.json().catch(() => ({}))) as {
    week?: string;
    messages?: ChatMessage[];
    provider?: string;
  };
  if (!week || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'week and messages are required' }, { status: 400 });
  }

  const insight = await getInsightByWeek(week);
  if (!insight) return NextResponse.json({ error: `No report for ${week}` }, { status: 404 });

  try {
    const brief = await readBrief();
    const response = await callLlm({
      provider: resolveProvider(provider ?? process.env.STRATEGY_PROVIDER ?? 'openai'),
      maxTokens: 8000,
      tools: [REVISE_TOOL],
      toolChoice: 'auto',
      system: [{ text: systemPrompt(insight, brief), cache: true }],
      messages: chatToLlmMessages(messages),
    });

    const revision = response.toolCall ? (response.toolCall.input as StrategyRevision) : null;
    const reply = formatRevisionReply(response.text.trim(), revision);

    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: reply,
      ts: new Date().toISOString(),
    };

    await saveStrategyChat(week, [...messages, assistantMsg]);

    return NextResponse.json({ reply: assistantMsg, revision });
  } catch (e) {
    console.error('[strategy/chat] failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Chat failed' },
      { status: 500 },
    );
  }
}
