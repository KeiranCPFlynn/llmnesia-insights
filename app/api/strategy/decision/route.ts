import { NextResponse } from 'next/server';
import { setStrategyDecision } from '../../../../src/supabase.js';
import type { StrategyDecision } from '../../../../src/types.js';
import { isAuthorized } from '../../../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES: StrategyDecision['status'][] = [
  'accepted',
  'deferred',
  'rejected',
  'shipped',
];

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { week, recommendation_id, status, note, outcome } = (await req
    .json()
    .catch(() => ({}))) as {
    week?: string;
    recommendation_id?: string;
    status?: StrategyDecision['status'];
    note?: string;
    outcome?: string;
  };

  if (!week || !recommendation_id || !status || !STATUSES.includes(status)) {
    return NextResponse.json(
      { error: 'week, recommendation_id and a valid status are required' },
      { status: 400 },
    );
  }

  try {
    const decision: StrategyDecision = {
      recommendation_id,
      status,
      note: note || undefined,
      outcome: outcome || undefined,
      decided_at: new Date().toISOString(),
    };
    const decisions = await setStrategyDecision(week, decision);
    return NextResponse.json({ ok: true, decisions });
  } catch (e) {
    console.error('[strategy/decision] failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to save decision' },
      { status: 500 },
    );
  }
}
