import { NextResponse } from 'next/server';
import {
  getLatestEvidenceDelta,
  getRecentContextSources,
  getRecentLedgerEntries,
  getStrategyLedger,
} from '../../../src/supabase.js';
import { isAuthorized } from '../../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Read-only API for the living ledger and its auditable supporting evidence. */
export async function GET(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [ledger, entries, evidence, context] = await Promise.all([
      getStrategyLedger(),
      getRecentLedgerEntries(),
      getLatestEvidenceDelta(),
      getRecentContextSources(),
    ]);
    return NextResponse.json({ ledger, entries, evidence, context });
  } catch (error) {
    console.error('[ledger] read failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load ledger' },
      { status: 500 },
    );
  }
}
