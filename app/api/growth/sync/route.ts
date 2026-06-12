import { NextResponse, after } from 'next/server';
import { isAuthorized } from '../../../../lib/session';
import {
  autoSyncRange,
  deltaRange,
  fullBackfillRange,
  getSiteById,
  getSites,
  syncSite,
} from '../../../../src/gsc.js';
import type { Site } from '../../../../src/types.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type SyncRange = Awaited<ReturnType<typeof autoSyncRange>>;

/**
 * Manual GSC sync.
 *
 * POST { siteId?: string, mode?: 'auto'|'backfill'|'delta' }
 *   - siteId omitted ⇒ sync every enabled site
 *   - mode 'auto' (default) ⇒ backfill if no rows yet, otherwise catch up
 *   - mode 'delta' ⇒ refresh the visible 90-day graph window through yesterday
 *
 * Backfills return 202 immediately and continue in `after()`. Catch-up syncs
 * run in the request and return a concrete row count, so the toolbar does not
 * need to infer completion from polling unchanged rows.
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
    const planned: { site: Site; range: SyncRange }[] = [];
    for (const site of sites) {
      const range =
        mode === 'delta'
          ? { ...deltaRange(), mode: 'delta' as const }
          : await autoSyncRange(site.id);
      planned.push({ site, range });
    }

    if (planned.every((p) => p.range.mode === 'delta')) {
      const results = [];
      for (const { site, range } of planned) {
        const rows = await syncSite(site, range, (m) => console.log(`[gsc-sync] ${m}`));
        results.push({ site: site.name, rows, range });
      }
      return NextResponse.json(
        {
          ok: true,
          completed: true,
          sites: sites.map((s) => s.name),
          results,
        },
        { status: 200 },
      );
    }

    after(async () => {
      for (const { site, range } of planned) {
        try {
          await syncSite(site, range, (m) => console.log(`[gsc-sync] ${m}`));
        } catch (e) {
          console.error(`[gsc-sync] ${site.name} failed:`, e);
        }
      }
      console.log('[gsc-sync] all sites done');
    });
    return NextResponse.json(
      { ok: true, started: true, sites: sites.map((s) => s.name) },
      { status: 202 },
    );
  }

  after(async () => {
    for (const site of sites) {
      try {
        const range = fullBackfillRange();
        await syncSite(site, range, (m) => console.log(`[gsc-sync] ${m}`));
      } catch (e) {
        console.error(`[gsc-sync] ${site.name} failed:`, e);
      }
    }
    console.log('[gsc-sync] all sites done');
  });

  return NextResponse.json(
    { ok: true, started: true, sites: sites.map((s) => s.name) },
    { status: 202 },
  );
}
