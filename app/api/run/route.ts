import { NextResponse } from 'next/server';
import { runPipeline } from '../../../src/pipeline.js';
import { LlmProviderError } from '../../../src/llm.js';
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
    let model: string | undefined;
    let weekStart: string | undefined;
    let generationContext: string | undefined;
    // 'current' = week-to-date refresh (the default); 'complete' = an
    // intentionally finished Mon–Sun report.
    let mode: 'complete' | 'current' | undefined;
    if (req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as {
        provider?: string;
        model?: string;
        weekStart?: string;
        generationContext?: string;
        mode?: 'complete' | 'current';
      };
      provider = body.provider;
      model = body.model;
      weekStart = body.weekStart;
      generationContext = body.generationContext;
      mode = body.mode;
    }
    const result = await runPipeline({
      log: (m) => console.log(`[run] ${m}`),
      provider,
      model,
      weekStart,
      generationContext,
      mode,
    });
    return NextResponse.json({
      ok: true,
      week: result.weekStart,
      saved: result.saved,
      summary: result.analysis.summary,
      ledgerWarning: result.ledgerWarning,
    });
  } catch (e) {
    console.error('[run] failed:', e);
    if (e instanceof LlmProviderError) {
      return NextResponse.json(
        { error: e.message, errorType: e.kind, provider: e.provider },
        { status: 422 },
      );
    }
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
