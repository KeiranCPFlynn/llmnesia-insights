import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAuthorized } from '../../../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false },
  });
}

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { siteId, growthGoal } = (await req.json().catch(() => ({}))) as {
    siteId?: string;
    growthGoal?: string;
  };
  if (!siteId) {
    return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
  }

  const value = growthGoal?.trim() || null;
  if (value && value.length > 2000) {
    return NextResponse.json({ error: 'growthGoal must be 2000 characters or fewer' }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('sites')
    .update({ growth_goal: value })
    .eq('id', siteId)
    .select('*')
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Failed to save growth goal: ${error.message}` },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: `No site ${siteId}` }, { status: 404 });
  }

  return NextResponse.json({ ok: true, site: data });
}
