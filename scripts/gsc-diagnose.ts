/**
 * One-off diagnostic for the Growth Planner. Prints the state of the `sites`
 * and `gsc_rows` tables, then probes GSC directly for each site to confirm
 * the OAuth + property strings actually work.
 *
 * Usage:  npx tsx scripts/gsc-diagnose.ts
 */
import '../src/env.js';
import { createClient } from '@supabase/supabase-js';
import { OAuth2Client } from 'google-auth-library';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { auth: { persistSession: false } },
);

async function main() {
  // 1. Sites
  const { data: sites, error: sErr } = await supabase
    .from('sites')
    .select('*')
    .order('created_at', { ascending: true });
  if (sErr) {
    console.error('sites query failed — did §1b SQL run?', sErr.message);
    process.exit(1);
  }
  console.log(`Sites in DB (${sites?.length ?? 0}):`);
  for (const s of sites ?? []) {
    console.log(`  ${s.name}  id=${s.id}  gsc_property="${s.gsc_property}"  enabled=${s.enabled}`);
  }
  console.log();

  // 2. gsc_rows count per site
  for (const s of sites ?? []) {
    const { count, error } = await supabase
      .from('gsc_rows')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', s.id);
    console.log(
      `gsc_rows for ${s.name}: ${error ? `ERR ${error.message}` : `${count ?? 0} rows`}`,
    );
  }
  console.log();

  // 3. Probe GSC directly for each site (last 90 days, top 5 queries by
  //    impressions, no aggregation by date so we see raw demand).
  const oauth = new OAuth2Client({
    clientId: process.env.GSC_OAUTH_CLIENT_ID!,
    clientSecret: process.env.GSC_OAUTH_CLIENT_SECRET!,
  });
  oauth.setCredentials({ refresh_token: process.env.GSC_OAUTH_REFRESH_TOKEN! });

  // What properties does the OAuth user actually have access to? Useful for
  // catching property-string mismatches.
  try {
    const { data } = await oauth.request<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>({
      method: 'GET',
      url: 'https://www.googleapis.com/webmasters/v3/sites',
    });
    console.log('GSC properties this OAuth account can see:');
    for (const e of data.siteEntry ?? []) {
      console.log(`  "${e.siteUrl}"  (${e.permissionLevel})`);
    }
    console.log();
  } catch (e) {
    console.error('Could not list GSC sites:', (e as Error).message);
  }

  const today = new Date();
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 89);
  const isoDate = (d: Date) => d.toISOString().slice(0, 10);

  for (const s of sites ?? []) {
    console.log(`Probing GSC for ${s.name} → "${s.gsc_property}" (${isoDate(start)} → ${isoDate(end)})`);
    try {
      const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(s.gsc_property)}/searchAnalytics/query`;
      const { data } = await oauth.request<{ rows?: { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }[] }>({
        method: 'POST',
        url,
        data: {
          startDate: isoDate(start),
          endDate: isoDate(end),
          dimensions: ['query'],
          rowLimit: 5,
        },
      });
      const rows = data.rows ?? [];
      console.log(`  ${rows.length} top queries returned`);
      for (const r of rows) {
        console.log(
          `    "${r.keys?.[0]}"  ${r.impressions} imp / ${r.clicks} clk / pos ${(r.position ?? 0).toFixed(1)}`,
        );
      }
    } catch (e) {
      console.error(`  GSC call failed: ${(e as Error).message}`);
    }
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
