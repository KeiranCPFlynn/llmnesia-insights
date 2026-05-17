import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { addCorrection, addRevision, getInsightByWeek, saveChat } from '../../../src/supabase.js';
import { reanalyseWeek } from '../../../src/pipeline.js';
import type { ChatMessage, Correction, Revision } from '../../../src/types.js';
import { isAuthorized } from '../../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { week, kind, affected_metric, note, provider } = (await req
    .json()
    .catch(() => ({}))) as {
    week?: string;
    kind?: 'caveat' | 'context';
    affected_metric?: string;
    note?: string;
    provider?: string;
  };
  if (!week || !affected_metric || !note) {
    return NextResponse.json(
      { error: 'week, affected_metric and note are required' },
      { status: 400 },
    );
  }

  try {
    const row = await getInsightByWeek(week);
    if (!row) return NextResponse.json({ error: `No report for ${week}` }, { status: 404 });

    const chat = row.chat ?? [];
    const lastUser = [...chat].reverse().find((m) => m.role === 'user');

    const correction: Correction = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      kind: kind === 'context' ? 'context' : 'caveat',
      affected_metric,
      note,
      // Audit link back to the conversation that produced this.
      chat_index: chat.length,
      source_excerpt: lastUser?.content.slice(0, 280),
    };

    // Snapshot the report exactly as it stands BEFORE this correction rewrites
    // it, so the pre-change analysis is preserved (append-only history).
    const revision: Revision = {
      revised_at: correction.created_at,
      correction_id: correction.id,
      model_used: row.model_used,
      headline: row.headline,
      summary: row.summary,
      findings: row.findings,
      action_items: row.action_items,
      open_threads: row.open_threads,
      resolved_threads: row.resolved_threads,
    };
    await addRevision(week, revision);

    const corrections = await addCorrection(week, correction);
    // Regenerate from the stored snapshot, now with this caveat/context.
    const analysis = await reanalyseWeek(week, provider);

    // Persist the acceptance into the transcript so the record itself shows
    // what was approved, when, and that it changed the report.
    const acceptance: ChatMessage = {
      role: 'assistant',
      content:
        `✅ **Accepted ${correction.kind}** — *${affected_metric}* ` +
        `(ref \`${correction.id.slice(0, 8)}\`). The report was regenerated with this applied; ` +
        `the previous version is kept in the revision history.`,
      ts: correction.created_at,
    };
    const updatedChat = [...chat, acceptance];
    await saveChat(week, updatedChat);

    return NextResponse.json({ ok: true, corrections, analysis, chat: updatedChat });
  } catch (e) {
    console.error('[corrections] failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to save correction' },
      { status: 500 },
    );
  }
}
