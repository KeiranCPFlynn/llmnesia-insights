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
}

export interface Finding {
  metric: string;
  observation: string;
  severity: 'info' | 'watch' | 'concern' | 'critical';
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
  summary: string;
  findings: Finding[];
  action_items: ActionItem[];
  open_threads: Thread[];
  resolved_threads: ResolvedThread[];
}

export interface WeeklyInsight {
  id?: string;
  week_start: string;
  week_end: string;
  metrics_snapshot: MetricsSnapshot;
  summary: string;
  findings: Finding[];
  action_items: ActionItem[];
  open_threads: Thread[];
  resolved_threads: ResolvedThread[];
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
