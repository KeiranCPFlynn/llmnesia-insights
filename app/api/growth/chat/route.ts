import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAuthorized } from '../../../../lib/session';
import { readBrief } from '../../../../src/brief.js';
import { getSiteById } from '../../../../src/gsc.js';
import { getGrowthPlan, saveGrowthPlanChat } from '../../../../src/growth-plan.js';
import {
  callLlm,
  chatToLlmMessages,
  resolveProvider,
  type LlmTool,
} from '../../../../src/llm.js';
import type {
  ChatMessage,
  GrowthAction,
  GrowthOpportunity,
  GrowthRecommendation,
} from '../../../../src/types.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const REVISE_TOOL: LlmTool = {
  name: 'revise_growth_recommendation',
  description:
    'Call this when the founder asks to change, replace, or add a growth-plan recommendation, or asks for a fresh handoff prompt. Return the FULL recommendation. Only call after a concrete request.',
  input_schema: {
    type: 'object',
    properties: {
      replaces_id: {
        type: 'string',
        description:
          'The exact id of the existing recommendation being replaced. Omit only for a genuinely new recommendation.',
      },
      recommendation: {
        type: 'object',
        properties: {
          action_type: {
            type: 'string',
            enum: [
              'create',
              'improve',
              'title_meta',
              'add_section',
              'internal_link',
              'fix_indexing',
              'refresh',
              'supporting_cluster',
              'distribute',
              'monitor',
            ],
          },
          opportunity_id: { type: 'string' },
          target_query: { type: 'string' },
          target_page: { type: 'string' },
          title: { type: 'string' },
          recommendation: { type: 'string' },
          rationale: { type: 'string' },
          expected_impact: { type: 'string' },
          effort: { type: 'string', enum: ['S', 'M', 'L'] },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          source_data: { type: 'string' },
          next_step: { type: 'string' },
          target_repo: { type: 'string' },
          handoff: {
            type: 'object',
            properties: {
              coding_agent_prompt: { type: 'string' },
              founder_steps: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        required: [
          'action_type',
          'title',
          'recommendation',
          'rationale',
          'expected_impact',
          'effort',
          'confidence',
          'source_data',
          'next_step',
          'target_repo',
          'handoff',
        ],
      },
    },
    required: ['recommendation'],
  },
};

type GrowthRevision = {
  replaces_id?: string;
  recommendation: Omit<GrowthRecommendation, 'id'>;
};

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false },
  });
}

function systemPrompt({
  brief,
  siteName,
  siteUrl,
  siteRepo,
  growthGoal,
  weekStart,
  plan,
  opportunities,
  actions,
  focusedRecommendationId,
}: {
  brief: string;
  siteName: string;
  siteUrl: string;
  siteRepo?: string | null;
  growthGoal?: string | null;
  weekStart: string;
  plan: NonNullable<Awaited<ReturnType<typeof getGrowthPlan>>>;
  opportunities: GrowthOpportunity[];
  actions: GrowthAction[];
  focusedRecommendationId?: string;
}) {
  const focusedRecommendation = focusedRecommendationId
    ? plan.recommendations.find((recommendation) => recommendation.id === focusedRecommendationId)
    : null;

  return `You are the acting Head of SEO/Content Growth discussing ONE weekly plan with a solo founder. Be concise, direct, and evidence-led.

The CURRENT GROWTH GOAL is founder-owned and takes priority. Stay within organic traffic, search visibility, product discovery, and content growth unless that goal explicitly expands scope.

When the founder asks for a concrete change to an existing recommendation, call revise_growth_recommendation and set replaces_id to that recommendation's exact id. When they ask for a genuinely new recommendation, omit replaces_id. Return the FULL recommendation, including a self-contained coding-agent prompt or founder checklist. Preserve the supplied opportunity_id when the revised work is still based on that opportunity. Do not invent GSC evidence.

${focusedRecommendation
  ? `THIS IS A RECOMMENDATION-SPECIFIC THREAD.
The founder is discussing recommendation id "${focusedRecommendation.id}" titled "${focusedRecommendation.title}".
Keep the discussion focused on this recommendation. If asked to regenerate, revise, replace, simplify, expand, or create a new handoff for "this recommendation", you MUST call revise_growth_recommendation with replaces_id exactly "${focusedRecommendation.id}". Do not add a separate recommendation unless the founder explicitly asks for an additional item.

FOCUSED RECOMMENDATION:
${JSON.stringify(focusedRecommendation)}`
  : 'This is a plan-wide discussion. Ask which recommendation the founder means if a requested change is ambiguous.'}

PROJECT BRIEF:
${brief}

SITE: ${siteName} (${siteUrl})
SITE REPO: ${siteRepo || '<your-site-repo>'}
WEEK: ${weekStart}
CURRENT GROWTH GOAL:
${growthGoal?.trim() || '(none set)'}

CURRENT PLAN:
${JSON.stringify({
  thesis: plan.thesis,
  recommendations: plan.recommendations,
  risks: plan.risks,
  experiments: plan.experiments,
})}

DETECTED OPPORTUNITIES:
${JSON.stringify(opportunities)}

CURRENT/RECENT ACTIONS (respect completed, ignored, and monitoring state):
${JSON.stringify(actions)}`;
}

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { siteId, weekStart, messages, provider, recommendationId } = (await req.json().catch(() => ({}))) as {
    siteId?: string;
    weekStart?: string;
    messages?: ChatMessage[];
    provider?: string;
    recommendationId?: string;
  };
  if (!siteId || !weekStart || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: 'siteId, weekStart and messages are required' },
      { status: 400 },
    );
  }

  const [site, plan, brief] = await Promise.all([
    getSiteById(siteId),
    getGrowthPlan(siteId, weekStart),
    readBrief(),
  ]);
  if (!site) return NextResponse.json({ error: `No site ${siteId}` }, { status: 404 });
  if (!plan) {
    return NextResponse.json({ error: 'Generate a growth plan before discussing it' }, { status: 404 });
  }
  if (
    recommendationId &&
    !plan.recommendations.some((recommendation) => recommendation.id === recommendationId)
  ) {
    return NextResponse.json({ error: 'That recommendation is no longer in this plan' }, { status: 404 });
  }

  try {
    const supabase = getSupabase();
    const [opportunitiesRes, actionsRes] = await Promise.all([
      supabase
        .from('growth_opportunities')
        .select('*')
        .eq('site_id', siteId)
        .eq('week_start', weekStart)
        .order('score', { ascending: false })
        .limit(25),
      supabase
        .from('growth_actions')
        .select('*')
        .eq('site_id', siteId)
        .order('status_updated_at', { ascending: false })
        .limit(40),
    ]);
    if (opportunitiesRes.error) throw new Error(opportunitiesRes.error.message);
    if (actionsRes.error) throw new Error(actionsRes.error.message);

    const response = await callLlm({
      provider: resolveProvider(
        provider ?? process.env.GROWTH_PROVIDER ?? process.env.LLM_PROVIDER ?? 'claude',
      ),
      maxTokens: 8000,
      tools: [REVISE_TOOL],
      toolChoice: 'auto',
      system: [
        {
          text: systemPrompt({
            brief: site.brief_override?.trim() || brief,
            siteName: site.name,
            siteUrl: site.root_url,
            siteRepo: site.repo,
            growthGoal: site.growth_goal,
            weekStart,
            plan,
            opportunities: (opportunitiesRes.data as GrowthOpportunity[]) ?? [],
            actions: (actionsRes.data as GrowthAction[]) ?? [],
            focusedRecommendationId: recommendationId,
          }),
          cache: true,
        },
      ],
      messages: chatToLlmMessages(messages),
    });

    const revision = response.toolCall
      ? (response.toolCall.input as GrowthRevision)
      : null;
    const reply =
      response.text.trim() ||
      (revision
        ? revision.replaces_id
          ? 'I drafted the revised recommendation. Review it below before applying it.'
          : 'I drafted a new recommendation. Review it below before adding it.'
        : 'No response.');
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: reply,
      ts: new Date().toISOString(),
    };

    await saveGrowthPlanChat(
      siteId,
      weekStart,
      [...messages, assistantMsg],
      recommendationId,
    );
    return NextResponse.json({ reply: assistantMsg, revision });
  } catch (e) {
    console.error('[growth/chat] failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Growth chat failed' },
      { status: 500 },
    );
  }
}
