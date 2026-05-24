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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Manual GSC sync.
 *
 * POST { siteId?: string, mode?: 'auto'|'backfill'|'delta' }
 *   - siteId omitted ⇒ sync every enabled site
 *   - mode 'auto' (default) ⇒ backfill if no rows yet, otherwise 1-day delta
 *
 * Returns 202 immediately; the actual sync runs in `after()` so the dashboard
 * can show a "syncing…" state without holding an HTTP connection open for
 * 16 months of backfill.
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

  after(async () => {
    for (const site of sites) {
      try {
        const range =
          mode === 'backfill'
            ? fullBackfillRange()
            : mode === 'delta'
              ? deltaRange(1)
              : await autoSyncRange(site.id);
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
