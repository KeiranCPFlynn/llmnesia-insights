import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getInsightByWeek } from '../../../../src/supabase.js';
import { readBrief } from '../../../../src/brief.js';
import { callLlm, resolveProvider, type LlmTool } from '../../../../src/llm.js';
import { isAuthorized } from '../../../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false },
  });
}

const GOAL_TOOL: LlmTool = {
  name: 'submit_strategy_goal',
  description:
    "Draft the founder-owned goal that should steer this week's PM/revenue strategy.",
  input_schema: {
    type: 'object',
    properties: {
      goal: {
        type: 'string',
        description:
          'One or two plain sentences. Stage-aware, concrete, and suitable to save as the strategy goal.',
      },
      rationale: {
        type: 'string',
        description:
          'One short paragraph explaining why this is the right goal given the current situation.',
      },
    },
    required: ['goal', 'rationale'],
  },
};

function systemPrompt() {
  return `You help a solo founder set the CURRENT STRATEGY GOAL for LLMnesia.

The goal steers the Strategy page. It is not the generated strategy itself. Write a concise, founder-owned objective that fits the current stage.

Be stage-aware:
- If the user base is small, growth is flat, or retention/activation are not strong enough, the goal should usually focus on acquisition, activation, retention, store/site conversion, or learning what users value.
- Do not default to monetization, pricing pages, paywalls, or revenue experiments just because the product eventually needs revenue.
- Monetization can be a design-ahead concern, but it should only be the primary goal when the current data supports it or the founder explicitly asks for it.

If an existing goal is supplied, iterate it rather than replacing it blindly. Keep the result usable as a saved goal: direct, specific, and no markdown.`;
}

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { week, strategyGoal, action, provider } = (await req.json().catch(() => ({}))) as {
    week?: string;
    strategyGoal?: string;
    action?: 'save' | 'suggest';
    provider?: string;
  };
  if (!week) return NextResponse.json({ error: 'week is required' }, { status: 400 });

  const insight = await getInsightByWeek(week);
  if (!insight) return NextResponse.json({ error: `No report for ${week}` }, { status: 404 });

  if (action === 'suggest') {
    try {
      const brief = await readBrief();
      const response = await callLlm({
        provider: resolveProvider(provider ?? process.env.STRATEGY_PROVIDER ?? 'openai'),
        maxTokens: 2000,
        tools: [GOAL_TOOL],
        toolChoice: { type: 'tool', name: 'submit_strategy_goal' },
        system: [{ text: systemPrompt(), cache: true }],
        messages: [
          {
            role: 'user',
            blocks: [
              { text: `PROJECT BRIEF:\n${brief}`, cache: true },
              {
                text:
                  `WEEK: ${insight.week_start} → ${insight.week_end}\n\n` +
                  `EXISTING STRATEGY GOAL:\n${strategyGoal?.trim() || insight.strategy_goal?.trim() || '(none)'}\n\n` +
                  `CURRENT REPORT:\n${JSON.stringify({
                    headline: insight.headline,
                    summary: insight.summary,
                    findings: insight.findings,
                    action_items: insight.action_items,
                    open_threads: insight.open_threads,
                  })}\n\n` +
                  `RAW METRICS:\n${JSON.stringify(insight.metrics_snapshot)}\n\n` +
                  `CONFIRMED CAVEATS/CONTEXT:\n${JSON.stringify(insight.corrections ?? [])}\n\n` +
                  `CURRENT STRATEGY:\n${JSON.stringify(insight.strategy ?? null)}\n\n` +
                  `FOUNDER DECISIONS:\n${JSON.stringify(insight.strategy_decisions ?? [])}\n\n` +
                  `RECENT STRATEGY CHAT:\n${JSON.stringify((insight.strategy_chat ?? []).slice(-12))}`,
              },
            ],
          },
        ],
      });

      if (!response.toolCall || response.toolCall.name !== 'submit_strategy_goal') {
        throw new Error('Model did not return a strategy goal');
      }
      return NextResponse.json(response.toolCall.input);
    } catch (e) {
      console.error('[strategy/goal] suggest failed:', e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed to suggest goal' },
        { status: 500 },
      );
    }
  }

  const value = strategyGoal?.trim() || null;
  if (value && value.length > 2000) {
    return NextResponse.json(
      { error: 'strategyGoal must be 2000 characters or fewer' },
      { status: 400 },
    );
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('weekly_insights')
    .update({ strategy_goal: value })
    .eq('week_start', week)
    .select('week_start,strategy_goal')
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Failed to save strategy goal: ${error.message}` },
      { status: 500 },
    );
  }
  if (!data) return NextResponse.json({ error: `No report for ${week}` }, { status: 404 });

  return NextResponse.json({ ok: true, strategyGoal: value });
}
