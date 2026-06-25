import { NextResponse, after } from 'next/server';
import { isAuthorized } from '../../../../lib/session';
import { readBrief } from '../../../../src/brief.js';
import { getSiteById } from '../../../../src/gsc.js';
import { getBingDigest } from '../../../../src/bing.js';
import { ensureOpportunities, getSiteScale } from '../../../../src/growth.js';
import {
  generateGrowthPlan,
  getGrowthPlan,
  getPriorPlans,
  saveGrowthPlan,
} from '../../../../src/growth-plan.js';
import { createClient } from '@supabase/supabase-js';
import type { GrowthAction } from '../../../../src/types.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false },
  });
}

/** Lightweight read so the panel can poll for a result that finished in the background. */
export async function GET(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const siteId = url.searchParams.get('site');
  const week = url.searchParams.get('week');
  if (!siteId || !week) {
    return NextResponse.json({ error: 'site and week are required' }, { status: 400 });
  }
  const plan = await getGrowthPlan(siteId, week);
  return NextResponse.json({ plan });
}

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { siteId, weekStart, provider, generationContext } = (await req.json().catch(() => ({}))) as {
    siteId?: string;
    weekStart?: string;
    provider?: string;
    generationContext?: string;
  };
  if (!siteId || !weekStart) {
    return NextResponse.json({ error: 'siteId and weekStart are required' }, { status: 400 });
  }
  const site = await getSiteById(siteId);
  if (!site) return NextResponse.json({ error: `No site ${siteId}` }, { status: 404 });

  // Heavy work runs after the response is sent — survives tab close.
  after(async () => {
    try {
      const supabase = getSupabase();

      // Ensure opportunities exist for the week (compute on demand if missing),
      // pull prior plans + recent actions for continuity, and compute the
      // site-scale digest so the LLM knows whether this is an established or
      // early-stage site.
      const [opportunities, brief, priorPlans, actionsRes, siteScale, bingDigest] = await Promise.all([
        ensureOpportunities({ siteId, weekStart, force: true }),
        readBrief(),
        getPriorPlans(siteId, weekStart, 4),
        supabase
          .from('growth_actions')
          .select('site_id, week_start, action_type, status, target_query, target_page, published_url')
          .eq('site_id', siteId)
          .order('status_updated_at', { ascending: false })
          .limit(40),
        getSiteScale(siteId, weekStart),
        process.env.BING_WEBMASTER_API_KEY
          ? getBingDigest(siteId).catch((e) => {
              console.error('[growth-plan] bing digest failed:', e);
              return null;
            })
          : Promise.resolve(null),
      ]);
      if (actionsRes.error) throw new Error(`growth_actions fetch failed: ${actionsRes.error.message}`);
      const priorActions =
        (actionsRes.data as Pick<GrowthAction, 'site_id' | 'week_start' | 'action_type' | 'status' | 'target_query' | 'target_page' | 'published_url'>[]) ??
        [];

      // Pull the most recent stored GA4 digest for the site if it matches our
      // primary product — for v1 we just pass the latest weekly_insights
      // metrics_snapshot's GA4 website block (the same shape /api/strategy
      // uses) when the site name matches. For other sites we pass null; the
      // prompt tolerates that.
      let ga4Digest: unknown = null;
      if (site.name.toLowerCase() === 'llmnesia') {
        const { data: latest } = await supabase
          .from('weekly_insights')
          .select('metrics_snapshot')
          .order('week_start', { ascending: false })
          .limit(1)
          .maybeSingle();
        const m = (latest as { metrics_snapshot?: { ga4?: unknown } } | null)?.metrics_snapshot;
        ga4Digest = m?.ga4 ?? null;
      }

      const { plan } = await generateGrowthPlan({
        site,
        weekStart,
        brief: site.brief_override?.trim() || brief,
        growthGoal: site.growth_goal,
        opportunities,
        ga4Digest,
        bingDigest,
        siteScale,
        priorPlans,
        priorActions,
        generationContext,
        provider,
      });

      await saveGrowthPlan(siteId, weekStart, plan);
      console.log(`[growth-plan] saved ${site.name} ${weekStart}`);
    } catch (e) {
      console.error('[growth-plan] background generation failed:', e);
    }
  });

  return NextResponse.json({ ok: true, started: true }, { status: 202 });
}
