import './env.js';

import { runPipeline } from './pipeline.js';

function parseArgs(): { dryRun: boolean; weekStart: string | null; provider: string | null } {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const weekArg = args.find((a) => a.startsWith('--week='));
  const weekStart = weekArg ? weekArg.split('=')[1] : null;
  const providerArg = args.find((a) => a.startsWith('--provider='));
  const provider = providerArg ? providerArg.split('=')[1] : null;
  return { dryRun, weekStart, provider };
}

async function main() {
  const { dryRun, weekStart, provider } = parseArgs();

  const { metrics, analysis } = await runPipeline({
    weekStart,
    dryRun,
    provider,
    log: (m) => console.log(`\n${m}`),
  });

  if (dryRun) {
    console.log('\n— Metrics snapshot —\n', JSON.stringify(metrics, null, 2));
    console.log('\n— Analysis —\n', JSON.stringify(analysis, null, 2));
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
