/**
 * Backfill the `repo` column on existing `sites` rows:
 *
 *   npx tsx scripts/seed-repos.ts
 */
import '../src/env.js';
import { getClient } from '../src/db/query.js';

async function main() {
  const db = getClient();

  const updates = [
    { name: 'LLMnesia', repo: 'llmnesia-site njs' },
  ];

  for (const u of updates) {
    const { error } = await db
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
