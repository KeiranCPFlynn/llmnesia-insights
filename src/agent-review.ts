import { createHash } from 'node:crypto';
import { applyLedgerPatches, createInitialLedgerState } from './ledger.js';
import type {
  ActionItem,
  AgentReview,
  ContextSource,
  EvidenceDeltaRecord,
  Finding,
  LedgerEntry,
  LedgerPatch,
  StrategyLedgerState,
  StrategyRecommendation,
  StrategyResult,
  Thread,
  ResolvedThread,
} from './types.js';

const PATCH_OPERATIONS = new Set([
  'add_hypothesis', 'update_hypothesis', 'retire_hypothesis',
  'add_constraint', 'remove_constraint', 'update_north_star', 'update_stage',
  'open_question', 'resolve_question', 'add_initiative', 'update_initiative',
  'update_monetization', 'update_baseline',
]);
const AREAS = new Set(['monetization', 'pricing', 'site', 'app', 'growth', 'retention']);
const REPOS = new Set(['llmnesia-site njs', 'LLMnesia', 'llmnesia-insights', 'none']);
const EFFORTS = new Set(['S', 'M', 'L']);
const CONFIDENCES = new Set(['low', 'medium', 'high']);
const SEVERITIES = new Set(['info', 'watch', 'concern', 'critical']);
const PRIORITIES = new Set(['high', 'medium', 'low']);
const DATA_SOURCES = new Set(['PostHog', 'GA4', 'Search', 'Combined']);
const PLACEHOLDER = /\bREPLACE\b|replace with/i;

export class ReviewValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Review validation failed:\n- ${issues.join('\n- ')}`);
    this.name = 'ReviewValidationError';
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !PLACEHOLDER.test(value);
}

function stringArray(value: unknown, path: string, issues: string[], allowEmpty = true): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    issues.push(`${path} must be ${allowEmpty ? 'an' : 'a non-empty'} array of strings.`);
    return [];
  }
  const result = value.filter(nonEmpty);
  if (result.length !== value.length) issues.push(`${path} contains an empty, placeholder, or non-string value.`);
  return result;
}

function dateMs(value: string): number {
  return new Date(value.includes('T') ? value : `${value}T23:59:59Z`).getTime();
}

export function stableUuid(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function reviewAuditId(weekStart: string): string {
  return stableUuid(`agent-review:${weekStart}`);
}

export function reviewHash(review: AgentReview): string {
  return createHash('sha256').update(JSON.stringify(review)).digest('hex');
}

export function evidenceHash(record: EvidenceDeltaRecord): string {
  return createHash('sha256')
    // Supabase stores these objects as JSONB, whose key order is not stable on
    // readback. Canonical recursive ordering makes the digest semantic rather
    // than dependent on insertion order while preserving array order.
    .update(JSON.stringify(canonicalJson({ delta: record.delta, raw_snapshot: record.raw_snapshot })))
    .digest('hex');
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalJson(child)]),
  );
}

function validateFinding(value: unknown, index: number, issues: string[]): Finding | null {
  const item = record(value);
  const path = `findings[${index}]`;
  if (!item || !nonEmpty(item.metric) || !nonEmpty(item.observation) || !SEVERITIES.has(String(item.severity))) {
    issues.push(`${path} must contain metric, observation, and a valid severity.`);
    return null;
  }
  if (item.source != null && !DATA_SOURCES.has(String(item.source))) issues.push(`${path}.source is invalid.`);
  return item as unknown as Finding;
}

function validateAction(value: unknown, index: number, issues: string[]): ActionItem | null {
  const item = record(value);
  const path = `action_items[${index}]`;
  if (!item || !nonEmpty(item.action) || !nonEmpty(item.rationale) || !PRIORITIES.has(String(item.priority))) {
    issues.push(`${path} must contain action, rationale, and a valid priority.`);
    return null;
  }
  return item as unknown as ActionItem;
}

function validateThreads<T extends Thread | ResolvedThread>(
  value: unknown,
  path: string,
  fields: string[],
  issues: string[],
): T[] {
  if (!Array.isArray(value)) {
    issues.push(`${path} must be an array.`);
    return [];
  }
  return value.flatMap((raw, index) => {
    const item = record(raw);
    if (!item || fields.some((field) => !nonEmpty(item[field]))) {
      issues.push(`${path}[${index}] is malformed.`);
      return [];
    }
    return [item as unknown as T];
  });
}

function validateRecommendation(
  value: unknown,
  index: number,
  weekStart: string,
  issues: string[],
): StrategyRecommendation | null {
  const item = record(value);
  const path = `strategy.recommendations[${index}]`;
  const required = ['title', 'recommendation', 'rationale', 'expected_impact'];
  if (!item || required.some((field) => !nonEmpty(item[field]))) {
    issues.push(`${path} is missing required text.`);
    return null;
  }
  if (!AREAS.has(String(item.area))) issues.push(`${path}.area is invalid.`);
  if (!REPOS.has(String(item.target_repo))) issues.push(`${path}.target_repo is invalid.`);
  if (!EFFORTS.has(String(item.effort))) issues.push(`${path}.effort is invalid.`);
  if (!CONFIDENCES.has(String(item.confidence))) issues.push(`${path}.confidence is invalid.`);
  const metrics = stringArray(item.metrics_to_watch, `${path}.metrics_to_watch`, issues);
  const handoff = record(item.handoff);
  if (!handoff) issues.push(`${path}.handoff must be an object.`);
  const founderSteps = handoff?.founder_steps == null
    ? []
    : stringArray(handoff.founder_steps, `${path}.handoff.founder_steps`, issues);
  const prompt = handoff?.coding_agent_prompt;
  if (prompt != null && !nonEmpty(prompt)) issues.push(`${path}.handoff.coding_agent_prompt is invalid.`);
  if (issues.some((issue) => issue.startsWith(path))) return null;
  return {
    ...(item as unknown as Omit<StrategyRecommendation, 'id'>),
    id: nonEmpty(item.id) ? item.id : stableUuid(`${weekStart}:recommendation:${index}:${item.title}`),
    metrics_to_watch: metrics,
    handoff: {
      ...(nonEmpty(prompt) ? { coding_agent_prompt: prompt } : {}),
      ...(founderSteps.length ? { founder_steps: founderSteps } : {}),
    },
  };
}

export interface ValidatedAgentReview {
  review: AgentReview;
  ledgerState: StrategyLedgerState;
  appliedPatches: LedgerPatch[];
  strategy: StrategyResult;
  auditEntry: LedgerEntry;
  patchEntries: LedgerEntry[];
  contextSources: ContextSource[];
  hash: string;
}

export function validateAgentReview(
  input: unknown,
  evidenceRecord: EvidenceDeltaRecord,
  currentLedger: StrategyLedgerState | null,
  now = new Date(),
): ValidatedAgentReview {
  const issues: string[] = [];
  const root = record(input);
  if (!root) throw new ReviewValidationError(['Review must be a JSON object.']);
  if (root.schema_version !== 1) issues.push('schema_version must be 1.');
  const agent = record(root.agent);
  if (!agent || !nonEmpty(agent.name)) issues.push('agent.name is required and must name the actual agent.');
  if (!nonEmpty(root.headline)) issues.push('headline is required and cannot be a template placeholder.');
  if (!nonEmpty(root.summary)) issues.push('summary is required and cannot be a template placeholder.');
  const facts = stringArray(root.facts, 'facts', issues, false);
  const inferences = stringArray(root.inferences, 'inferences', issues);

  const evidence = record(root.evidence);
  const expected = evidenceRecord.delta;
  if (!evidence) {
    issues.push('evidence is required.');
  } else {
    if (evidence.week_start !== expected.week_start) issues.push(`evidence.week_start must match prepared evidence (${expected.week_start}).`);
    if (evidence.week_end !== expected.week_end) issues.push(`evidence.week_end must match prepared evidence (${expected.week_end}).`);
    const expectedAsOf = evidenceRecord.raw_snapshot.partial?.as_of ?? expected.week_end;
    if (evidence.data_as_of !== expectedAsOf) issues.push(`evidence.data_as_of must match prepared evidence (${expectedAsOf}).`);
    if (evidence.snapshot_hash !== evidenceHash(evidenceRecord)) issues.push('evidence.snapshot_hash does not match the persisted snapshot. Run insights:prepare again.');
    if (!nonEmpty(evidence.prepared_at)) issues.push('evidence.prepared_at is required.');
    else if (now.getTime() - dateMs(evidence.prepared_at) > 48 * 60 * 60 * 1000) issues.push('The evidence pack is stale (prepared more than 48 hours ago). Run insights:prepare again.');
    if (now.getTime() - dateMs(expectedAsOf) > 8 * 24 * 60 * 60 * 1000) issues.push('The reporting period is stale. Prepare a current evidence pack before publishing.');
  }

  const findings = Array.isArray(root.findings)
    ? root.findings.flatMap((item, index) => validateFinding(item, index, issues) ?? [])
    : (issues.push('findings must be an array.'), []);
  const actions = Array.isArray(root.action_items)
    ? root.action_items.flatMap((item, index) => validateAction(item, index, issues) ?? [])
    : (issues.push('action_items must be an array.'), []);
  const openThreads = validateThreads<Thread>(root.open_threads, 'open_threads', ['thread', 'first_flagged', 'current_status'], issues);
  const resolvedThreads = validateThreads<ResolvedThread>(root.resolved_threads, 'resolved_threads', ['thread', 'resolution'], issues);

  const rawPatches = root.ledger_patches;
  const patches: LedgerPatch[] = [];
  if (!Array.isArray(rawPatches)) issues.push('ledger_patches must be an array.');
  else rawPatches.forEach((raw, index) => {
    const patch = record(raw);
    if (!patch || !PATCH_OPERATIONS.has(String(patch.operation))) {
      issues.push(`ledger_patches[${index}].operation is unknown.`);
    } else if (!record(patch.changes) || !nonEmpty(patch.rationale)) {
      issues.push(`ledger_patches[${index}] must contain changes and rationale.`);
    } else {
      patches.push(patch as unknown as LedgerPatch);
    }
  });

  const strategyInput = record(root.strategy);
  if (!strategyInput || !nonEmpty(strategyInput.narrative)) issues.push('strategy.narrative is required.');
  const recommendations = Array.isArray(strategyInput?.recommendations)
    ? strategyInput.recommendations.flatMap((item, index) => validateRecommendation(item, index, expected.week_start, issues) ?? [])
    : (issues.push('strategy.recommendations must be an array.'), []);
  const risks = stringArray(strategyInput?.risks, 'strategy.risks', issues);
  const experiments = Array.isArray(strategyInput?.experiments)
    ? strategyInput.experiments.flatMap((raw, index) => {
        const item = record(raw);
        if (!item || !nonEmpty(item.hypothesis) || !nonEmpty(item.measure)) {
          issues.push(`strategy.experiments[${index}] is malformed.`);
          return [];
        }
        return [{ hypothesis: item.hypothesis, measure: item.measure }];
      })
    : (issues.push('strategy.experiments must be an array.'), []);

  const sources = record(root.sources);
  const git = Array.isArray(sources?.git) ? sources.git : [];
  const conversations = Array.isArray(sources?.conversations) ? sources.conversations : [];
  if (!git.length) issues.push('sources.git must record at least one inspected repository.');
  if (!conversations.length) issues.push('sources.conversations must record at least one LLMnesia MCP source.');
  const validGit = git.flatMap((raw, index) => {
    const item = record(raw);
    if (!item || !nonEmpty(item.repo)) {
      issues.push(`sources.git[${index}].repo is required.`);
      return [];
    }
    const refs = stringArray(item.refs, `sources.git[${index}].refs`, issues, false);
    const files = stringArray(item.files_inspected, `sources.git[${index}].files_inspected`, issues, false);
    const sourceFindings = stringArray(item.findings, `sources.git[${index}].findings`, issues, false);
    return [{ repo: item.repo, refs, files_inspected: files, findings: sourceFindings }];
  });
  const validConversations = conversations.flatMap((raw, index) => {
    const item = record(raw);
    if (!item || !nonEmpty(item.conversation_id) || !nonEmpty(item.reason)) {
      issues.push(`sources.conversations[${index}] must contain conversation_id and reason.`);
      return [];
    }
    return [{ conversation_id: item.conversation_id, ...(nonEmpty(item.title) ? { title: item.title } : {}), reason: item.reason }];
  });
  const followUpTools = stringArray(sources?.follow_up_tools, 'sources.follow_up_tools', issues);

  const baseLedger = currentLedger ?? createInitialLedgerState();
  const patched = applyLedgerPatches(baseLedger, patches, now.toISOString());
  if (patched.applied.length !== patches.length) issues.push('One or more ledger patches are malformed or target an entity that does not exist.');
  if (issues.length) throw new ReviewValidationError(issues);

  const review = input as AgentReview;
  const agentLabel = `${agent!.name}${nonEmpty(agent!.model) ? ` / ${agent!.model}` : ''}`;
  const generatedAt = now.toISOString();
  const strategy: StrategyResult = {
    thesis: strategyInput!.narrative as string,
    monetization: {
      model: patched.state.monetization_design.model,
      what_to_gate: patched.state.monetization_design.what_to_gate,
      pricing_hypothesis: patched.state.monetization_design.pricing_hypothesis,
    },
    recommendations,
    risks,
    experiments,
    model_used: agentLabel,
    generated_at: generatedAt,
  };
  const hash = reviewHash(review);
  const auditId = reviewAuditId(expected.week_start);
  const auditEntry: LedgerEntry = {
    id: auditId,
    week_start: expected.week_start,
    entry_type: 'context',
    target: 'agent_review',
    operation: 'update',
    patch: {
      review_hash: hash,
      // Retaining the exact pre-review ledger lets a later review for the same
      // reporting period be replayed safely instead of stacking add patches.
      ledger_before: baseLedger,
      agent: review.agent,
      evidence: review.evidence,
      sources: { git: validGit, conversations: validConversations, follow_up_tools: followUpTools },
      facts,
      inferences,
    },
    evidence: `${facts.length} fact(s), ${inferences.length} inference(s), ${recommendations.length} recommendation(s).`,
    confidence: null,
    model_used: agentLabel,
  };
  const patchEntries: LedgerEntry[] = patched.applied.map((patch, index) => ({
    id: stableUuid(`${auditId}:patch:${index}`),
    week_start: expected.week_start,
    entry_type: patch.operation.includes('question') ? 'question' : 'patch',
    target: patch.target_id ?? patch.operation,
    operation: patch.operation.startsWith('add_') ? 'add'
      : patch.operation.startsWith('retire_') || patch.operation.startsWith('remove_') ? 'retire'
        : patch.operation.startsWith('open_') ? 'open'
          : patch.operation.startsWith('resolve_') ? 'resolve' : 'update',
    patch,
    evidence: patch.rationale,
    confidence: null,
    model_used: agentLabel,
  }));
  const contextSources: ContextSource[] = [
    ...validGit.map((source, index) => ({
      id: stableUuid(`${auditId}:git:${index}:${source.repo}`),
      week_start: expected.week_start,
      source_type: 'git' as const,
      repo: source.repo,
      digest: source,
    })),
    {
      id: stableUuid(`${auditId}:mcp`),
      week_start: expected.week_start,
      source_type: 'mcp',
      repo: null,
      digest: { conversations: validConversations.length, sources: validConversations },
    },
    ...(followUpTools.length ? [{
      id: stableUuid(`${auditId}:tools`),
      week_start: expected.week_start,
      source_type: 'manual' as const,
      repo: null,
      digest: { tools: followUpTools },
    }] : []),
  ];

  return {
    review: {
      ...review,
      facts,
      inferences,
      findings,
      action_items: actions,
      open_threads: openThreads,
      resolved_threads: resolvedThreads,
      ledger_patches: patched.applied,
      strategy: { ...review.strategy, recommendations, risks, experiments },
      sources: { git: validGit, conversations: validConversations, follow_up_tools: followUpTools },
    },
    ledgerState: patched.state,
    appliedPatches: patched.applied,
    strategy,
    auditEntry,
    patchEntries,
    contextSources,
    hash,
  };
}
