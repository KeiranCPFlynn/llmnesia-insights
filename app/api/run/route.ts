import { NextResponse } from 'next/server';
import { runPipeline } from '../../../src/pipeline.js';
import { isAuthorized } from '../../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function run(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    // The "Run analysis now" button POSTs a provider; the Vercel Cron GET has
    // no body and falls back to the LLM_PROVIDER env default.
    let provider: string | undefined;
    let weekStart: string | undefined;
    if (req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as {
        provider?: string;
        weekStart?: string;
      };
      provider = body.provider;
      weekStart = body.weekStart;
    }
    const result = await runPipeline({
      log: (m) => console.log(`[run] ${m}`),
      provider,
      weekStart,
    });
    return NextResponse.json({
      ok: true,
      week: result.weekStart,
      saved: result.saved,
      summary: result.analysis.summary,
    });
  } catch (e) {
    console.error('[run] failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Pipeline failed' },
      { status: 500 },
    );
  }
}

// Vercel Cron triggers a GET with the CRON_SECRET bearer token.
export const GET = run;
// "Run analysis now" button.
export const POST = run;
