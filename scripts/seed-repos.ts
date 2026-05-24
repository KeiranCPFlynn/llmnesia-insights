/**
 * Backfill the `repo` column on existing `sites` rows.
 *
 * The column itself must be added first (DDL the service key can't run):
 *
 *   alter table public.sites add column if not exists repo text;
 *
 * Then run:
 *
 *   npx tsx scripts/seed-repos.ts
 */
import '../src/env.js';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } },
  );

  const updates = [
    { name: 'LLMnesia', repo: 'llmnesia-site njs' },
    { name: 'LunaCradle', repo: 'lunacradle' },
  ];

  for (const u of updates) {
    const { error } = await supabase
      .from('sites')
      .update({ repo: u.repo })
      .eq('name', u.name);
    console.log(`${u.name} → repo="${u.repo}":`, error?.message ?? 'ok');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
