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

export type LlmProvider = 'claude' | 'deepseek' | 'openai' | 'qwen';

// ─── Claude (Anthropic) ──────────────────────────────────────────────
const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const CLAUDE_MAX_TOKENS = 64000;

/** Anthropic requires an explicit max_tokens; use the model's ceiling when the
 * caller doesn't cap it. Claude only bills tokens actually produced. */

// Config for the OpenAI-SDK-based providers. Omitting max-tokens makes these
// default to a *small* cap that truncates a reasoning model mid-JSON, so when
// the caller doesn't cap it we send a high explicit ceiling — the APIs only
// bill tokens produced and don't reject large values. OpenAI's reasoning
// models reject `max_tokens` and require `max_completion_tokens`.
type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

interface OpenAICompatConfig {
  label: 'deepseek' | 'openai' | 'qwen';
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
  if (v === 'xhigh') return 'xhigh';
  if (v === 'max') return 'max';
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
    model: process.env.STRATEGY_MODEL || 'gpt-5.6-terra',
    maxTokensDefault: 65536,
    tokenParam: 'max_completion_tokens',
    // GPT-5.6 is a reasoning model — this bounds the priciest token bucket.
    reasoningEffort: envReasoningEffort(),
  },
};

const QWEN_BASE_URL = 'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1';
const QWEN_MODEL = process.env.QWEN_MODEL ?? 'qwen3.7-plus';
const QWEN_COMPAT: OpenAICompatConfig = {
  label: 'qwen',
  apiKeyEnv: 'QWEN_API_KEY',
  baseURL: QWEN_BASE_URL,
  model: QWEN_MODEL,
  maxTokensDefault: 32768,
  tokenParam: 'max_completion_tokens',
};

/** Coerce a user/env value into a valid provider, defaulting to Claude. */
export function resolveProvider(p?: string | null): LlmProvider {
  const v = (p ?? process.env.LLM_PROVIDER ?? 'claude').toLowerCase();
  if (v === 'deepseek') return 'deepseek';
  if (v === 'openai') return 'openai';
  if (v === 'qwen') return 'qwen';
  return 'claude';
}

/**
 * Tool-call args aren't schema-validated by the provider — a model can fill an
 * `array` field with a plain string instead (seen once in production: the
 * whole risks array plus the next field's JSON ended up stuffed into a single
 * string). Coerce defensively so a malformed field degrades to one ugly item
 * instead of crashing every `.map()` call downstream.
 */
export function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    // Not valid JSON — fall through and keep the raw string as one item.
  }
  return [value];
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
   * Override the default model for this request. Each provider has a default
   * (from env or compiled-in). Pass a non-empty string here to use a different
   * model for this single call. Only respected by OpenAI-compatible paths
   * (deepseek / openai / qwen); Claude ignores it.
   */
  model?: string;
  /**
   * Cap on the model's completion. Omit to let each provider run to its model
   * maximum — use that for batch jobs (the weekly analysis) where a truncated
   * result is worse than the token cost. Set it only to deliberately keep a
   * response short (e.g. chat replies).
   */
  maxTokens?: number;
  /** Per-call OpenAI reasoning budget. Ignored by non-reasoning providers. */
  reasoningEffort?: ReasoningEffort;
  system: LlmTextBlock[];
  messages: LlmMessage[];
  tools: LlmTool[];
  /** Force a specific tool by name, or let the model decide. */
  toolChoice: { type: 'tool'; name: string } | 'auto' | 'none';
}

export interface LlmResponse {
  text: string;
  toolCall: { name: string; input: Record<string, unknown> } | null;
  modelUsed: string;
}

/** An error safe to show in the dashboard when a selected model cannot run. */
export class LlmProviderError extends Error {
  constructor(
    message: string,
    readonly provider: LlmProvider,
    readonly kind: 'configuration' | 'authentication' | 'credits' | 'rate_limit' | 'model' | 'network' | 'request',
  ) {
    super(message);
    this.name = 'LlmProviderError';
  }
}

function providerLabel(provider: LlmProvider): string {
  return provider === 'claude' ? 'Claude' : provider === 'openai' ? 'OpenAI' : provider === 'deepseek' ? 'DeepSeek' : 'Qwen';
}

/**
 * Provider SDK errors vary wildly. Convert the common account and capacity
 * failures into a concise, actionable message instead of leaking a generic
 * 500 or silently swallowing a background failure.
 */
export function toLlmProviderError(error: unknown, provider: LlmProvider): LlmProviderError {
  if (error instanceof LlmProviderError) return error;
  const label = providerLabel(provider);
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const status = typeof record.status === 'number' ? record.status : undefined;
  const code = typeof record.code === 'string' ? record.code.toLowerCase() : '';
  const raw = error instanceof Error ? error.message : String(error || 'Unknown provider error');
  const text = `${code} ${raw}`.toLowerCase();

  if (/api_key.*required|required.*api_key|missing.*api.?key/.test(text)) {
    return new LlmProviderError(`${label} is not configured on this deployment. Choose another model or add its API key.`, provider, 'configuration');
  }
  if (status === 401 || status === 403 || /invalid.*api.?key|authentication|unauthori[sz]ed|permission/.test(text)) {
    return new LlmProviderError(`${label} rejected the API key. Check the key and its project permissions, then try again.`, provider, 'authentication');
  }
  if (status === 429 && /rate.?limit|too many/.test(text)) {
    return new LlmProviderError(`${label} is rate-limiting requests. Wait a moment or choose a different model.`, provider, 'rate_limit');
  }
  if (/insufficient.?quota|insufficient.?credit|insufficient.?balance|billing|no.?credits|credit.?balance|quota.*exceed|usage.?limit/.test(text)) {
    return new LlmProviderError(`${label} has no available credits or quota for this request. Choose a funded model or add credits, then try again.`, provider, 'credits');
  }
  if (status === 429) {
    return new LlmProviderError(`${label} cannot accept this request right now (quota or rate limit). Check credits, wait briefly, or choose another model.`, provider, 'rate_limit');
  }
  if (status === 404 || /model.*not found|model.*does not exist|unsupported model/.test(text)) {
    return new LlmProviderError(`${label} cannot use the selected model. Choose another model or update the configured model name.`, provider, 'model');
  }
  if (/network|fetch failed|econn|enotfound|timeout|timed out/.test(text)) {
    return new LlmProviderError(`Could not reach ${label}. Check the connection and try again.`, provider, 'network');
  }
  return new LlmProviderError(`${label} could not complete this request: ${raw.slice(0, 300)}`, provider, 'request');
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
  try {
    if (req.provider === 'claude') return await callClaude(req);
    if (req.provider === 'qwen') return await callOpenAICompatible(req, QWEN_COMPAT);
    return await callOpenAICompatible(req, OPENAI_COMPAT[req.provider]);
  } catch (error) {
    throw toLlmProviderError(error, req.provider);
  }
}

/**
 * Resolve which model name to actually send — use the caller-provided override
 * when present, otherwise fall back to the provider's config default.
 */
function resolveModelForConfig(cfg: OpenAICompatConfig, reqModel?: string): string {
  return reqModel?.trim() ? reqModel : cfg.model;
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

  const actualModel = req.model?.trim() || CLAUDE_MODEL;

  const response = await client.messages.create({
    model: actualModel,
    max_tokens: req.maxTokens ?? CLAUDE_MAX_TOKENS,
    ...(req.toolChoice === 'none'
      ? {}
      : {
        tools: req.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema as Anthropic.Tool.InputSchema,
        })),
        tool_choice:
          req.toolChoice === 'auto'
            ? { type: 'auto' as const }
            : { type: 'tool' as const, name: req.toolChoice.name },
      }),
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
    tc === 'auto' || tc === 'none' ? null : (req.tools.find((t) => t.name === tc.name) ?? req.tools[0]);

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

  // GPT-5.6 rejects `reasoning_effort` + function tools on /v1/chat/completions
  // (it requires /v1/responses for that combo). The forced-tool path uses JSON
  // mode — no function tools — so reasoning_effort is safe there.
  const reasoningEffort = req.reasoningEffort ?? cfg.reasoningEffort;
  const includeReasoningEffort = reasoningEffort && forcedTool;

  const response = await client.chat.completions.create({
    model: resolveModelForConfig(cfg, req.model),
    [cfg.tokenParam]: req.maxTokens ?? cfg.maxTokensDefault,
    // The installed SDK predates GPT-5.6's `xhigh` / `max` levels, but the
    // Chat Completions API accepts them. Keep the runtime value intact.
    ...(includeReasoningEffort ? { reasoning_effort: reasoningEffort as 'low' | 'medium' | 'high' } : {}),
    messages,
    ...(tc === 'none'
      ? {}
      : forcedTool
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
