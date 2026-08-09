export interface GA4PropertyMetrics {
  property: 'website' | 'extension';
  users: { total: number; new_users: number; returning: number };
  sessions: number;
  acquisition: Record<string, number>;
  top_pages: Array<{ path: string; views: number }>;
  geo: Record<string, number>;
  devices: Record<string, number>;
  /**
   * Website property only — counts of named conversion events the site emits
   * via `trackEvent` (install_click, email_signup, contact_submit). Missing
   * keys = zero. Use install_click as the mid-funnel CTA conversion: pair with
   * `sessions` for CTA click rate, and with the extension property's
   * `store_installs` for click-to-install drop.
   */
  conversions?: Record<string, number>;
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
  // wau: distinct installs with a user_initiated event in the week (new, intent-
  // based). wau_any_event: the OLD definition (any event) reported alongside for
  // one month so the series discontinuity is visible — remove ~2026-08-10.
  // total_searches counts search_submitted, never the keystroke search_performed.
  engagement: { wau: number; wau_any_event: number; total_searches: number; searches_per_wau: number };
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
   * Correlates finishing the initial backfill (`backfill_first_completed`) with
   * subsequent search engagement (`search_submitted` after completion). Tests
   * directly whether search activity rises after a user's historical import
   * finishes. `rate` = share of backfilled installs that searched afterward.
   */
  backfill_correlation: {
    backfilled_installs: number;
    searched_after: number;
    rate: number;
    searches_per_backfilled_install: number;
  };
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
  /**
   * Top-of-funnel search visibility for llmnesia.com — combined Google Search
   * Console + Bing Webmaster Tools (impressions, queries, ranking). The demand
   * layer GA4/PostHog can't see: people who saw the site in search before any
   * click. Optional — absent when the growth tables / search data aren't set
   * up; the pipeline omits it rather than failing.
   */
  search_performance?: SearchPerformanceDigest;
  /**
   * Present only on a mid-week "week-to-date" run (the "Update all" button).
   * Marks the snapshot as an in-progress partial week so the analysis frames it
   * by run-rate rather than comparing incomplete totals to prior full weeks, and
   * the dashboard can badge it. Absent on normal completed-week runs.
   */
  partial?: { as_of: string; days_elapsed: number };
}

/** One search engine's aggregate for the insights week, with prior-week comparison. */
export interface SearchSourceDigest {
  clicks: number;
  impressions: number;
  /** 0–1, clicks/impressions. */
  ctr: number;
  /** Impression-weighted average SERP position. */
  avg_position: number;
  prior_clicks: number;
  prior_impressions: number;
}

/** One query's combined clicks/impressions across the contributing engines. */
export interface SearchQueryRow {
  query: string;
  impressions: number;
  clicks: number;
  /** Which engines this query appeared in this week. */
  sources: ('google' | 'bing')[];
}

export interface SearchPerformanceDigest {
  site: string;
  window: { start: string; end: string };
  prior_window: { start: string; end: string };
  /** Null when that engine had no rows this week. */
  google: SearchSourceDigest | null;
  bing: SearchSourceDigest | null;
  combined: { clicks: number; impressions: number; ctr: number };
  top_queries_by_impressions: SearchQueryRow[];
  top_queries_by_clicks: SearchQueryRow[];
}

export type DataSource = 'PostHog' | 'GA4' | 'Search' | 'Combined';

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
 * A PERSISTENT, cross-week caveat/context note — the founder's "known facts"
 * store. Unlike a `Correction` (scoped to one week's row), an active standing
 * caveat is injected into EVERY week's analysis so a confirmed non-issue (e.g.
 * "the PostHog vs GA4 install gap is expected, not a bug") is never re-flagged
 * from scratch. Shares the `Correction` shape so it flows through the same
 * caveat/context prompt machinery unchanged; `active` lets one be retired
 * without losing the record.
 */
export interface StandingCaveat {
  id: string;
  created_at: string;
  updated_at?: string;
  /** 'caveat' = this data is wrong/skewed; 'context' = real-world info the data can't show. */
  kind: 'caveat' | 'context';
  affected_metric: string;
  note: string;
  /** Inactive caveats are kept for the record but not injected into analysis. */
  active: boolean;
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

export interface ChatAttachment {
  /** Original filename, shown as a chip and labelled to the model. */
  name: string;
  /** Raw text content (CSV/TSV/JSON/TXT/MD) the API can't fetch itself. */
  content: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: string;
  /**
   * User-attached text files (e.g. GA4 CSV exports). Persisted in the saved
   * transcript and re-sent on every turn so the model keeps the data in context.
   */
  attachments?: ChatAttachment[];
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
  | 'llmnesia-site njs'
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
  /**
   * Snapshot of the recommendation's title at decision time. Recommendation
   * ids are only stable within one generation (regenerating mints new ids),
   * so this is what lets a decision stay readable/traceable in history after
   * the live recommendation it was made against is gone.
   */
  title?: string;
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
  /**
   * Current objective for this week's Strategy page. Separate from the
   * generated strategy so the founder can steer/regenerate without editing
   * model output directly.
   */
  strategy_goal?: string | null;
  strategy_decisions?: StrategyDecision[];
  strategy_chat?: ChatMessage[];
  /** Separate PM discussion threads keyed by strategy recommendation id. */
  strategy_recommendation_chats?: Record<string, ChatMessage[]>;
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

// --- Traffic Growth Planner ---

/**
 * A property the planner tracks. Sites are configured in Supabase (the `sites`
 * table) rather than in code so adding a new site is just a row insert.
 * `gsc_property` is the verified Search Console property string
 * (e.g. `sc-domain:llmnesia.com` for a Domain property, or
 * `https://llmnesia.com/` for a URL-prefix property).
 */
export interface Site {
  id: string;
  name: string;
  root_url: string;
  gsc_property: string;
  sitemap_url?: string | null;
  /** Optional per-site override for the project brief that grounds the LLM. */
  brief_override?: string | null;
  /**
   * Current objective for the Growth planner. This is deliberately separate
   * from the business/monetization Strategy page; it tells /growth what kind
   * of organic-search work matters now.
   */
  growth_goal?: string | null;
  /**
   * Code repo this site's content lives in (folder name on disk, e.g.
   * "llmnesia-site njs"). Surfaced to the LLM so handoff prompts can name
   * the right repo for the founder to open in Claude Code / Codex. Null
   * means the LLM should leave the repo as `<your-site-repo>` in prompts.
   */
  repo?: string | null;
  /**
   * The exact URL registered in Bing Webmaster Tools (e.g. `https://llmnesia.com/`).
   * Defaults to `root_url` when null — only set this when they differ.
   */
  bing_site_url?: string | null;
  enabled: boolean;
  created_at?: string;
}

/**
 * One row of GSC `searchAnalytics` data — query × page × date × country × device.
 * Append-only; the sync upserts on the full PK. CTR and position are stored
 * verbatim so we can compute trends without recomputing from clicks/impressions
 * (which can drop to zero for a row that previously had data).
 */
export interface GSCRow {
  site_id: string;
  query: string;
  page: string;
  date: string;
  country: string;
  device: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  synced_at?: string;
}

/**
 * One row of Bing Webmaster Tools `GetKeywordStats` data — query × date × country.
 * Page-level breakdown is not available from this endpoint; `position` is
 * AvgImpressionPosition (rank in the SERP, equivalent to GSC `position`).
 */
export interface BingRow {
  site_id: string;
  query: string;
  date: string;
  country: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  synced_at?: string;
}

export type GrowthOpportunityType =
  | 'near_win'
  | 'low_ctr'
  | 'gap'
  | 'declining'
  | 'proven_expander';

/**
 * Why an opportunity was surfaced — the verbatim numbers the score is built
 * from. Rendered in the UI so a human can sanity-check the recommendation
 * rather than trust an opaque score.
 */
export interface GrowthOpportunityEvidence {
  /** Rolling window (last 28d ending `as_of`) the detector saw. */
  window_days: number;
  as_of: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
  /** Same numbers from the prior window (when relevant — e.g. declining). */
  prior?: {
    impressions: number;
    clicks: number;
    ctr: number;
    position: number;
  };
  /**
   * Human-readable bullets explaining *why* this passed the detector
   * (e.g. "position 14.2, 312 impressions in 28d, current page ranks weakly").
   */
  reasons: string[];
}

export interface GrowthOpportunity {
  id: string;
  site_id: string;
  week_start: string;
  type: GrowthOpportunityType;
  target_query?: string | null;
  target_page?: string | null;
  evidence: GrowthOpportunityEvidence;
  /** 0–100 transparent weighted score. Higher = more leverage. */
  score: number;
  /**
   * Which search engine's rows this was detected from. Absent on rows
   * written before Bing detection existed — treat missing as 'google'.
   * Bing rows carry no page dimension (GetQueryStats is query-only), so
   * `declining`/`proven_expander` (page-keyed) never fire for source
   * 'bing', and `target_page` is typically null.
   */
  source?: 'google' | 'bing';
  created_at?: string;
}

export type GrowthActionType =
  | 'create'
  | 'improve'
  | 'title_meta'
  | 'add_section'
  | 'internal_link'
  | 'fix_indexing'
  | 'refresh'
  | 'supporting_cluster'
  | 'distribute'
  | 'monitor';

export type GrowthActionStatus =
  | 'idea'
  | 'planned'
  | 'briefed'
  | 'drafted'
  | 'actioned'
  | 'published'
  | 'updated'
  | 'needs_adjustment'
  | 'ignored'
  | 'completed'
  | 'monitoring';

export interface GrowthHandoff {
  /** Tool-agnostic, repo-targeted prompt to paste into Claude Code / Codex. */
  coding_agent_prompt?: string;
  /** Non-code steps the founder does themselves (e.g. submit a sitemap). */
  founder_steps?: string[];
}

/**
 * One recommended action inside a weekly plan. The LLM produces these; humans
 * accept them, which materialises a `growth_actions` row tied back via `id`.
 */
export interface GrowthRecommendation {
  id: string;
  action_type: GrowthActionType;
  /** When set, ties this back to a detected opportunity for traceability. */
  opportunity_id?: string | null;
  target_query?: string | null;
  target_page?: string | null;
  title: string;
  /** What the founder should do, concretely. */
  recommendation: string;
  /** Why this is worth doing — tied to the evidence. */
  rationale: string;
  /** Which numbers should move and roughly how much. */
  expected_impact: string;
  effort: 'S' | 'M' | 'L';
  confidence: 'low' | 'medium' | 'high';
  /** Short summary of the GSC/GA4 data behind the call. */
  source_data: string;
  /** Concrete next step (e.g. "Draft H2 on X", "Add link from /a to /b"). */
  next_step: string;
  /**
   * Repo to open for code work (folder name on disk, e.g. "llmnesia-site
   * njs"), or "none" for ops-only work. Comes from `sites.repo` so it stays
   * site-aware.
   */
  target_repo?: string | null;
  /**
   * One-click handoff: a self-contained coding-agent prompt and/or a founder
   * checklist. Render the prompt as a Copy button + preview; render the
   * checklist as an ordered list.
   */
  handoff?: GrowthHandoff;
}

/** Counts of each action type the plan asked for — e.g. balance check. */
export interface GrowthPlanBalance {
  create: number;
  improve: number;
  link: number;
  fix: number;
  distribute: number;
  measure: number;
}

export interface GrowthPlan {
  thesis: string;
  balance: GrowthPlanBalance;
  recommendations: GrowthRecommendation[];
  risks: string[];
  experiments: { hypothesis: string; measure: string }[];
  /** Persisted founder/SEO-planner discussion for this site and week. */
  chat?: ChatMessage[];
  /** Separate discussion threads keyed by recommendation id. */
  recommendation_chats?: Record<string, ChatMessage[]>;
  model_used: string;
  generated_at: string;
}

/**
 * A materialised recommendation — created when the founder accepts a plan
 * item. The action is what carries the workflow status, published URL, and
 * post-publishing performance follow-up.
 */
export interface GrowthAction {
  id: string;
  site_id: string;
  week_start: string;
  /** Recommendation this was created from (null = free-form action). */
  recommendation_id?: string | null;
  opportunity_id?: string | null;
  action_type: GrowthActionType;
  target_query?: string | null;
  target_page?: string | null;
  suggested_title?: string | null;
  /** Lazily filled by /api/growth/brief — null until "Generate brief" clicked. */
  brief?: GrowthBrief | null;
  status: GrowthActionStatus;
  status_updated_at: string;
  published_url?: string | null;
  follow_up_date?: string | null;
  /** Free-form founder note (why ignored, draft URL, etc.). */
  note?: string | null;
  created_at?: string;
}

/** Lightweight content brief generated on demand for one recommendation. */
export interface GrowthBrief {
  primary_query: string;
  supporting_queries: string[];
  suggested_title: string;
  search_intent: string;
  format: string;
  angle: string;
  sections: string[];
  internal_links: { from?: string; to?: string; anchor?: string }[];
  related_pages: string[];
  reason: string;
  model_used: string;
  generated_at: string;
}

// --- Strategy Ledger (Stateful Strategy Ledger) ---

export type HypothesisBetType =
  | 'growth'
  | 'activation'
  | 'retention'
  | 'monetization'
  | 'product';

export type HypothesisConfidence = 'low' | 'medium' | 'high';

export interface LedgerHypothesis {
  id: string;
  claim: string;
  bet_type: HypothesisBetType;
  confidence: HypothesisConfidence;
  evidence_for: string[];
  evidence_against: string[];
  /** What would disprove this hypothesis. */
  falsification: string;
  first_proposed: string;
  last_reviewed: string;
}

export interface LedgerConstraint {
  id: string;
  constraint: string;
  source: 'founder' | 'data' | 'technical';
}

export interface OpenQuestion {
  id: string;
  question: string;
  first_asked: string;
  context: string;
}

export type InitiativeStatus =
  | 'accepted'
  | 'in_progress'
  | 'shipped'
  | 'measuring';

export interface LedgerInitiative {
  id: string;
  title: string;
  area: StrategyArea;
  status: InitiativeStatus;
  expected_outcome: string;
  metrics_to_watch: string[];
  started: string;
}

export interface MonetizationDesign {
  model: string;
  what_to_gate: string;
  pricing_hypothesis: string;
  trigger_conditions: string[];
}

/**
 * The single living strategy document. Stored as one row in `strategy_ledger`
 * (singleton, id=1). The LLM reads this, proposes patches, and the pipeline
 * applies them — so the strategy evolves over time instead of resetting each
 * week.
 */
export interface StrategyLedgerState {
  north_star: string;
  stage: string;
  stage_triggers: string[];

  active_hypotheses: LedgerHypothesis[];
  constraints: LedgerConstraint[];
  open_questions: OpenQuestion[];

  monetization_design: MonetizationDesign;
  active_initiatives: LedgerInitiative[];

  /** Last-known values for key metrics — quick reference without querying weekly_insights. */
  metrics_baseline: Record<string, number | string>;

  version: number;
}

// --- Evidence Deltas ---

export type DeltaDirection = 'up' | 'down' | 'flat';

/** One metric's change between two weeks. */
export interface MetricDelta {
  current: number;
  prior: number;
  change: number;
  /** Percentage change (0–1 range, null when prior was 0). */
  pct_change: number | null;
  direction: DeltaDirection;
}

/**
 * Pre-computed structured diff between current and prior MetricsSnapshot.
 * The LLM reasons from this instead of mentally diffing raw JSON blobs.
 */
export interface EvidenceDelta {
  week_start: string;
  week_end: string;
  prior_week_start: string | null;
  /** Set for an in-progress weekly refresh; totals are not comparable to a full week. */
  partial?: MetricsSnapshot['partial'];

  installs: MetricDelta;
  activation_rate: MetricDelta;
  retention_w1: MetricDelta;
  retention_w4: MetricDelta;
  wau: MetricDelta;
  searches_per_wau: MetricDelta;
  click_rate: MetricDelta;
  zero_result_rate: MetricDelta;
  email_capture_rate: MetricDelta;
  website_sessions: MetricDelta;
  store_installs: MetricDelta;

  search_performance: {
    google: { impressions: MetricDelta; clicks: MetricDelta } | null;
    bing: { impressions: MetricDelta; clicks: MetricDelta } | null;
  };

  /**
   * Human-readable summary of the most significant changes — the narrative
   * the LLM should anchor on. Auto-generated by computeEvidenceDelta.
   */
  notable_changes: Array<{
    metric: string;
    what_changed: string;
    magnitude: string;
  }>;
}

/** A persisted delta together with the source snapshot used to calculate it. */
export interface EvidenceDeltaRecord {
  delta: EvidenceDelta;
  raw_snapshot: MetricsSnapshot;
}

// --- Ledger Entries (audit trail) ---

export type LedgerEntryType =
  | 'patch'
  | 'evidence'
  | 'decision'
  | 'question'
  | 'context';

export type LedgerOperation =
  | 'add'
  | 'update'
  | 'retire'
  | 'escalate'
  | 'open'
  | 'resolve';

export interface LedgerEntry {
  id?: string;
  week_start: string;
  entry_type: LedgerEntryType;
  /** Which part of the ledger was affected (e.g. 'active_hypotheses.abc123'). */
  target: string | null;
  operation: LedgerOperation;
  patch: unknown | null;
  evidence: string | null;
  confidence: HypothesisConfidence | null;
  model_used: string;
  created_at?: string;
}

// --- Ledger Patches (LLM output) ---

export type PatchOperation =
  | 'add_hypothesis'
  | 'update_hypothesis'
  | 'retire_hypothesis'
  | 'add_constraint'
  | 'remove_constraint'
  | 'update_north_star'
  | 'update_stage'
  | 'open_question'
  | 'resolve_question'
  | 'add_initiative'
  | 'update_initiative'
  | 'update_monetization'
  | 'update_baseline';

export interface LedgerPatch {
  operation: PatchOperation;
  /** The id of the entity being updated/retired/resolved. Null for add operations. */
  target_id?: string | null;
  /** The fields to change or the new entity to add. Shape depends on operation. */
  changes: Record<string, unknown>;
  /** Why this patch is being proposed — cite specific evidence. */
  rationale: string;
}

/**
 * The LLM's output from the Ledger Editor brain. Extends the weekly strategy
 * output with structured patches that evolve the persistent ledger.
 */
export interface LedgerEditorResult {
  patches: LedgerPatch[];
  /** 2-3 sentences: what the evidence says this week and where strategy is heading. */
  narrative: string;
  /** This week's tactical recommendations (ephemeral, separate from the ledger). */
  weekly_recommendations: Omit<StrategyRecommendation, 'id'>[];
  risks: string[];
  experiments: StrategyExperiment[];
}

// --- Context Sources ---

export type ContextSourceType = 'git' | 'mcp' | 'manual';

/** Structured summary of git activity in a repo since the last ledger update. */
export interface GitDigest {
  repo: string;
  /** Short folder name for display (e.g. "LLMnesia"). */
  label: string;
  since: string;
  commits: number;
  /** Commit messages grouped by rough category. */
  features: string[];
  fixes: string[];
  other: string[];
  /** The most notable commits (hand-picked by heuristic or just the first few). */
  notable: string[];
}

/** Structured summary of relevant MCP conversations since the last update. */
export interface McpDigest {
  since: string;
  conversations: number;
  /** Key decisions the founder made in conversations. */
  decisions: string[];
  /** Constraints or preferences the founder stated. */
  constraints: string[];
  /** Ideas or directions discussed. */
  ideas: string[];
}

export interface ContextSource {
  id?: string;
  week_start: string;
  source_type: ContextSourceType;
  repo: string | null;
  digest: GitDigest | McpDigest | Record<string, unknown>;
  created_at?: string;
}
