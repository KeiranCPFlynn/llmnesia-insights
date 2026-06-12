import { NextResponse, after } from 'next/server';
import {
  getInsightByWeek,
  getStrategyHistoryBefore,
  saveStrategy,
} from '../../../src/supabase.js';
import { generateStrategy } from '../../../src/strategy.js';
import { readBrief } from '../../../src/brief.js';
import { topChannel } from '../../../lib/dashboard';
import type { MetricsSnapshot } from '../../../src/types.js';
import { isAuthorized } from '../../../lib/session';

/**
 * A compact funnel digest — ~15 numbers — instead of the full metrics_snapshot
 * (which carries large GA4 geo/device/page maps the PM doesn't need). The
 * qualitative read already comes from the analysis; this is just quantitative
 * grounding, and keeps GPT-5.5 input cost down.
 */
function metricsDigest(m: MetricsSnapshot) {
  const r2 = (n?: number) => (n == null ? null : Math.round(n * 1000) / 10); // rate → %
  const w = m.ga4?.website;
  const tc = topChannel(w);
  return {
    installs: m.installs?.total ?? 0,
    activation_pct: r2(m.activation?.rate),
    wau: m.engagement?.wau ?? 0,
    searches_per_wau: m.engagement?.searches_per_wau ?? 0,
    w1_retention_pct: r2(m.retention?.w1_rolling?.rate),
    w4_retention_pct: r2(m.retention?.w4_rolling?.rate),
    click_pct: r2(m.search_quality?.click_rate),
    zero_result_pct: r2(m.search_quality?.zero_result_rate),
    email_capture_pct: r2(m.email_capture?.rate),
    website_visitors: w?.users?.total ?? 0,
    website_new_visitors: w?.users?.new_users ?? 0,
    website_sessions: w?.sessions ?? 0,
    top_channel: tc ? tc.name : null,
    store_listing_sessions: m.ga4?.extension?.sessions ?? null,
  };
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Lightweight read so the panel can poll for a result that finished in the
// background (the POST keeps running server-side even if the user navigates
// away — the generation is NOT tied to the client request's lifetime).
export async function GET(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const week = new URL(req.url).searchParams.get('week');
  if (!week) return NextResponse.json({ error: 'week is required' }, { status: 400 });
  const insight = await getInsightByWeek(week);
  if (!insight) return NextResponse.json({ error: `No report for ${week}` }, { status: 404 });
  return NextResponse.json({
    strategy: insight.strategy ?? null,
    decisions: insight.strategy_decisions ?? [],
  });
}

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { week, provider, generationContext, strategyGoal } = (await req
    .json()
    .catch(() => ({}))) as {
    week?: string;
    provider?: string;
    generationContext?: string;
    strategyGoal?: string;
  };
  if (!week) {
    return NextResponse.json({ error: 'week is required' }, { status: 400 });
  }

  // Fail fast on a missing week so the user gets immediate feedback…
  const insight = await getInsightByWeek(week);
  if (!insight) return NextResponse.json({ error: `No report for ${week}` }, { status: 404 });

  // …then run the expensive generation AFTER the response is sent. `after()`
  // is owned by the server/platform, so it completes (and saves to Supabase)
  // regardless of the client — closing the tab, navigating or reloading does
  // not stop it. The client polls GET until the row has it.
  after(async () => {
    try {
      // 4 weeks of strategy continuity is plenty; more just re-bills tokens.
      const [brief, priorRows] = await Promise.all([
        readBrief(),
        getStrategyHistoryBefore(week, 4),
      ]);

      const priorStrategies = priorRows
        .filter((r) => r.strategy)
        .map((r) => ({ week_start: r.week_start, thesis: r.strategy!.thesis }));
      const priorDecisions = [
        ...priorRows.map((r) => ({
          week_start: r.week_start,
          decisions: r.strategy_decisions ?? [],
        })),
        { week_start: week, decisions: insight.strategy_decisions ?? [] },
      ].filter((d) => d.decisions.length > 0);

      const { result } = await generateStrategy({
        weekStart: insight.week_start,
        weekEnd: insight.week_end,
        brief,
        analysis: {
          headline: insight.headline,
          summary: insight.summary,
          findings: insight.findings,
          action_items: insight.action_items,
          open_threads: insight.open_threads,
        },
        metrics: metricsDigest(insight.metrics_snapshot),
        corrections: insight.corrections ?? [],
        strategyGoal: strategyGoal?.trim() || insight.strategy_goal,
        priorStrategies,
        priorDecisions,
        strategyChat: insight.strategy_chat ?? [],
        generationContext,
        provider,
      });

      await saveStrategy(week, result);
      console.log(`[strategy] saved for ${week}`);
    } catch (e) {
      console.error('[strategy] background generation failed:', e);
    }
  });

  return NextResponse.json({ ok: true, started: true }, { status: 202 });
}
