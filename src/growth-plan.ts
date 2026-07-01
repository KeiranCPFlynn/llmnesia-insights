import './env.js';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { callLlm, resolveProvider, type LlmProvider, type LlmTool } from './llm.js';
import { GROWTH_PLAN_SYSTEM_PROMPT } from './prompts/growth-prompt.js';
import { getSiteScale, type SiteScale } from './growth.js';
import { getBingDigest } from './bing.js';
import type {
  ChatMessage,
  GrowthAction,
  GrowthActionStatus,
  GrowthOpportunity,
  GrowthPlan,
  GrowthPlanBalance,
  GrowthRecommendation,
  Site,
} from './types.js';

/**
 * Statuses that mean "this is done or discarded — don't re-pitch it."
 * Everything else (planned, briefed, drafted, idea, needs_adjustment) is
 * still open work the plan should build on rather than duplicate.
 */
const HANDLED_ACTION_STATUSES = new Set<GrowthActionStatus>([
  'completed',
  'ignored',
  'published',
  'updated',
  'monitoring',
  'actioned',
]);

const PLAN_TOOL: LlmTool = {
  name: 'submit_growth_plan',
  description: "Submit this week's traffic-growth action plan for the site.",
  input_schema: {
    type: 'object',
    properties: {
      thesis: {
        type: 'string',
        description:
          'One or two plain sentences — the dominant lever this week and why.',
      },
      balance: {
        type: 'object',
        description: 'How the plan splits across action archetypes.',
        properties: {
          create: { type: 'integer', description: 'count of brand-new pages/posts' },
          improve: { type: 'integer', description: 'count of update/add-section/title_meta/refresh' },
          link: { type: 'integer', description: 'count of internal-linking actions' },
          fix: { type: 'integer', description: 'count of indexing / technical fixes' },
          distribute: { type: 'integer', description: 'count of external distribution actions' },
          measure: { type: 'integer', description: 'count of monitor / measure actions' },
        },
        required: ['create', 'improve', 'link', 'fix', 'distribute', 'measure'],
      },
      recommendations: {
        type: 'array',
        description: '5–10 recommendations, ranked so index 0 is the single thing to do first.',
        items: {
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
            opportunity_id: {
              type: 'string',
              description:
                'When this recommendation is derived from one of the supplied candidates, copy its id verbatim. Omit for free-form recommendations.',
            },
            target_query: { type: 'string' },
            target_page: { type: 'string' },
            title: {
              type: 'string',
              description: 'Short imperative label.',
            },
            recommendation: { type: 'string', description: 'What to do, concretely.' },
            rationale: { type: 'string', description: 'Why — tied to the evidence.' },
            expected_impact: { type: 'string' },
            effort: { type: 'string', enum: ['S', 'M', 'L'] },
            confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
            source_data: {
              type: 'string',
              description: '1 line summarizing the GSC/GA4 numbers behind the call.',
            },
            next_step: { type: 'string' },
            target_repo: {
              type: 'string',
              description:
                "Repo folder name to open in Claude Code / Codex (e.g. 'llmnesia-site njs'). Use the `repo` value supplied for this site. Use 'none' for ops-only / measure / distribute actions with no code change.",
            },
            handoff: {
              type: 'object',
              description:
                'One-click handoff for the founder. Provide coding_agent_prompt for code changes; founder_steps for ops/manual work; either or both may be present.',
              properties: {
                coding_agent_prompt: {
                  type: 'string',
                  description:
                    "Self-contained prompt to paste into Claude Code / Codex with the target repo open. Name the repo, state the goal, the concrete change (file paths if known from the GSC data — e.g. the page URL maps to a content file path), and acceptance criteria. Must stand alone; the agent has not seen this plan. Omit when no code is involved.",
                },
                founder_steps: {
                  type: 'array',
                  items: { type: 'string' },
                  description:
                    "Ordered checklist of non-code steps (e.g. 'Submit updated sitemap in Search Console', 'Tweet linking to the new post'). Omit when the work is purely code.",
                },
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
    required: ['thesis', 'balance', 'recommendations', 'risks', 'experiments'],
  },
};

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * The LLM does not need every opportunity row — pass the top-N already-ranked
 * candidates with their evidence. Keeps input tokens bounded and the model
 * focused on the highest-leverage items.
 */
function digestOpportunities(opportunities: GrowthOpportunity[], topN = 25) {
  return opportunities.slice(0, topN).map((o) => ({
    id: o.id,
    type: o.type,
    target_query: o.target_query,
    target_page: o.target_page,
    score: o.score,
    impressions: o.evidence.impressions,
    clicks: o.evidence.clicks,
    ctr: Number((o.evidence.ctr * 100).toFixed(2)),
    position: Number(o.evidence.position.toFixed(1)),
    reasons: o.evidence.reasons,
    prior: o.evidence.prior
      ? {
          impressions: o.evidence.prior.impressions,
          clicks: o.evidence.prior.clicks,
          ctr: Number((o.evidence.prior.ctr * 100).toFixed(2)),
          position: Number(o.evidence.prior.position.toFixed(1)),
        }
      : undefined,
  }));
}

/**
 * The evidence bundle behind a plan/discussion — GA4 traffic, Bing queries,
 * and site scale. Shared by generation and chat so the discussion always has
 * the same evidence the plan was actually built from (previously the chat
 * prompt omitted all three, so it couldn't back up its own recommendations
 * with the numbers that justified them).
 */
export async function getGrowthContextDigests(
  site: Site,
  weekStart: string,
): Promise<{ ga4Digest: unknown; bingDigest: unknown; siteScale: SiteScale }> {
  const supabase = getSupabase();

  const [siteScale, bingDigest] = await Promise.all([
    getSiteScale(site, weekStart),
    process.env.BING_WEBMASTER_API_KEY
      ? getBingDigest(site.id).catch((e) => {
          console.error('[growth-context] bing digest failed:', e);
          return null;
        })
      : Promise.resolve(null),
  ]);

  // v1: only the primary product has a matching weekly_insights GA4 block;
  // other sites get null and the prompt tolerates that (see growth-prompt.ts).
  let ga4Digest: unknown = null;
  if (site.name.toLowerCase() === 'llmnesia') {
    const { data: latest } = await supabase
      .from('weekly_insights')
      .select('metrics_snapshot')
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle();
    const m = (latest as { metrics_snapshot?: { ga4?: unknown } } | null)?.metrics_snapshot;
    ga4Digest = m?.ga4 ?? null;
  }

  return { ga4Digest, bingDigest, siteScale };
}

export interface GrowthPlanInputs {
  site: Site;
  weekStart: string;
  brief: string;
  growthGoal?: string | null;
  opportunities: GrowthOpportunity[];
  ga4Digest?: unknown;
  /** Top Bing queries (clicks/impressions/position) for context alongside GSC. */
  bingDigest?: unknown;
  /** Total impressions/clicks/queries in window — tells the LLM "small site" vs "big site". */
  siteScale?: SiteScale;
  /** One-off founder context typed beside the Generate/Regenerate button. */
  generationContext?: string | null;
  priorPlans: { week_start: string; thesis: string }[];
  priorActions: Pick<GrowthAction, 'site_id' | 'week_start' | 'action_type' | 'status' | 'target_query' | 'target_page' | 'published_url'>[];
  provider?: LlmProvider | string | null;
}

export async function generateGrowthPlan(
  inputs: GrowthPlanInputs,
): Promise<{ plan: GrowthPlan; modelUsed: string }> {
  const resolved = resolveProvider(
    (inputs.provider as string) ?? process.env.GROWTH_PROVIDER ?? process.env.LLM_PROVIDER ?? 'claude',
  );

  console.log(`Generating growth plan via ${resolved} for ${inputs.site.name} (${inputs.weekStart})…`);

  const opportunityDigest = digestOpportunities(inputs.opportunities);
  const trimmedContext = inputs.generationContext?.trim();
  const handledActions = inputs.priorActions.filter((a) => HANDLED_ACTION_STATUSES.has(a.status));
  const openActions = inputs.priorActions.filter((a) => !HANDLED_ACTION_STATUSES.has(a.status));

  const { toolCall, text, modelUsed } = await callLlm({
    provider: resolved,
    tools: [PLAN_TOOL],
    toolChoice: { type: 'tool', name: 'submit_growth_plan' },
    system: [{ text: GROWTH_PLAN_SYSTEM_PROMPT, cache: true }],
    messages: [
      {
        role: 'user',
        blocks: [
          { text: `PROJECT BRIEF:\n${inputs.brief}`, cache: true },
          {
            text:
              `SITE: ${inputs.site.name} (${inputs.site.root_url})\n` +
              `SITE REPO (use for target_repo and in coding_agent_prompt): ${inputs.site.repo ? `"${inputs.site.repo}"` : '(unknown — use "<your-site-repo>")'}\n` +
              `WEEK: ${inputs.weekStart}\n\n` +
              `CURRENT GROWTH GOAL — optimize the plan for this. If absent, default to qualified organic traffic, product discovery, and useful content expansion; do NOT drift into monetization strategy:\n${inputs.growthGoal?.trim() || '(none)'}\n\n` +
              `SITE SCALE (rolling 90 days):\n${JSON.stringify(inputs.siteScale ?? null)}\n` +
              (inputs.siteScale?.is_small_site
                ? `↑ This is a SMALL / EARLY-STAGE site. Recommendations should favour creating new content and improving page-1 CTR over tactics that need volume to measure.\n\n`
                : '\n') +
              `ADDITIONAL FOUNDER CONTEXT FOR THIS GENERATION — treat as authoritative if present:\n${trimmedContext || '(none)'}\n\n` +
              `RANKED OPPORTUNITY CANDIDATES (top ${opportunityDigest.length}, deterministic detectors — do NOT invent extras):\n` +
              `${JSON.stringify(opportunityDigest)}\n\n` +
              `GA4 TRAFFIC DIGEST (this site, optional context):\n${JSON.stringify(inputs.ga4Digest ?? null)}\n\n` +
              `BING WEBMASTER DATA (top queries from Bing Search, optional context — null when not yet synced):\n${JSON.stringify(inputs.bingDigest ?? null)}\n\n` +
              `PRIOR PLAN THESES (oldest → newest):\n${JSON.stringify(inputs.priorPlans)}\n\n` +
              `ALREADY HANDLED — completed, published, or discarded. Do NOT re-suggest these queries/pages/actions or close variants, unless material new evidence justifies revisiting (say what changed):\n${JSON.stringify(handledActions)}\n\n` +
              `STILL OPEN — planned or needs adjustment but not yet done. Build on these rather than duplicating with a new recommendation for the same query/page:\n${JSON.stringify(openActions)}`,
          },
        ],
      },
    ],
  });

  if (!toolCall || toolCall.name !== 'submit_growth_plan') {
    throw new Error(
      `${resolved} did not call submit_growth_plan${text ? ` (said: ${text.slice(0, 200)})` : ''}`,
    );
  }

  const raw = toolCall.input as Omit<GrowthPlan, 'recommendations' | 'model_used' | 'generated_at'> & {
    recommendations: Omit<GrowthRecommendation, 'id'>[];
    balance: GrowthPlanBalance;
  };

  // Recommendation ids reset every regeneration, so the LLM's "don't re-pitch
  // handled work" instruction is a soft ask, not a guarantee (verified: it
  // still re-suggested a reworded duplicate of a completed recommendation).
  // `target_page` + `action_type` is the one part of a recommendation that
  // stays stable across regenerations, so hard-filter on it as a backstop —
  // any recommendation for a (page, action_type) already completed/ignored
  // gets dropped before the plan is even saved, regardless of the LLM's title.
  const handledPageActions = new Set(
    handledActions
      .filter((a) => a.target_page)
      .map((a) => `${a.target_page}::${a.action_type}`),
  );
  const deduped = (raw.recommendations ?? []).filter(
    (r) => !(r.target_page && handledPageActions.has(`${r.target_page}::${r.action_type}`)),
  );

  const recommendations = deduped.map((r) => ({ ...r, id: randomUUID() }));
  const plan: GrowthPlan = {
    thesis: raw.thesis,
    balance: balanceFor(recommendations),
    recommendations,
    risks: raw.risks ?? [],
    experiments: raw.experiments ?? [],
    model_used: modelUsed,
    generated_at: new Date().toISOString(),
  };

  return { plan, modelUsed };
}

export async function saveGrowthPlan(
  siteId: string,
  weekStart: string,
  plan: GrowthPlan,
): Promise<void> {
  const supabase = getSupabase();
  const existing = await getGrowthPlan(siteId, weekStart);
  const nextPlan: GrowthPlan = {
    ...plan,
    ...(existing?.chat?.length ? { chat: existing.chat } : {}),
  };
  const { error } = await supabase
    .from('growth_plans')
    .upsert(
      {
        site_id: siteId,
        week_start: weekStart,
        plan: nextPlan,
        model_used: nextPlan.model_used,
        generated_at: nextPlan.generated_at,
      },
      { onConflict: 'site_id,week_start' },
    );
  if (error) throw new Error(`growth_plans upsert failed: ${error.message}`);
}

export async function saveGrowthPlanChat(
  siteId: string,
  weekStart: string,
  chat: ChatMessage[],
  recommendationId?: string,
): Promise<void> {
  const plan = await getGrowthPlan(siteId, weekStart);
  if (!plan) throw new Error(`No growth plan for ${siteId} in week ${weekStart}`);

  const supabase = getSupabase();
  const nextPlan = recommendationId
    ? {
        ...plan,
        recommendation_chats: {
          ...(plan.recommendation_chats ?? {}),
          [recommendationId]: chat,
        },
      }
    : { ...plan, chat };
  const { error } = await supabase
    .from('growth_plans')
    .update({ plan: nextPlan })
    .eq('site_id', siteId)
    .eq('week_start', weekStart);
  if (error) throw new Error(`growth plan chat update failed: ${error.message}`);
}

function balanceFor(recommendations: GrowthRecommendation[]): GrowthPlanBalance {
  const balance: GrowthPlanBalance = {
    create: 0,
    improve: 0,
    link: 0,
    fix: 0,
    distribute: 0,
    measure: 0,
  };

  for (const rec of recommendations) {
    if (rec.action_type === 'create' || rec.action_type === 'supporting_cluster') {
      balance.create += 1;
    } else if (
      rec.action_type === 'improve' ||
      rec.action_type === 'title_meta' ||
      rec.action_type === 'add_section' ||
      rec.action_type === 'refresh'
    ) {
      balance.improve += 1;
    } else if (rec.action_type === 'internal_link') {
      balance.link += 1;
    } else if (rec.action_type === 'fix_indexing') {
      balance.fix += 1;
    } else if (rec.action_type === 'distribute') {
      balance.distribute += 1;
    } else {
      balance.measure += 1;
    }
  }

  return balance;
}

/**
 * Replace one recommendation while preserving its id, or append a new one.
 * Existing materialised actions are kept in sync with the recommendation's
 * execution fields without touching their workflow status or notes.
 */
export async function applyGrowthPlanRevision(
  siteId: string,
  weekStart: string,
  recommendation: GrowthRecommendation,
  replacesId?: string,
): Promise<GrowthPlan> {
  const plan = await getGrowthPlan(siteId, weekStart);
  if (!plan) throw new Error(`No growth plan for ${siteId} in week ${weekStart}`);

  const recs = plan.recommendations ?? [];
  const index = replacesId ? recs.findIndex((rec) => rec.id === replacesId) : -1;
  if (replacesId && index < 0) {
    throw new Error(`Recommendation ${replacesId} is no longer in this plan`);
  }

  const nextRecommendations =
    index >= 0
      ? recs.map((rec, i) => (i === index ? recommendation : rec))
      : [...recs, recommendation];
  const nextPlan: GrowthPlan = {
    ...plan,
    recommendations: nextRecommendations,
    balance: balanceFor(nextRecommendations),
  };

  const supabase = getSupabase();
  const { error } = await supabase
    .from('growth_plans')
    .update({ plan: nextPlan })
    .eq('site_id', siteId)
    .eq('week_start', weekStart);
  if (error) throw new Error(`growth plan revision failed: ${error.message}`);

  if (replacesId) {
    const { error: actionError } = await supabase
      .from('growth_actions')
      .update({
        opportunity_id: recommendation.opportunity_id ?? null,
        action_type: recommendation.action_type,
        target_query: recommendation.target_query ?? null,
        target_page: recommendation.target_page ?? null,
        suggested_title: recommendation.title,
      })
      .eq('site_id', siteId)
      .eq('recommendation_id', replacesId);
    if (actionError) {
      throw new Error(`recommendation updated but linked action sync failed: ${actionError.message}`);
    }
  }

  return nextPlan;
}

export async function getGrowthPlan(
  siteId: string,
  weekStart: string,
): Promise<GrowthPlan | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('growth_plans')
    .select('plan')
    .eq('site_id', siteId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (error) throw new Error(`growth_plans fetch failed: ${error.message}`);
  return ((data as { plan: GrowthPlan } | null)?.plan) ?? null;
}

export async function getPriorPlans(
  siteId: string,
  weekStart: string,
  limit = 4,
): Promise<{ week_start: string; thesis: string }[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('growth_plans')
    .select('week_start, plan')
    .eq('site_id', siteId)
    .lt('week_start', weekStart)
    .order('week_start', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`growth_plans history fetch failed: ${error.message}`);
  return (((data as { week_start: string; plan: GrowthPlan }[]) ?? []) as { week_start: string; plan: GrowthPlan }[])
    .reverse()
    .map((r) => ({ week_start: r.week_start, thesis: r.plan?.thesis ?? '' }));
}
