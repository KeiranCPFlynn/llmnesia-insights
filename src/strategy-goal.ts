import type { WeeklyInsight } from './types.js';

/**
 * Stage-appropriate default so the Strategy goal is never empty on a fresh
 * project. Deliberately growth/activation-first (see the strategy prompt's
 * "don't default to monetization" guidance). Only used until the founder sets a
 * real goal or "Suggest goal" generates one — after that, carry-forward wins.
 */
export const DEFAULT_STRATEGY_GOAL =
  'Grow the user base: focus this week on qualified installs, activation, and early retention, and on learning what users value. Treat monetization as design-ahead only — do not recommend paywalls or pricing experiments yet.';

export type StrategyGoalSource = 'own' | 'inherited' | 'default';

/** First non-empty trimmed candidate (in priority order), else the default. */
export function pickStrategyGoal(...candidates: (string | null | undefined)[]): string {
  for (const c of candidates) {
    const t = c?.trim();
    if (t) return t;
  }
  return DEFAULT_STRATEGY_GOAL;
}

/**
 * The goal that should steer a given week's strategy. A week with no saved goal
 * inherits the most recent prior week that had one, so setting a goal once
 * sticks (across gaps) until the founder changes it; falls back to the default
 * when nothing has ever been set.
 *
 * @param insights all weeks, oldest → newest
 * @param weekStart the week being viewed
 */
export function resolveStrategyGoal(
  insights: WeeklyInsight[],
  weekStart: string,
): { goal: string; source: StrategyGoalSource } {
  const idx = insights.findIndex((i) => i.week_start === weekStart);
  const upto = idx === -1 ? insights.length - 1 : idx;
  for (let i = upto; i >= 0; i -= 1) {
    const g = insights[i].strategy_goal?.trim();
    if (g) return { goal: g, source: i === upto ? 'own' : 'inherited' };
  }
  return { goal: DEFAULT_STRATEGY_GOAL, source: 'default' };
}
