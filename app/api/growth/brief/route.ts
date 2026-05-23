import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAuthorized } from '../../../../lib/session';
import { callLlm, resolveProvider, type LlmTool } from '../../../../src/llm.js';
import { GROWTH_BRIEF_SYSTEM_PROMPT } from '../../../../src/prompts/growth-prompt.js';
import { readBrief } from '../../../../src/brief.js';
import type { GrowthAction, GrowthBrief, GrowthOpportunity, GSCRow, Site } from '../../../../src/types.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const BRIEF_TOOL: LlmTool = {
  name: 'submit_brief',
  description: 'Submit the content brief for one growth action.',
  input_schema: {
    type: 'object',
    properties: {
      primary_query: { type: 'string' },
      supporting_queries: { type: 'array', items: { type: 'string' } },
      suggested_title: { type: 'string' },
      search_intent: { type: 'string' },
      format: { type: 'string', description: 'e.g. "how-to + checklist", "comparison table", "FAQ post".' },
      angle: { type: 'string', description: 'How this content differentiates from generic answers.' },
      sections: { type: 'array', items: { type: 'string' }, description: 'H2-level outline (4–7).' },
      internal_links: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'Existing page URL to link from.' },
            to: { type: 'string', description: 'Target URL (this page).' },
            anchor: { type: 'string', description: 'Suggested anchor text.' },
          },
        },
      },
      related_pages: { type: 'array', items: { type: 'string' } },
      reason: { type: 'string', description: 'The single sentence reason this is worth doing.' },
    },
    required: [
      'primary_query',
      'supporting_queries',
      'suggested_title',
      'search_intent',
      'format',
      'angle',
      'sections',
      'reason',
    ],
  },
};

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false },
  });
}

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { actionId, provider } = (await req.json().catch(() => ({}))) as {
    actionId?: string;
    provider?: string;
  };
  if (!actionId) {
    return NextResponse.json({ error: 'actionId is required' }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: actionRow, error: actionErr } = await supabase
    .from('growth_actions')
    .select('*')
    .eq('id', actionId)
    .maybeSingle();
  if (actionErr) return NextResponse.json({ error: actionErr.message }, { status: 500 });
  const action = actionRow as GrowthAction | null;
  if (!action) return NextResponse.json({ error: 'Action not found' }, { status: 404 });

  // Pull GSC evidence by query and by page in two separate queries — simpler
  // and safer than PostgREST `.or()`, since queries/URLs can contain `.` and
  // `,` which break the or-string parser.
  const gscByQuery = action.target_query
    ? supabase
        .from('gsc_rows')
        .select('query, page, date, clicks, impressions, ctr, position')
        .eq('site_id', action.site_id)
        .eq('query', action.target_query)
        .order('date', { ascending: false })
        .limit(40)
    : Promise.resolve({ data: [] as GSCRow[] });
  const gscByPage = action.target_page
    ? supabase
        .from('gsc_rows')
        .select('query, page, date, clicks, impressions, ctr, position')
        .eq('site_id', action.site_id)
        .eq('page', action.target_page)
        .order('date', { ascending: false })
        .limit(40)
    : Promise.resolve({ data: [] as GSCRow[] });

  const [siteRes, oppRes, qRes, pRes, briefText] = await Promise.all([
    supabase.from('sites').select('*').eq('id', action.site_id).maybeSingle(),
    action.opportunity_id
      ? supabase
          .from('growth_opportunities')
          .select('*')
          .eq('id', action.opportunity_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    gscByQuery,
    gscByPage,
    readBrief(),
  ]);

  const site = siteRes.data as Site | null;
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });
  const opportunity = (oppRes.data as GrowthOpportunity | null) ?? null;
  const gscRows = [
    ...((qRes.data as GSCRow[] | null) ?? []),
    ...((pRes.data as GSCRow[] | null) ?? []),
  ];

  const resolved = resolveProvider(provider ?? process.env.GROWTH_PROVIDER ?? process.env.LLM_PROVIDER ?? 'claude');

  const { toolCall, modelUsed, text } = await callLlm({
    provider: resolved,
    tools: [BRIEF_TOOL],
    toolChoice: { type: 'tool', name: 'submit_brief' },
    system: [{ text: GROWTH_BRIEF_SYSTEM_PROMPT, cache: true }],
    messages: [
      {
        role: 'user',
        blocks: [
          { text: `PROJECT BRIEF:\n${site.brief_override?.trim() || briefText}`, cache: true },
          {
            text:
              `SITE: ${site.name} (${site.root_url})\n` +
              `ACTION:\n${JSON.stringify({
                action_type: action.action_type,
                target_query: action.target_query,
                target_page: action.target_page,
                suggested_title: action.suggested_title,
                week_start: action.week_start,
                note: action.note,
              })}\n\n` +
              `OPPORTUNITY EVIDENCE:\n${JSON.stringify(opportunity?.evidence ?? null)}\n\n` +
              `RECENT GSC ROWS (target query/page, last entries):\n${JSON.stringify(gscRows)}`,
          },
        ],
      },
    ],
  });

  if (!toolCall || toolCall.name !== 'submit_brief') {
    return NextResponse.json(
      { error: `Brief LLM call did not return submit_brief${text ? ` — said: ${text.slice(0, 200)}` : ''}` },
      { status: 502 },
    );
  }

  const raw = toolCall.input as Omit<GrowthBrief, 'model_used' | 'generated_at'>;
  const brief: GrowthBrief = {
    ...raw,
    internal_links: raw.internal_links ?? [],
    related_pages: raw.related_pages ?? [],
    model_used: modelUsed,
    generated_at: new Date().toISOString(),
  };

  const { error: updErr } = await supabase
    .from('growth_actions')
    .update({ brief })
    .eq('id', action.id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ brief });
}
