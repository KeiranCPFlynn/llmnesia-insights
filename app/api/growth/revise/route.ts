import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { isAuthorized } from '../../../../lib/session';
import { applyGrowthPlanRevision } from '../../../../src/growth-plan.js';
import type { GrowthRecommendation } from '../../../../src/types.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { siteId, weekStart, replaces_id, recommendation } = (await req
    .json()
    .catch(() => ({}))) as {
    siteId?: string;
    weekStart?: string;
    replaces_id?: string;
    recommendation?: Omit<GrowthRecommendation, 'id'>;
  };
  if (!siteId || !weekStart || !recommendation) {
    return NextResponse.json(
      { error: 'siteId, weekStart and recommendation are required' },
      { status: 400 },
    );
  }

  try {
    const rec: GrowthRecommendation = {
      ...recommendation,
      id: replaces_id || randomUUID(),
    };
    const plan = await applyGrowthPlanRevision(siteId, weekStart, rec, replaces_id);
    return NextResponse.json({ ok: true, plan });
  } catch (e) {
    console.error('[growth/revise] failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to apply growth recommendation' },
      { status: 500 },
    );
  }
}
