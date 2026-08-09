import '../src/env.js';
import { randomUUID } from 'node:crypto';
import { createInitialLedgerState } from '../src/ledger.js';
import { getLatestInsight, getStrategyLedger, upsertStrategyLedger } from '../src/supabase.js';
import type { MetricsSnapshot } from '../src/types.js';

function baselineFromSnapshot(snapshot: MetricsSnapshot) {
  return {
    installs: snapshot.installs?.total ?? 0,
    activation_rate: snapshot.activation?.rate ?? 0,
    retention_w1: snapshot.retention?.w1_rolling?.rate ?? 0,
    retention_w4: snapshot.retention?.w4_rolling?.rate ?? 0,
    wau: snapshot.engagement?.wau ?? 0,
    searches_per_wau: snapshot.engagement?.searches_per_wau ?? 0,
    click_rate: snapshot.search_quality?.click_rate ?? 0,
    zero_result_rate: snapshot.search_quality?.zero_result_rate ?? 0,
    email_capture_rate: snapshot.email_capture?.rate ?? 0,
    week_start: snapshot.week_start,
  };
}

async function main() {
  const existing = await getStrategyLedger();
  if (existing) {
    console.log(`Strategy ledger already exists (version ${existing.version}); nothing changed.`);
    return;
  }

  const insight = await getLatestInsight();
  if (!insight) throw new Error('No weekly_insights rows exist yet. Run the pipeline before seeding the ledger.');

  const state = createInitialLedgerState();
  state.metrics_baseline = baselineFromSnapshot(insight.metrics_snapshot);
  if (insight.strategy) {
    state.north_star = insight.strategy.thesis || state.north_star;
    state.monetization_design = {
      ...state.monetization_design,
      ...insight.strategy.monetization,
    };
  }
  for (const decision of insight.strategy_decisions ?? []) {
    if (!decision.title || !['accepted', 'shipped'].includes(decision.status)) continue;
    state.active_initiatives.push({
      id: randomUUID(),
      title: decision.title,
      area: 'app',
      // Ledger initiatives use the narrower status set; shipped maps directly,
      // while accepted work awaits implementation.
      status: decision.status === 'shipped' ? 'shipped' : 'accepted',
      expected_outcome: decision.outcome || decision.note || 'Outcome not recorded in the legacy decision log.',
      metrics_to_watch: [],
      started: decision.decided_at,
    });
  }

  await upsertStrategyLedger(state, `seed:${insight.model_used}`);
  console.log(`Seeded strategy ledger from ${insight.week_start} (version ${state.version}).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
