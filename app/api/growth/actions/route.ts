import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { isAuthorized } from '../../../../lib/session';
import type { GrowthAction, GrowthActionStatus, GrowthActionType } from '../../../../src/types.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATUSES: GrowthActionStatus[] = [
  'idea',
  'planned',
  'briefed',
  'drafted',
  'actioned',
  'published',
  'updated',
  'needs_adjustment',
  'ignored',
  'completed',
  'monitoring',
];

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false },
  });
}

/**
 * POST — accept a recommendation (or create a free-form action).
 *
 * Body: { siteId, weekStart, actionType, recommendationId?, opportunityId?,
 *         targetQuery?, targetPage?, suggestedTitle?, status?='planned',
 *         note? }
 *
 * recommendationId is used as a soft idempotency key — accepting the same
 * recommendation twice replaces the existing action rather than creating a
 * duplicate row. (Status, note, etc. can still be updated via PATCH.)
 */
export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Partial<
    Omit<GrowthAction, 'id' | 'status_updated_at' | 'created_at'> & {
      siteId: string;
      weekStart: string;
      recommendationId?: string;
      opportunityId?: string;
      actionType: GrowthActionType;
      targetQuery?: string;
      targetPage?: string;
      suggestedTitle?: string;
    }
  >;

  const siteId = body.siteId;
  const weekStart = body.weekStart;
  const actionType = body.actionType;
  if (!siteId || !weekStart || !actionType) {
    return NextResponse.json(
      { error: 'siteId, weekStart and actionType are required' },
      { status: 400 },
    );
  }

  const supabase = getSupabase();

  // Idempotency: if this action was already accepted for the same
  // recommendation, return the existing row rather than inserting a duplicate.
  if (body.recommendationId) {
    const { data: existing } = await supabase
      .from('growth_actions')
      .select('*')
      .eq('recommendation_id', body.recommendationId)
      .maybeSingle();
    if (existing) return NextResponse.json({ action: existing });
  }

  const row: GrowthAction = {
    id: randomUUID(),
    site_id: siteId,
    week_start: weekStart,
    recommendation_id: body.recommendationId ?? null,
    opportunity_id: body.opportunityId ?? null,
    action_type: actionType,
    target_query: body.targetQuery ?? null,
    target_page: body.targetPage ?? null,
    suggested_title: body.suggestedTitle ?? null,
    brief: null,
    status: (body.status as GrowthActionStatus) ?? 'planned',
    status_updated_at: new Date().toISOString(),
    published_url: null,
    follow_up_date: null,
    note: body.note ?? null,
  };

  const { error } = await supabase.from('growth_actions').insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ action: row });
}

/**
 * PATCH — update status / published_url / note / follow_up_date on an action.
 * Body: { id, status?, publishedUrl?, note?, followUpDate? }
 */
export async function PATCH(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
    publishedUrl?: string | null;
    note?: string | null;
    followUpDate?: string | null;
  };
  if (!body.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }
  if (body.status && !VALID_STATUSES.includes(body.status as GrowthActionStatus)) {
    return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.status) {
    patch.status = body.status;
    patch.status_updated_at = new Date().toISOString();
  }
  if (body.publishedUrl !== undefined) patch.published_url = body.publishedUrl;
  if (body.note !== undefined) patch.note = body.note;
  if (body.followUpDate !== undefined) patch.follow_up_date = body.followUpDate;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('growth_actions')
    .update(patch)
    .eq('id', body.id)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ action: data });
}
