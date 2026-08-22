const DEFAULT_REPORTING_TIME_ZONE = 'Asia/Bangkok';

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function reportingDate(now: Date, timeZone: string): Date {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
}

export function getCurrentWeek(
  now: Date = new Date(),
  timeZone = process.env.REPORTING_TIME_ZONE?.trim() || DEFAULT_REPORTING_TIME_ZONE,
): { weekStart: string; weekEnd: string; daysElapsed: number } {
  const today = reportingDate(now, timeZone);
  const day = today.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - daysSinceMonday);
  return {
    weekStart: formatDate(monday),
    weekEnd: formatDate(today),
    daysElapsed: daysSinceMonday + 1,
  };
}

export function getDefaultWeek(): { weekStart: string; weekEnd: string } {
  const current = getCurrentWeek();
  return { weekStart: current.weekStart, weekEnd: current.weekEnd };
}

export function getWeekFromArg(weekStartArg: string): { weekStart: string; weekEnd: string } {
  const start = new Date(`${weekStartArg}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) throw new Error(`Invalid week date: ${weekStartArg}`);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { weekStart: formatDate(start), weekEnd: formatDate(end) };
}
