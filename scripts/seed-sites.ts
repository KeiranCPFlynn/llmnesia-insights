/**
 * Seed the `sites` row the Growth Planner needs (fresh database with no
 * Supabase import to load). Idempotent: only inserts when the gsc_property
 * is missing, so it is safe to re-run.
 *
 *   npx tsx scripts/seed-sites.ts
 */
import '../src/env.js';
import { getClient } from '../src/db/query.js';

const SITES = [
  {
    name: 'LLMnesia',
    root_url: 'https://llmnesia.com',
    // The gsc_property string MUST match exactly what Search Console shows
    // (top-left dropdown): sc-domain:… for a Domain property, https://…/ for
    // a URL-prefix property.
    gsc_property: 'sc-domain:llmnesia.com',
    sitemap_url: 'https://llmnesia.com/sitemap.xml',
    repo: 'llmnesia-site njs',
  },
];

async function main() {
  const db = getClient();
  for (const site of SITES) {
    const { data, error } = await db
      .from('sites')
      .select('id')
      .eq('gsc_property', site.gsc_property)
      .maybeSingle();
    if (error) throw new Error(`sites lookup failed: ${error.message}`);
    if (data) {
      console.log(`${site.name}: already present`);
      continue;
    }
    const insert = await db.from('sites').insert(site);
    if (insert.error) throw new Error(`sites insert failed: ${insert.error.message}`);
    console.log(`${site.name}: inserted`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
