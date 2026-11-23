/**
 * Week-over-week search comparisons on complete days only.
 *
 * Search Console's freshest days are still filling in, and Bing's daily stats
 * usually stop a day or two before the week ends. Comparing such a week with
 * a full prior week makes the latest week look worse than it is (16–22
 * November 2026: the stored total said −20% because 22 November had 34 of its
 * roughly 200 clicks; on matched complete days the change was −11.5%).
 *
 * So the current window ends at the last complete day, and the prior window is
 * cut to the same number of days from its start.
 */

export interface DailySearchTotal {
  date: string;
  clicks: number;
  impressions: number;
}

export interface CompleteDayComparison {
  clicks: number;
  impressions: number;
  prior_clicks: number;
  prior_impressions: number;
  compared_window: {
    current: { start: string; end: string };
    prior: { start: string; end: string };
    /** First day of the reporting week left out as incomplete, or null when the whole week counted. */
    excluded_from: string | null;
  };
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayCount(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

/**
 * Sum `days` over the complete part of the reporting week and the matching
 * days of the prior week. `completeThrough` is the last day the provider has
 * complete data for (null = no signal, treat the whole week as complete).
 * Returns null when no day of the reporting week is complete yet.
 */
export function compareCompleteDays(
  days: DailySearchTotal[],
  window: { weekStart: string; weekEnd: string; priorStart: string },
  completeThrough: string | null,
): CompleteDayComparison | null {
  const { weekStart, weekEnd, priorStart } = window;
  const end = completeThrough && completeThrough < weekEnd ? completeThrough : weekEnd;
  if (end < weekStart) return null;
  const priorEnd = addDays(priorStart, dayCount(weekStart, end) - 1);

  const sum = (from: string, to: string) => days
    .filter((day) => day.date >= from && day.date <= to)
    .reduce((acc, day) => ({ clicks: acc.clicks + day.clicks, impressions: acc.impressions + day.impressions }), { clicks: 0, impressions: 0 });
  const current = sum(weekStart, end);
  const prior = sum(priorStart, priorEnd);

  return {
    clicks: current.clicks,
    impressions: current.impressions,
    prior_clicks: prior.clicks,
    prior_impressions: prior.impressions,
    compared_window: {
      current: { start: weekStart, end },
      prior: { start: priorStart, end: priorEnd },
      excluded_from: end < weekEnd ? addDays(end, 1) : null,
    },
  };
}
