/**
 * Force a recompute of opportunities for each enabled site for the current
 * planning week, and print the result. Useful for tuning detector thresholds
 * and confirming the right signals surface.
 *
 *   npx tsx scripts/growth-debug.ts
 */
import '../src/env.js';
import { createClient } from '@supabase/supabase-js';
import { computeOpportunities, detectionWindow, getSiteScale, summariseSiteScale } from '../src/growth.js';
import type { GSCRow, Site } from '../src/types.js';

function getCurrentWeekStart(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const offset = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - offset);
  return monday.toISOString().slice(0, 10);
}

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: sites, error } = await supabase
    .from('sites')
    .select('*')
    .eq('enabled', true);
  if (error) throw new Error(error.message);

  const week = getCurrentWeekStart();
  const { current, prior, asOf } = detectionWindow();
  console.log(`Planning week: ${week}`);
  console.log(`Current window: ${current.startDate} → ${current.endDate}  (as_of ${asOf})`);
  console.log(`Prior window:   ${prior.startDate} → ${prior.endDate}\n`);

  for (const site of (sites as Site[]) ?? []) {
    console.log(`══ ${site.name} ══ (${site.gsc_property})`);
    const scale = await getSiteScale(site);
    console.log(`Scale: ${JSON.stringify(scale)}`);

    const opps = await computeOpportunities({ siteId: site.id, weekStart: week });
    console.log(`Opportunities detected: ${opps.length}`);
    for (const o of opps) {
      const target = o.target_query ? `"${o.target_query}"` : o.target_page;
      console.log(
        `  [${o.type}] score=${o.score}  ${target}  imp=${o.evidence.impressions} clk=${o.evidence.clicks} pos=${o.evidence.position.toFixed(1)}`,
      );
    }
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
