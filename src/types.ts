export interface GA4PropertyMetrics {
  property: 'website' | 'extension';
  users: { total: number; new_users: number; returning: number };
  sessions: number;
  acquisition: Record<string, number>;
  top_pages: Array<{ path: string; views: number }>;
  geo: Record<string, number>;
  devices: Record<string, number>;
  /**
   * Extension property only — the Chrome Web Store `install` event (a real
   * store install, distinct from PostHog `extension_installed` which fires on
   * in-product first run).
   */
  store_installs?: { events: number; users: number };
}

export interface GA4Metrics {
  website: GA4PropertyMetrics;
  extension?: GA4PropertyMetrics;
}

export interface MetricsSnapshot {
  week_start: string;
  week_end: string;
  installs: { total: number };
  activation: { installs: number; activated_within_24h: number; rate: number };
  retention: {
    w1_rolling: { active_prior_week: number; returned: number; rate: number };
    w4_rolling: { active_4w_ago: number; returned: number; rate: number };
  };
  engagement: { wau: number; total_searches: number; searches_per_wau: number };
  search_quality: {
    searches: number;
    clicks: number;
    zero_results: number;
    click_rate: number;
    zero_result_rate: number;
  };
  platforms: {
    searches: Record<string, number>;
    clicks: Record<string, number>;
  };
  email_capture: { wau: number; identified: number; rate: number };
  /**
   * Daily unique users per extension version (from PostHog
   * `properties.extension_version`). `daily` is day-by-day for tracking a
   * rollout (a fix's version should climb while old versions decay);
   * `weekly` is the week's unique users per version.
   */
  version_adoption: {
    weekly: Array<{ version: string; users: number }>;
    daily: Array<{ date: string; version: string; users: number }>;
  };
  ga4: GA4Metrics;
}

export type DataSource = 'PostHog' | 'GA4' | 'Combined';

export interface Finding {
  metric: string;
  observation: string;
  severity: 'info' | 'watch' | 'concern' | 'critical';
  source?: DataSource;
}

export interface ActionItem {
  action: string;
  rationale: string;
  priority: 'high' | 'medium' | 'low';
}

export interface Thread {
  thread: string;
  first_flagged: string;
  current_status: string;
}

export interface ResolvedThread {
  thread: string;
  resolution: string;
}

export interface AnalysisResult {
  headline: string;
  summary: string;
  findings: Finding[];
  action_items: ActionItem[];
  open_threads: Thread[];
  resolved_threads: ResolvedThread[];
}

export interface Correction {
  id: string;
  created_at: string;
  /** 'caveat' = this data is wrong/skewed; 'context' = real-world info the data can't show. */
  kind: 'caveat' | 'context';
  /** Metric/area for a caveat, or a short label for a context note. */
  affected_metric: string;
  note: string;
  /** Position in the week's chat thread when this was accepted (audit link). */
  chat_index?: number;
  /** The founder message that led to this correction (audit link). */
  source_excerpt?: string;
}

/**
 * A point-in-time snapshot of the report taken *before* a correction
 * regenerated it. Append-only history so the pre-change analysis is never
 * lost — the audit trail for chat-driven data changes.
 */
export interface Revision {
  revised_at: string;
  /** The correction whose acceptance superseded this analysis. */
  correction_id: string;
  /** The model that produced this (now-superseded) analysis. */
  model_used: string;
  headline?: string;
  summary: string;
  findings: Finding[];
  action_items: ActionItem[];
  open_threads: Thread[];
  resolved_threads: ResolvedThread[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: string;
}

// --- PM / revenue strategist (second-stage business brain) ---

export type StrategyArea =
  | 'monetization'
  | 'pricing'
  | 'site'
  | 'app'
  | 'growth'
  | 'retention';

/** Which repo a recommendation's coding work targets (for the handoff prompt). */
export type StrategyTargetRepo =
  | 'llmnesia-site'
  | 'LLMnesia'
  | 'llmnesia-insights'
  | 'none';

export interface StrategyHandoff {
  /** Tool-agnostic, repo-targeted prompt to paste into Claude Code / Codex. */
  coding_agent_prompt?: string;
  /** Non-code steps for the founder (e.g. Stripe setup, pricing copy). */
  founder_steps?: string[];
}

export interface StrategyRecommendation {
  id: string;
  title: string;
  area: StrategyArea;
  target_repo: StrategyTargetRepo;
  recommendation: string;
  rationale: string;
  expected_impact: string;
  effort: 'S' | 'M' | 'L';
  confidence: 'low' | 'medium' | 'high';
  metrics_to_watch: string[];
  handoff: StrategyHandoff;
}

export interface StrategyExperiment {
  hypothesis: string;
  measure: string;
}

export interface StrategyResult {
  /** The single revenue idea this week's strategy is built around. */
  thesis: string;
  monetization: {
    model: string;
    what_to_gate: string;
    pricing_hypothesis: string;
  };
  recommendations: StrategyRecommendation[];
  risks: string[];
  experiments: StrategyExperiment[];
  model_used: string;
  generated_at: string;
}

export interface StrategyDecision {
  recommendation_id: string;
  status: 'accepted' | 'deferred' | 'rejected' | 'shipped';
  note?: string;
  /** What actually happened, recorded when marking shipped. */
  outcome?: string;
  decided_at: string;
}

export interface WeeklyInsight {
  id?: string;
  week_start: string;
  week_end: string;
  metrics_snapshot: MetricsSnapshot;
  headline?: string;
  summary: string;
  findings: Finding[];
  action_items: ActionItem[];
  open_threads: Thread[];
  resolved_threads: ResolvedThread[];
  corrections?: Correction[];
  revisions?: Revision[];
  chat?: ChatMessage[];
  strategy?: StrategyResult;
  strategy_decisions?: StrategyDecision[];
  strategy_chat?: ChatMessage[];
  model_used: string;
  created_at?: string;
}

export interface HistoricalInsight {
  week_start: string;
  summary: string;
  findings: Finding[];
  action_items: ActionItem[];
  open_threads: Thread[];
}
