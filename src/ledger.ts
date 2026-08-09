import { randomUUID } from 'node:crypto';
import type {
  AnalysisResult,
  ContextSource,
  EvidenceDelta,
  LedgerEditorResult,
  LedgerEntry,
  LedgerHypothesis,
  LedgerInitiative,
  LedgerPatch,
  McpDigest,
  StrategyExperiment,
  StrategyRecommendation,
  StrategyLedgerState,
} from './types.js';
import { callLlm, coerceStringArray, resolveProvider, type LlmProvider, type LlmTool } from './llm.js';
import { formatGitContext } from './git-context.js';
import { formatMcpContext } from './mcp-context.js';
import { LEDGER_SYSTEM_PROMPT } from './prompts/ledger-prompt.js';

const LEDGER_TOOL: LlmTool = {
  name: 'submit_ledger_update',
  description: 'Submit targeted patches to the living strategy ledger and this week\'s tactical recommendations.',
  input_schema: {
    type: 'object',
    properties: {
      patches: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            operation: {
              type: 'string',
              enum: [
                'add_hypothesis', 'update_hypothesis', 'retire_hypothesis',
                'add_constraint', 'remove_constraint', 'update_north_star',
                'update_stage', 'open_question', 'resolve_question',
                'add_initiative', 'update_initiative', 'update_monetization',
                'update_baseline',
              ],
            },
            target_id: { type: 'string' },
            changes: { type: 'object' },
            rationale: { type: 'string' },
          },
          required: ['operation', 'changes', 'rationale'],
        },
      },
      narrative: { type: 'string' },
      weekly_recommendations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            area: { type: 'string', enum: ['monetization', 'pricing', 'site', 'app', 'growth', 'retention'] },
            target_repo: { type: 'string', enum: ['llmnesia-site njs', 'LLMnesia', 'llmnesia-insights', 'none'] },
            recommendation: { type: 'string' },
            rationale: { type: 'string' },
            expected_impact: { type: 'string' },
            effort: { type: 'string', enum: ['S', 'M', 'L'] },
            confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
            metrics_to_watch: { type: 'array', items: { type: 'string' } },
            handoff: { type: 'object' },
          },
          required: ['title', 'area', 'target_repo', 'recommendation', 'rationale', 'expected_impact', 'effort', 'confidence', 'metrics_to_watch', 'handoff'],
        },
      },
      risks: { type: 'array', items: { type: 'string' } },
      experiments: {
        type: 'array',
        items: {
          type: 'object',
          properties: { hypothesis: { type: 'string' }, measure: { type: 'string' } },
          required: ['hypothesis', 'measure'],
        },
      },
    },
    required: ['patches', 'narrative', 'weekly_recommendations', 'risks', 'experiments'],
  },
};

/** A neutral initial state lets the first ledger run establish a defensible baseline. */
export function createInitialLedgerState(): StrategyLedgerState {
  return {
    north_star: 'Establish a repeatable path to activated, retained weekly users before scaling monetization.',
    stage: 'baseline and validation',
    stage_triggers: ['Sustained activation and retention trends across several completed weeks.'],
    active_hypotheses: [],
    constraints: [],
    open_questions: [],
    monetization_design: {
      model: 'Undecided',
      what_to_gate: 'Undecided',
      pricing_hypothesis: 'Undecided',
      trigger_conditions: ['Validate durable user value and retention before committing to a paywall.'],
    },
    active_initiatives: [],
    metrics_baseline: {},
    version: 1,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function patchArrayItem<T extends { id: string }>(items: T[], id: string | null | undefined, changes: Record<string, unknown>): T[] {
  if (!id || !items.some((item) => item.id === id)) return items;
  return items.map((item) => item.id === id ? { ...item, ...changes, id: item.id } as T : item);
}

/**
 * Applies only recognised patch operations. Malformed or stale model patches are
 * skipped instead of corrupting the singleton ledger; their absence is visible
 * in the returned applied list and audit trail.
 */
export function applyLedgerPatches(
  previous: StrategyLedgerState,
  patches: LedgerPatch[],
  now = new Date().toISOString(),
): { state: StrategyLedgerState; applied: LedgerPatch[] } {
  let state: StrategyLedgerState = structuredClone(previous);
  const applied: LedgerPatch[] = [];

  for (const patch of patches) {
    const changes = asRecord(patch.changes);
    const id = patch.target_id ?? null;
    let appliedPatch: LedgerPatch | null = null;

    switch (patch.operation) {
      case 'update_north_star': {
        const northStar = asString(changes.north_star);
        if (northStar) {
          state.north_star = northStar;
          appliedPatch = { ...patch, changes: { north_star: northStar } };
        }
        break;
      }
      case 'update_stage': {
        const stage = asString(changes.stage);
        if (stage) {
          state.stage = stage;
          state.stage_triggers = Array.isArray(changes.stage_triggers)
            ? coerceStringArray(changes.stage_triggers) : state.stage_triggers;
          appliedPatch = { ...patch, changes: { stage: state.stage, stage_triggers: state.stage_triggers } };
        }
        break;
      }
      case 'add_hypothesis': {
        const claim = asString(changes.claim);
        const betType = asString(changes.bet_type);
        const confidence = asString(changes.confidence);
        const falsification = asString(changes.falsification);
        if (claim && betType && confidence && falsification &&
            ['growth', 'activation', 'retention', 'monetization', 'product'].includes(betType) &&
            ['low', 'medium', 'high'].includes(confidence)) {
          const hypothesis: LedgerHypothesis = {
            id: randomUUID(), claim,
            bet_type: betType as LedgerHypothesis['bet_type'],
            confidence: confidence as LedgerHypothesis['confidence'],
            evidence_for: Array.isArray(changes.evidence_for) ? coerceStringArray(changes.evidence_for) : [],
            evidence_against: Array.isArray(changes.evidence_against) ? coerceStringArray(changes.evidence_against) : [],
            falsification, first_proposed: now, last_reviewed: now,
          };
          state.active_hypotheses.push(hypothesis);
          appliedPatch = { ...patch, target_id: hypothesis.id, changes: hypothesis as unknown as Record<string, unknown> };
        }
        break;
      }
      case 'update_hypothesis': {
        if (id && state.active_hypotheses.some((h) => h.id === id)) {
          const permitted = ['claim', 'bet_type', 'confidence', 'evidence_for', 'evidence_against', 'falsification'];
          const sanitized = Object.fromEntries(Object.entries(changes).filter(([key]) => permitted.includes(key)));
          if (sanitized.bet_type && (!asString(sanitized.bet_type) || !['growth', 'activation', 'retention', 'monetization', 'product'].includes(sanitized.bet_type as string))) delete sanitized.bet_type;
          if (sanitized.confidence && (!asString(sanitized.confidence) || !['low', 'medium', 'high'].includes(sanitized.confidence as string))) delete sanitized.confidence;
          if (Array.isArray(sanitized.evidence_for)) sanitized.evidence_for = coerceStringArray(sanitized.evidence_for);
          if (Array.isArray(sanitized.evidence_against)) sanitized.evidence_against = coerceStringArray(sanitized.evidence_against);
          state.active_hypotheses = patchArrayItem(state.active_hypotheses, id, { ...sanitized, last_reviewed: now });
          appliedPatch = { ...patch, changes: { ...sanitized, last_reviewed: now } };
        }
        break;
      }
      case 'retire_hypothesis': {
        if (id && state.active_hypotheses.some((h) => h.id === id)) {
          state.active_hypotheses = state.active_hypotheses.filter((h) => h.id !== id);
          appliedPatch = patch;
        }
        break;
      }
      case 'add_constraint': {
        const constraint = asString(changes.constraint);
        const source = asString(changes.source);
        if (constraint && source && ['founder', 'data', 'technical'].includes(source)) {
          const item = { id: randomUUID(), constraint, source: source as 'founder' | 'data' | 'technical' };
          state.constraints.push(item);
          appliedPatch = { ...patch, target_id: item.id, changes: item as unknown as Record<string, unknown> };
        }
        break;
      }
      case 'remove_constraint': {
        if (id && state.constraints.some((c) => c.id === id)) {
          state.constraints = state.constraints.filter((c) => c.id !== id);
          appliedPatch = patch;
        }
        break;
      }
      case 'open_question': {
        const question = asString(changes.question);
        if (question) {
          const item = { id: randomUUID(), question, first_asked: now, context: asString(changes.context) ?? patch.rationale };
          state.open_questions.push(item);
          appliedPatch = { ...patch, target_id: item.id, changes: item as unknown as Record<string, unknown> };
        }
        break;
      }
      case 'resolve_question': {
        if (id && state.open_questions.some((q) => q.id === id)) {
          state.open_questions = state.open_questions.filter((q) => q.id !== id);
          appliedPatch = patch;
        }
        break;
      }
      case 'add_initiative': {
        const title = asString(changes.title);
        const area = asString(changes.area);
        const status = asString(changes.status);
        const expected = asString(changes.expected_outcome);
        if (title && area && status && expected &&
            ['monetization', 'pricing', 'site', 'app', 'growth', 'retention'].includes(area) &&
            ['accepted', 'in_progress', 'shipped', 'measuring'].includes(status)) {
          const item: LedgerInitiative = {
            id: randomUUID(), title, area: area as LedgerInitiative['area'],
            status: status as LedgerInitiative['status'], expected_outcome: expected,
            metrics_to_watch: Array.isArray(changes.metrics_to_watch) ? coerceStringArray(changes.metrics_to_watch) : [],
            started: asString(changes.started) ?? now,
          };
          state.active_initiatives.push(item);
          appliedPatch = { ...patch, target_id: item.id, changes: item as unknown as Record<string, unknown> };
        }
        break;
      }
      case 'update_initiative': {
        if (id && state.active_initiatives.some((i) => i.id === id)) {
          const permitted = ['title', 'area', 'status', 'expected_outcome', 'metrics_to_watch', 'started'];
          const sanitized = Object.fromEntries(Object.entries(changes).filter(([key]) => permitted.includes(key)));
          if (sanitized.area && (!asString(sanitized.area) || !['monetization', 'pricing', 'site', 'app', 'growth', 'retention'].includes(sanitized.area as string))) delete sanitized.area;
          if (sanitized.status && (!asString(sanitized.status) || !['accepted', 'in_progress', 'shipped', 'measuring'].includes(sanitized.status as string))) delete sanitized.status;
          if (Array.isArray(sanitized.metrics_to_watch)) sanitized.metrics_to_watch = coerceStringArray(sanitized.metrics_to_watch);
          state.active_initiatives = patchArrayItem(state.active_initiatives, id, sanitized);
          appliedPatch = { ...patch, changes: sanitized };
        }
        break;
      }
      case 'update_monetization': {
        const permitted = ['model', 'what_to_gate', 'pricing_hypothesis', 'trigger_conditions'];
        const sanitized = Object.fromEntries(Object.entries(changes).filter(([key]) => permitted.includes(key)));
        if (Array.isArray(sanitized.trigger_conditions)) sanitized.trigger_conditions = coerceStringArray(sanitized.trigger_conditions);
        if (Object.keys(sanitized).length) {
          state.monetization_design = { ...state.monetization_design, ...sanitized } as StrategyLedgerState['monetization_design'];
          appliedPatch = { ...patch, changes: sanitized };
        }
        break;
      }
      case 'update_baseline': {
        const values = asRecord(changes.metrics_baseline ?? changes);
        const safeValues = Object.fromEntries(
          Object.entries(values).filter(([, value]) => typeof value === 'number' || typeof value === 'string'),
        ) as Record<string, number | string>;
        if (Object.keys(safeValues).length) {
          state.metrics_baseline = { ...state.metrics_baseline, ...safeValues };
          appliedPatch = { ...patch, changes: { metrics_baseline: safeValues } };
        }
        break;
      }
    }

    if (appliedPatch) applied.push(appliedPatch);
  }

  state.version = previous.version + (applied.length ? 1 : 0);
  return { state, applied };
}

function entryForPatch(weekStart: string, patch: LedgerPatch, modelUsed: string): LedgerEntry {
  const operation = patch.operation.startsWith('add_') ? 'add'
    : patch.operation.startsWith('retire_') || patch.operation.startsWith('remove_') ? 'retire'
      : patch.operation.startsWith('open_') ? 'open'
        : patch.operation.startsWith('resolve_') ? 'resolve' : 'update';
  return {
    week_start: weekStart,
    entry_type: patch.operation.includes('question') ? 'question' : 'patch',
    target: patch.target_id ?? null,
    operation,
    patch,
    evidence: patch.rationale,
    confidence: null,
    model_used: modelUsed,
  };
}

export interface LedgerUpdateInputs {
  weekStart: string;
  weekEnd: string;
  state: StrategyLedgerState;
  evidence: EvidenceDelta;
  analysis: AnalysisResult;
  brief: string;
  gitContext: ContextSource['digest'][];
  mcpContext: McpDigest | null;
  founderContext?: string | null;
  provider?: LlmProvider | string | null;
  model?: string;
}

export async function updateLedger(inputs: LedgerUpdateInputs): Promise<{
  state: StrategyLedgerState;
  editor: LedgerEditorResult;
  entries: LedgerEntry[];
  modelUsed: string;
}> {
  const resolved = resolveProvider((inputs.provider as string) ?? process.env.STRATEGY_PROVIDER ?? 'openai');
  const gitDigests = inputs.gitContext.filter((d): d is NonNullable<ContextSource['digest']> => !!d)
    .filter((d): d is Extract<ContextSource['digest'], { commits: number }> => 'commits' in d);
  const { text, toolCall, modelUsed } = await callLlm({
    provider: resolved,
    model: inputs.model,
    tools: [LEDGER_TOOL],
    toolChoice: { type: 'tool', name: 'submit_ledger_update' },
    system: [{ text: LEDGER_SYSTEM_PROMPT, cache: true }],
    messages: [{
      role: 'user',
      blocks: [{ text:
        `PROJECT BRIEF:\n${inputs.brief}\n\n` +
        `WEEK: ${inputs.weekStart} → ${inputs.weekEnd}\n\n` +
        `CURRENT LEDGER (version ${inputs.state.version}):\n${JSON.stringify(inputs.state)}\n\n` +
        `EVIDENCE DELTA:\n${JSON.stringify(inputs.evidence)}\n\n` +
        `THIS WEEK'S ANALYSIS:\n${JSON.stringify(inputs.analysis)}\n\n` +
        `${formatGitContext(gitDigests)}\n\n` +
        `${formatMcpContext(inputs.mcpContext)}\n\n` +
        `FOUNDER CONTEXT:\n${inputs.founderContext?.trim() || '(none)'}` }],
    }],
  });
  if (!toolCall || toolCall.name !== 'submit_ledger_update') {
    throw new Error(`${resolved} did not call submit_ledger_update${text ? ` (said: ${text.slice(0, 200)})` : ''}`);
  }

  const raw = toolCall.input as Partial<LedgerEditorResult>;
  const patches = Array.isArray(raw.patches) ? raw.patches as LedgerPatch[] : [];
  const { state, applied } = applyLedgerPatches(inputs.state, patches);
  const weekly = Array.isArray(raw.weekly_recommendations)
    ? raw.weekly_recommendations as Omit<StrategyRecommendation, 'id'>[] : [];
  const editor: LedgerEditorResult = {
    patches: applied,
    narrative: typeof raw.narrative === 'string' ? raw.narrative : 'No narrative returned.',
    weekly_recommendations: weekly,
    risks: coerceStringArray(raw.risks),
    experiments: Array.isArray(raw.experiments) ? raw.experiments as StrategyExperiment[] : [],
  };
  return { state, editor, entries: applied.map((patch) => entryForPatch(inputs.weekStart, patch, modelUsed)), modelUsed };
}
