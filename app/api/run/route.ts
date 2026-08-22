import { NextResponse } from 'next/server';
import { collectEvidence } from '../../../src/evidence.js';
import { isAuthorized } from '../../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function run(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    let weekStart: string | undefined;
    if (req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as { weekStart?: string };
      weekStart = body.weekStart;
    }
    const result = await collectEvidence({
      log: (message) => console.log(`[evidence] ${message}`),
      weekStart,
    });
    return NextResponse.json({
      ok: true,
      week: result.weekStart,
      saved: result.saved,
      dataAsOf: result.dataAsOf,
      message: 'Evidence collected. No strategy review was generated.',
    });
  } catch (e) {
    console.error('[evidence] failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Evidence collection failed' },
      { status: 500 },
    );
  }
}

// Vercel Cron triggers a GET with the CRON_SECRET bearer token.
export const GET = run;
// Legacy-compatible manual evidence trigger. The dashboard does not expose it.
export const POST = run;
