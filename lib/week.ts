import type { WeeklyInsight } from '../src/types.js';

/**
 * Pick the displayed week from `?week=` (falling back to the latest), plus the
 * previous week for deltas. Shared by the dashboard and the /strategy page so
 * both navigate identically.
 */
export function selectWeek(
  insights: WeeklyInsight[],
  week?: string,
): { weeks: string[]; current: WeeklyInsight; prev: WeeklyInsight | undefined } {
  const weeks = insights.map((i) => i.week_start);
  const idx = week ? weeks.indexOf(week) : weeks.length - 1;
  const current = insights[idx === -1 ? weeks.length - 1 : idx];
  const prev = insights[weeks.indexOf(current.week_start) - 1];
  return { weeks, current, prev };
}
