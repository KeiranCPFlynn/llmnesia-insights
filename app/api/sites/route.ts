import { NextResponse } from 'next/server';
import { isAuthorized } from '../../../lib/session';
import { getEnabledSites } from '../../../lib/growth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lightweight list of enabled sites (id + name) so the client-side "Update all"
 * button can fan a current-week growth-plan refresh out to every site without
 * each page needing to pre-load the site list.
 */
export async function GET(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sites = await getEnabledSites();
  return NextResponse.json({ sites: sites.map((s) => ({ id: s.id, name: s.name })) });
}
