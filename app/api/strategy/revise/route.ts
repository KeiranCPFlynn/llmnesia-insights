import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { applyStrategyRevision } from '../../../../src/supabase.js';
import type { StrategyRecommendation } from '../../../../src/types.js';
import { isAuthorized } from '../../../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { week, replaces_id, recommendation } = (await req.json().catch(() => ({}))) as {
    week?: string;
    replaces_id?: string;
    recommendation?: Omit<StrategyRecommendation, 'id'>;
  };
  if (!week || !recommendation) {
    return NextResponse.json(
      { error: 'week and recommendation are required' },
      { status: 400 },
    );
  }

  try {
    const rec: StrategyRecommendation = {
      ...recommendation,
      // Reuse the replaced id so decisions stay attached; else mint a new one.
      id: replaces_id || randomUUID(),
    };
    const strategy = await applyStrategyRevision(week, rec, replaces_id);
    return NextResponse.json({ ok: true, strategy });
  } catch (e) {
    console.error('[strategy/revise] failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to apply revision' },
      { status: 500 },
    );
  }
}
