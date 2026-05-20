import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { ChatMessage } from './types.js';

/**
 * Provider-agnostic LLM call used by the weekly analysis, the chat panel and
 * the PM strategist.
 *
 * Claude (Anthropic SDK) and the OpenAI-compatible providers (DeepSeek, OpenAI)
 * both support forced/auto tool use; this normalises the request and response
 * shapes so the rest of the codebase doesn't care which one ran.
 *
 * Prompt caching: Anthropic needs explicit `cache_control`; the OpenAI-style
 * APIs do automatic prefix caching with no parameter. We mark cacheable blocks
 * with `cache: true` and only the Claude path acts on it.
 */

export type LlmProvider = 'claude' | 'deepseek' | 'openai';

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
// Anthropic requires an explicit max_tokens; use the model's ceiling when the
// caller doesn't cap it. Claude only bills tokens actually produced.
const CLAUDE_MAX_TOKENS = 64000;

// Config for the OpenAI-SDK-based providers. Omitting max-tokens makes these
// default to a *small* cap that truncates a reasoning model mid-JSON, so when
// the caller doesn't cap it we send a high explicit ceiling — the APIs only
// bill tokens produced and don't reject large values. OpenAI's reasoning
// models reject `max_tokens` and require `max_completion_tokens`.
type ReasoningEffort = 'low' | 'medium' | 'high';

interface OpenAICompatConfig {
  label: 'deepseek' | 'openai';
  apiKeyEnv: string;
  baseURL?: string;
  model: string;
  maxTokensDefault: number;
  tokenParam: 'max_tokens' | 'max_completion_tokens';
  /** OpenAI reasoning models only — caps the (billed) reasoning spend. */
  reasoningEffort?: ReasoningEffort;
}

function envReasoningEffort(): ReasoningEffort {
  const v = (process.env.STRATEGY_REASONING_EFFORT || 'medium').toLowerCase();
  // 'minimal' is accepted as an alias for the cheapest supported tier.
  if (v === 'minimal' || v === 'low') return 'low';
  if (v === 'high') return 'high';
  return 'medium';
}

const OPENAI_COMPAT: Record<'deepseek' | 'openai', OpenAICompatConfig> = {
  deepseek: {
    label: 'deepseek',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    baseURL: 'https://api.deepseek.com',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro',
    maxTokensDefault: 65536,
    tokenParam: 'max_tokens',
  },
  openai: {
    label: 'openai',
    apiKeyEnv: 'OPENAI_API_KEY',
    // Default OpenAI base URL (SDK default when baseURL is undefined).
    model: process.env.STRATEGY_MODEL || 'gpt-5.5',
    maxTokensDefault: 65536,
    tokenParam: 'max_completion_tokens',
    // gpt-5.5 is a reasoning model — this bounds the priciest token bucket.
    reasoningEffort: envReasoningEffort(),
  },
};

/** Coerce a user/env value into a valid provider, defaulting to Claude. */
export function resolveProvider(p?: string | null): LlmProvider {
  const v = (p ?? process.env.LLM_PROVIDER ?? 'claude').toLowerCase();
  return v === 'deepseek' ? 'deepseek' : v === 'openai' ? 'openai' : 'claude';
}

export interface LlmTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LlmTextBlock {
  text: string;
  /** Claude only: wrap this block in an ephemeral cache_control. Ignored by DeepSeek. */
  cache?: boolean;
}

export interface LlmMessage {
  role: 'user' | 'assistant';
  blocks: LlmTextBlock[];
}

export interface LlmRequest {
  provider: LlmProvider;
  /**
   * Cap on the model's completion. Omit to let each provider run to its model
   * maximum — use that for batch jobs (the weekly analysis) where a truncated
   * result is worse than the token cost. Set it only to deliberately keep a
   * response short (e.g. chat replies).
   */
  maxTokens?: number;
  system: LlmTextBlock[];
  messages: LlmMessage[];
  tools: LlmTool[];
  /** Force a specific tool by name, or let the model decide. */
  toolChoice: { type: 'tool'; name: string } | 'auto';
}

export interface LlmResponse {
  text: string;
  toolCall: { name: string; input: Record<string, unknown> } | null;
  modelUsed: string;
}

/**
 * Convert a persisted chat transcript into provider-agnostic LlmMessages.
 * Each user attachment becomes its own labelled, fenced text block — the Claude
 * path sends them as separate content blocks, the OpenAI-compat path joins them
 * with blank lines, so a GA4 CSV the API can't fetch reaches every provider as
 * plain text.
 */
export function chatToLlmMessages(messages: ChatMessage[]): LlmMessage[] {
  return messages.map((m) => {
    const blocks: LlmTextBlock[] = [];
    if (m.content.trim()) blocks.push({ text: m.content });
    for (const a of m.attachments ?? []) {
      blocks.push({ text: `Attached file "${a.name}":\n\`\`\`\n${a.content}\n\`\`\`` });
    }
    // Never emit a message with no content blocks (Anthropic rejects it).
    if (blocks.length === 0) blocks.push({ text: m.content });
    return { role: m.role, blocks };
  });
}

export async function callLlm(req: LlmRequest): Promise<LlmResponse> {
  if (req.provider === 'claude') return callClaude(req);
  return callOpenAICompatible(req, OPENAI_COMPAT[req.provider]);
}

async function callClaude(req: LlmRequest): Promise<LlmResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required for the Claude provider');
  const client = new Anthropic({ apiKey });

  const toBlocks = (blocks: LlmTextBlock[]): Anthropic.TextBlockParam[] =>
    blocks.map((b) => ({
      type: 'text',
      text: b.text,
      ...(b.cache ? { cache_control: { type: 'ephemeral' as const } } : {}),
    }));

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: req.maxTokens ?? CLAUDE_MAX_TOKENS,
    tools: req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool.InputSchema,
    })),
    tool_choice:
      req.toolChoice === 'auto'
        ? { type: 'auto' }
        : { type: 'tool', name: req.toolChoice.name },
    system: toBlocks(req.system),
    messages: req.messages.map((m) => ({ role: m.role, content: toBlocks(m.blocks) })),
  });

  const textPart = response.content.find((b) => b.type === 'text');
  const toolPart = response.content.find((b) => b.type === 'tool_use');

  const usage = response.usage as {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
  };
  console.log(
    `[llm:claude] ${usage.input_tokens} in / ${usage.output_tokens} out` +
      (usage.cache_read_input_tokens ? ` / ${usage.cache_read_input_tokens} cache-read` : ''),
  );

  return {
    text: textPart && textPart.type === 'text' ? textPart.text : '',
    toolCall:
      toolPart && toolPart.type === 'tool_use'
        ? { name: toolPart.name, input: toolPart.input as Record<string, unknown> }
        : null,
    modelUsed: response.model,
  };
}

/**
 * Shared path for the OpenAI-SDK providers (DeepSeek, OpenAI). Reasoning
 * models (deepseek-v4-pro, GPT-5-class) reject a *forced* tool_choice but
 * reliably honour tool_choice:"auto" and support JSON output mode. So when the
 * caller forces a single tool (structured analysis/strategy) we emulate it with
 * JSON mode + the tool's schema and parse the reply as that tool's input; when
 * the choice is "auto" (the chat's optional tool) we pass tools through.
 */
async function callOpenAICompatible(
  req: LlmRequest,
  cfg: OpenAICompatConfig,
): Promise<LlmResponse> {
  const apiKey = process.env[cfg.apiKeyEnv];
  if (!apiKey) {
    throw new Error(`${cfg.apiKeyEnv} is required for the ${cfg.label} provider`);
  }
  const client = new OpenAI({ apiKey, ...(cfg.baseURL ? { baseURL: cfg.baseURL } : {}) });

  const join = (blocks: LlmTextBlock[]) => blocks.map((b) => b.text).join('\n\n');

  const tc = req.toolChoice;
  const forcedTool =
    tc === 'auto' ? null : (req.tools.find((t) => t.name === tc.name) ?? req.tools[0]);

  let systemText = join(req.system);
  if (forcedTool) {
    systemText +=
      `\n\nYou MUST respond with ONLY a single JSON object — no prose, no markdown fences — ` +
      `that is a valid argument for the "${forcedTool.name}" function and strictly conforms ` +
      `to this JSON Schema:\n${JSON.stringify(forcedTool.input_schema)}`;
  }

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemText },
    ...req.messages.map((m) => ({ role: m.role, content: join(m.blocks) })),
  ];

  // gpt-5.5 rejects `reasoning_effort` + function tools on /v1/chat/completions
  // (it requires /v1/responses for that combo). The forced-tool path uses JSON
  // mode — no function tools — so reasoning_effort is safe there.
  const includeReasoningEffort = cfg.reasoningEffort && forcedTool;

  const response = await client.chat.completions.create({
    model: cfg.model,
    [cfg.tokenParam]: req.maxTokens ?? cfg.maxTokensDefault,
    ...(includeReasoningEffort ? { reasoning_effort: cfg.reasoningEffort } : {}),
    messages,
    ...(forcedTool
      ? { response_format: { type: 'json_object' as const } }
      : {
          tools: req.tools.map((t) => ({
            type: 'function' as const,
            function: { name: t.name, description: t.description, parameters: t.input_schema },
          })),
          tool_choice: 'auto' as const,
        }),
  });

  const choice = response.choices[0]?.message;

  let toolCall: LlmResponse['toolCall'] = null;
  if (forcedTool) {
    const raw = choice?.content?.trim() || '';
    try {
      toolCall = { name: forcedTool.name, input: JSON.parse(raw) };
    } catch {
      throw new Error(
        `${cfg.label} (JSON mode) did not return valid JSON for ${forcedTool.name}: ${raw.slice(0, 300)}`,
      );
    }
  } else {
    const call = choice?.tool_calls?.[0];
    if (call && call.type === 'function') {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(call.function.arguments || '{}');
      } catch {
        throw new Error(
          `${cfg.label} returned non-JSON tool arguments for ${call.function.name}: ${call.function.arguments}`,
        );
      }
      toolCall = { name: call.function.name, input };
    }
  }

  const usage = response.usage;
  console.log(
    `[llm:${cfg.label}] ${usage?.prompt_tokens ?? '?'} in / ${usage?.completion_tokens ?? '?'} out` +
      (usage?.prompt_tokens_details?.cached_tokens
        ? ` / ${usage.prompt_tokens_details.cached_tokens} cache-hit`
        : ''),
  );

  return {
    text: choice?.content ?? '',
    toolCall,
    modelUsed: response.model || cfg.model,
  };
}
