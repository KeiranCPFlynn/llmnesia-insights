import type { WeeklyInsight } from '../src/types.js';

export function calendarWeekStart(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(value.getTime())) return date;
  const day = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() - ((day + 6) % 7));
  return value.toISOString().slice(0, 10);
}

/**
 * Pick the displayed week from `?week=` (falling back to the latest), plus the
 * previous week for deltas. Shared by the dashboard and the /strategy page so
 * both navigate identically.
 */
export function selectWeek(
  insights: WeeklyInsight[],
  week?: string,
  period?: string,
): { weeks: string[]; current: WeeklyInsight; prev: WeeklyInsight | undefined } {
  const weeks = insights.map((i) => i.week_start);
  const exactIndex = week ? weeks.indexOf(week) : -1;
  let periodIndex = -1;
  if (exactIndex === -1 && period) {
    for (let i = insights.length - 1; i >= 0; i -= 1) {
      if (calendarWeekStart(insights[i].week_start) === period) {
        periodIndex = i;
        break;
      }
    }
  }
  const idx = exactIndex !== -1 ? exactIndex : periodIndex !== -1 ? periodIndex : weeks.length - 1;
  const current = insights[idx === -1 ? weeks.length - 1 : idx];
  const prev = insights[weeks.indexOf(current.week_start) - 1];
  return { weeks, current, prev };
}
