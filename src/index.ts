import { collectMetrics } from './posthog.js';
import { getRecentInsights, insertInsight } from './supabase.js';
import { analyseMetrics } from './analyse.js';
import { sendEmail } from './email.js';

function parseArgs(): { dryRun: boolean; weekStart: string | null } {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const weekArg = args.find((a) => a.startsWith('--week='));
  const weekStart = weekArg ? weekArg.split('=')[1] : null;
  return { dryRun, weekStart };
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getDefaultWeek(): { weekStart: string; weekEnd: string } {
  // Runs on Monday 07:00 UTC. The completed week is Mon–Sun ending yesterday.
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setUTCDate(today.getUTCDate() - 1); // Sunday

  const weekEndDate = yesterday;
  const weekStartDate = new Date(weekEndDate);
  weekStartDate.setUTCDate(weekEndDate.getUTCDate() - 6); // Monday

  return { weekStart: formatDate(weekStartDate), weekEnd: formatDate(weekEndDate) };
}

function getWeekFromArg(weekStartArg: string): { weekStart: string; weekEnd: string } {
  const start = new Date(`${weekStartArg}T00:00:00Z`);
  if (isNaN(start.getTime())) throw new Error(`Invalid --week date: ${weekStartArg}`);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { weekStart: formatDate(start), weekEnd: formatDate(end) };
}

async function main() {
  const { dryRun, weekStart: weekArg } = parseArgs();

  const { weekStart, weekEnd } = weekArg ? getWeekFromArg(weekArg) : getDefaultWeek();

  console.log(`\nLLMnesia insights — ${weekStart} → ${weekEnd}${dryRun ? ' [DRY RUN]' : ''}\n`);

  const [metrics, history] = await Promise.all([
    collectMetrics(weekStart, weekEnd),
    getRecentInsights(6),
  ]);

  if (dryRun) {
    console.log('\n— Metrics snapshot —\n', JSON.stringify(metrics, null, 2));
    console.log('\n— Historical context rows —', history.length);
  }

  const { result: analysis, modelUsed } = await analyseMetrics(metrics, history);

  if (dryRun) {
    console.log('\n— Analysis —\n', JSON.stringify(analysis, null, 2));
    console.log('\nDry run complete. No writes or emails sent.');
    return;
  }

  await insertInsight({
    week_start: weekStart,
    week_end: weekEnd,
    metrics_snapshot: metrics,
    summary: analysis.summary,
    findings: analysis.findings,
    action_items: analysis.action_items,
    open_threads: analysis.open_threads,
    resolved_threads: analysis.resolved_threads,
    model_used: modelUsed,
  });
  console.log('Saved to Supabase.');

  await sendEmail(weekStart, analysis, metrics);

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
