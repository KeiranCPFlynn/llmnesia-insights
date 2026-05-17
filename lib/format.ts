export const pct = (n: number | undefined) =>
  n == null ? '—' : `${(n * 100).toFixed(1)}%`;

export const num = (n: number | undefined) =>
  n == null ? '—' : n.toLocaleString('en-GB');

export function delta(curr?: number, prev?: number): { label: string; dir: 'up' | 'down' | 'flat' } {
  if (curr == null || prev == null || prev === 0) return { label: '', dir: 'flat' };
  const change = ((curr - prev) / prev) * 100;
  if (Math.abs(change) < 0.5) return { label: '0%', dir: 'flat' };
  return {
    label: `${change > 0 ? '+' : ''}${change.toFixed(0)}%`,
    dir: change > 0 ? 'up' : 'down',
  };
}

export function formatWeek(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  if (isNaN(d.getTime())) return weekStart; // threads may carry free-text dates
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
