import type { McpDigest } from './types.js';

/**
 * Collect strategy-relevant conversation context from the local LLMnesia MCP
 * server. This indexes all AI chats (Claude Code, etc.) and can surface
 * decisions, constraints, and ideas the founder discussed outside this dashboard.
 *
 * Fail-soft: if MCP is unavailable (not running, network error, or we're on
 * Vercel where it's local-only), returns null. The pipeline must never break
 * because MCP context is missing.
 *
 * NOTE: The MCP server API needs to be discovered/configured. This module
 * provides the correct shape and fail-soft behavior; the actual MCP query
 * will be filled in once the server's tool/resource interface is confirmed.
 */
export async function collectMcpContext(since: string): Promise<McpDigest | null> {
  // MCP_CONTEXT_URL is a small adapter endpoint that accepts the request below
  // and returns a digest. MCP_SERVER_URL remains supported for local setups
  // that already expose that adapter directly.
  const mcpUrl = process.env.MCP_CONTEXT_URL ?? process.env.MCP_SERVER_URL;
  if (!mcpUrl) {
    return null;
  }

  try {
    const response = await fetch(mcpUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        since,
        keywords: ['strategy', 'metrics', 'decision', 'pricing', 'growth', 'launch'],
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json() as Partial<McpDigest> & { digest?: Partial<McpDigest> };
    const digest: Partial<McpDigest> = body.digest ?? body;
    return {
      since,
      conversations: typeof digest.conversations === 'number' ? digest.conversations : 0,
      decisions: Array.isArray(digest.decisions) ? digest.decisions.filter((v): v is string => typeof v === 'string') : [],
      constraints: Array.isArray(digest.constraints) ? digest.constraints.filter((v): v is string => typeof v === 'string') : [],
      ideas: Array.isArray(digest.ideas) ? digest.ideas.filter((v): v is string => typeof v === 'string') : [],
    };
  } catch (e) {
    console.log(
      `[mcp-context] skipped: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}

/**
 * Format an MCP digest into a human-readable block for the LLM prompt.
 * Returns empty string when there is no digest or no conversations.
 */
export function formatMcpContext(digest: McpDigest | null): string {
  if (!digest || digest.conversations === 0) return '';

  const parts: string[] = [`FOUNDER CONVERSATIONS since ${digest.since} (${digest.conversations} relevant):`];

  if (digest.decisions.length) {
    parts.push(`  Decisions made: ${digest.decisions.join('; ')}`);
  }
  if (digest.constraints.length) {
    parts.push(`  Constraints stated: ${digest.constraints.join('; ')}`);
  }
  if (digest.ideas.length) {
    parts.push(`  Ideas discussed: ${digest.ideas.join('; ')}`);
  }

  return parts.join('\n');
}
