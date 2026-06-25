import { NextResponse, after } from 'next/server';
import { isAuthorized } from '../../../../lib/session';
import {
  autoSyncRange as gscAutoSyncRange,
  deltaRange as gscDeltaRange,
  fullBackfillRange as gscFullBackfillRange,
  getSiteById,
  getSites,
  syncSite as gscSyncSite,
} from '../../../../src/gsc.js';
import {
  autoSyncRange as bingAutoSyncRange,
  deltaRange as bingDeltaRange,
  fullBackfillRange as bingFullBackfillRange,
  syncSite as bingSyncSite,
} from '../../../../src/bing.js';
import type { Site } from '../../../../src/types.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const hasBing = !!process.env.BING_WEBMASTER_API_KEY;

type GscRange = Awaited<ReturnType<typeof gscAutoSyncRange>>;
type BingRange = Awaited<ReturnType<typeof bingAutoSyncRange>>;

async function runBingSync(
  site: Site,
  range: { startDate: string; endDate: string },
): Promise<number> {
  if (!hasBing) return 0;
  return bingSyncSite(site, range, (m) => console.log(`[bing-sync] ${m}`));
}

/**
 * Manual GSC + Bing Webmaster Tools sync.
 *
 * POST { siteId?: string, mode?: 'auto'|'backfill'|'delta' }
 *   - siteId omitted ⇒ sync every enabled site
 *   - mode 'auto' (default) ⇒ backfill if no rows yet, otherwise catch up
 *   - mode 'delta' ⇒ refresh the visible 90-day window through yesterday
 *   - mode 'backfill' ⇒ always re-pull the full 90-day history
 *
 * Bing sync runs alongside GSC when BING_WEBMASTER_API_KEY is set.
 * Backfills return 202 immediately and continue in `after()`. Delta syncs
 * run in the request and return concrete row counts.
 */
export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { siteId, mode } = (await req.json().catch(() => ({}))) as {
    siteId?: string;
    mode?: 'auto' | 'backfill' | 'delta';
  };

  const sites = siteId
    ? [await getSiteById(siteId)].filter((s): s is NonNullable<typeof s> => !!s)
    : await getSites();
  if (sites.length === 0) {
    return NextResponse.json({ error: 'No sites configured' }, { status: 404 });
  }

  if (mode !== 'backfill') {
    const planned: { site: Site; gscRange: GscRange; bingRange: BingRange }[] = [];
    for (const site of sites) {
      const gscRange =
        mode === 'delta'
          ? { ...gscDeltaRange(), mode: 'delta' as const }
          : await gscAutoSyncRange(site.id);
      const bingRange =
        mode === 'delta'
          ? { ...bingDeltaRange(), mode: 'delta' as const }
          : await bingAutoSyncRange(site.id);
      planned.push({ site, gscRange, bingRange });
    }

    // If every source is already in delta mode, run synchronously and return
    // concrete counts so the toolbar knows sync is done without polling.
    if (planned.every((p) => p.gscRange.mode === 'delta')) {
      const results = [];
      for (const { site, gscRange, bingRange } of planned) {
        const gscRows = await gscSyncSite(site, gscRange, (m) =>
          console.log(`[gsc-sync] ${m}`),
        );
        let bingRows = 0;
        try {
          bingRows = await runBingSync(site, bingRange);
        } catch (e) {
          console.error(`[bing-sync] ${site.name} failed:`, e);
        }
        results.push({ site: site.name, gsc: gscRows, bing: bingRows, range: gscRange });
      }
      return NextResponse.json(
        { ok: true, completed: true, sites: sites.map((s) => s.name), results },
        { status: 200 },
      );
    }

    // At least one source needs a backfill — run in the background.
    after(async () => {
      for (const { site, gscRange, bingRange } of planned) {
        try {
          await Promise.all([
            gscSyncSite(site, gscRange, (m) => console.log(`[gsc-sync] ${m}`)),
            runBingSync(site, bingRange),
          ]);
        } catch (e) {
          console.error(`[sync] ${site.name} failed:`, e);
        }
      }
      console.log('[sync] all sites done');
    });
    return NextResponse.json(
      { ok: true, started: true, sites: sites.map((s) => s.name) },
      { status: 202 },
    );
  }

  // Explicit backfill mode — always re-pull the full 90-day history.
  after(async () => {
    for (const site of sites) {
      try {
        await Promise.all([
          gscSyncSite(site, gscFullBackfillRange(), (m) => console.log(`[gsc-sync] ${m}`)),
          runBingSync(site, bingFullBackfillRange()),
        ]);
      } catch (e) {
        console.error(`[sync] ${site.name} failed:`, e);
      }
    }
    console.log('[sync] all sites done');
  });

  return NextResponse.json(
    { ok: true, started: true, sites: sites.map((s) => s.name) },
    { status: 202 },
  );
}
