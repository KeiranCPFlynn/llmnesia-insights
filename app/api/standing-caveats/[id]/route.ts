import { NextResponse } from 'next/server';
import {
  deleteStandingCaveat,
  updateStandingCaveat,
} from '../../../../src/supabase.js';
import { reanalyseWeek } from '../../../../src/pipeline.js';
import { isAuthorized } from '../../../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Edit a standing caveat's text, or retire/re-activate it via `active`. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const { kind, affected_metric, note, active, applyWeek, provider } = (await req
    .json()
    .catch(() => ({}))) as {
    kind?: 'caveat' | 'context';
    affected_metric?: string;
    note?: string;
    active?: boolean;
    applyWeek?: string;
    provider?: string;
  };

  try {
    await updateStandingCaveat(id, {
      ...(kind ? { kind } : {}),
      ...(affected_metric != null ? { affected_metric: affected_metric.trim() } : {}),
      ...(note != null ? { note: note.trim() } : {}),
      ...(active != null ? { active } : {}),
    });
    const analysis = applyWeek ? await reanalyseWeek(applyWeek, provider) : null;
    return NextResponse.json({ ok: true, analysis });
  } catch (e) {
    console.error('[standing-caveats] update failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to update standing caveat' },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const applyWeek = searchParams.get('applyWeek');
  const provider = searchParams.get('provider') ?? undefined;

  try {
    await deleteStandingCaveat(id);
    const analysis = applyWeek ? await reanalyseWeek(applyWeek, provider) : null;
    return NextResponse.json({ ok: true, analysis });
  } catch (e) {
    console.error('[standing-caveats] delete failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to delete standing caveat' },
      { status: 500 },
    );
  }
}
