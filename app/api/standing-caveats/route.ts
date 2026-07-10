import { NextResponse } from 'next/server';
import {
  addStandingCaveat,
  getStandingCaveats,
} from '../../../src/supabase.js';
import { reanalyseWeek } from '../../../src/pipeline.js';
import { isAuthorized } from '../../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** List all standing caveats (active + retired) for the management panel. */
export async function GET(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const caveats = await getStandingCaveats(false);
    return NextResponse.json({ caveats });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load standing caveats' },
      { status: 500 },
    );
  }
}

/**
 * Add a persistent caveat/context note. Optionally re-run one week's analysis
 * immediately (`applyWeek`) so the change is reflected without waiting for the
 * next weekly run.
 */
export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { kind, affected_metric, note, applyWeek, provider } = (await req
    .json()
    .catch(() => ({}))) as {
    kind?: 'caveat' | 'context';
    affected_metric?: string;
    note?: string;
    applyWeek?: string;
    provider?: string;
  };
  if (!affected_metric?.trim() || !note?.trim()) {
    return NextResponse.json(
      { error: 'affected_metric and note are required' },
      { status: 400 },
    );
  }

  try {
    const caveat = await addStandingCaveat({
      kind: kind === 'context' ? 'context' : 'caveat',
      affected_metric: affected_metric.trim(),
      note: note.trim(),
    });
    const analysis = applyWeek ? await reanalyseWeek(applyWeek, provider) : null;
    return NextResponse.json({ ok: true, caveat, analysis });
  } catch (e) {
    console.error('[standing-caveats] add failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to add standing caveat' },
      { status: 500 },
    );
  }
}
