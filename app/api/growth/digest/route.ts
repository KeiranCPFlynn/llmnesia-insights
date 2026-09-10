import { NextResponse } from 'next/server';
import { isAuthorized } from '../../../../lib/session';
import { getGscDigest } from '../../../../lib/growth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Heavy 90-day chart data is requested only when the founder opens it. */
export async function GET(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get('siteId');
  const weekStart = searchParams.get('weekStart');
  if (!siteId || !weekStart) {
    return NextResponse.json({ error: 'siteId and weekStart are required' }, { status: 400 });
  }
  try {
    return NextResponse.json({ digest: await getGscDigest(siteId, weekStart) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load search performance' },
      { status: 500 },
    );
  }
}
