import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The curated project brief that grounds the PM strategist. Read at request
 * time so editing PROJECT_BRIEF.md takes effect without a redeploy. Bundled on
 * Vercel via `outputFileTracingIncludes` in next.config.mjs.
 */
export async function readBrief(): Promise<string> {
  try {
    return (await readFile(join(process.cwd(), 'PROJECT_BRIEF.md'), 'utf8')).trim();
  } catch {
    console.warn('[strategy] PROJECT_BRIEF.md not found — proceeding without it');
    return '(No project brief available.)';
  }
}
