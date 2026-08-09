import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import type { GitDigest } from './types.js';

/**
 * Collect git activity from configured repos since a given date.
 *
 * Env: GIT_REPOS — comma-separated absolute paths to git repos
 *   e.g. "/Users/Kdog/Code-Projects/LLMnesia,/Users/Kdog/Code-Projects/llmnesia-site njs"
 *
 * Fail-soft: if a repo doesn't exist, git fails, or we're on Vercel (no git),
 * returns an empty array. The pipeline must never break because of git context.
 */
export function collectGitContext(
  since: string,
  repos?: string[],
): GitDigest[] {
  const repoPaths =
    repos ??
    (process.env.GIT_REPOS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  if (!repoPaths.length) return [];

  const digests: GitDigest[] = [];

  for (const repoPath of repoPaths) {
    try {
      const digest = getRepoDigest(repoPath, since);
      if (digest) digests.push(digest);
    } catch (e) {
      console.log(
        `[git-context] skipping ${basename(repoPath)}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return digests;
}

function getRepoDigest(repoPath: string, since: string): GitDigest | null {
  if (!existsSync(repoPath)) return null;

  const label = basename(repoPath);

  let output: string;
  try {
    output = execFileSync(
      'git',
      ['log', `--since=${since}`, '--oneline', '--no-merges', '--format=%s'],
      { cwd: repoPath, encoding: 'utf-8', timeout: 10_000 },
    );
  } catch {
    // No commits in range, or git not available — not an error.
    return {
      repo: repoPath,
      label,
      since,
      commits: 0,
      features: [],
      fixes: [],
      other: [],
      notable: [],
    };
  }

  const lines = output
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) {
    return { repo: repoPath, label, since, commits: 0, features: [], fixes: [], other: [], notable: [] };
  }

  // Rough categorisation by commit message prefix conventions.
  const features: string[] = [];
  const fixes: string[] = [];
  const other: string[] = [];

  for (const msg of lines) {
    const lower = msg.toLowerCase();
    if (
      lower.startsWith('feat') ||
      lower.startsWith('add') ||
      lower.includes('new ') ||
      lower.startsWith('implement')
    ) {
      features.push(msg);
    } else if (
      lower.startsWith('fix') ||
      lower.startsWith('bug') ||
      lower.startsWith('patch') ||
      lower.includes('hotfix')
    ) {
      fixes.push(msg);
    } else {
      other.push(msg);
    }
  }

  // Pick notable: first 5 commits (most recent) as a representative sample.
  const notable = lines.slice(0, 5);

  return {
    repo: repoPath,
    label,
    since,
    commits: lines.length,
    features,
    fixes,
    other,
    notable,
  };
}

/**
 * Format a list of git digests into a human-readable block for the LLM prompt.
 * Returns empty string when there are no digests.
 */
export function formatGitContext(digests: GitDigest[]): string {
  if (!digests.length) return '';

  const parts = digests.map((d) => {
    if (d.commits === 0) return `${d.label}: no commits since ${d.since}`;
    const lines = [
      `${d.label}: ${d.commits} commit(s) since ${d.since}`,
      d.features.length ? `  Features: ${d.features.slice(0, 5).join('; ')}` : null,
      d.fixes.length ? `  Fixes: ${d.fixes.slice(0, 5).join('; ')}` : null,
      d.other.length ? `  Other: ${d.other.slice(0, 3).join('; ')}` : null,
    ].filter(Boolean);
    return lines.join('\n');
  });

  return `\nWHAT'S BEEN BUILT (git activity since last strategy update):\n${parts.join('\n\n')}`;
}
