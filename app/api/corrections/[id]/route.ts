import { NextResponse } from 'next/server';
import { deleteCorrection, updateCorrection } from '../../../../src/supabase.js';
import { reanalyseWeek } from '../../../../src/pipeline.js';
import { isAuthorized } from '../../../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Edit a single per-week correction (its label/note/kind). Corrections live in
 * the week row's `corrections` jsonb, so `week` identifies which report. Pass
 * `applyWeek` to regenerate that week's analysis from the edited caveats.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const { week, kind, affected_metric, note, applyWeek, provider } = (await req
    .json()
    .catch(() => ({}))) as {
    week?: string;
    kind?: 'caveat' | 'context';
    affected_metric?: string;
    note?: string;
    applyWeek?: string;
    provider?: string;
  };
  if (!week) {
    return NextResponse.json({ error: 'week is required' }, { status: 400 });
  }

  try {
    const corrections = await updateCorrection(week, id, {
      ...(kind ? { kind } : {}),
      ...(affected_metric != null ? { affected_metric: affected_metric.trim() } : {}),
      ...(note != null ? { note: note.trim() } : {}),
    });
    const analysis = applyWeek ? await reanalyseWeek(applyWeek, provider) : null;
    return NextResponse.json({ ok: true, corrections, analysis });
  } catch (e) {
    console.error('[corrections] update failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to update correction' },
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
  const week = searchParams.get('week');
  const applyWeek = searchParams.get('applyWeek');
  const provider = searchParams.get('provider') ?? undefined;
  if (!week) {
    return NextResponse.json({ error: 'week is required' }, { status: 400 });
  }

  try {
    const corrections = await deleteCorrection(week, id);
    const analysis = applyWeek ? await reanalyseWeek(applyWeek, provider) : null;
    return NextResponse.json({ ok: true, corrections, analysis });
  } catch (e) {
    console.error('[corrections] delete failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to delete correction' },
      { status: 500 },
    );
  }
}
