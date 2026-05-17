'use client';

import { useRouter } from 'next/navigation';
import { formatWeek } from '../lib/format';

/** Shared week picker — navigates within `basePath` so the dashboard and the
 * /strategy page behave identically. */
export function WeekSelect({
  weeks,
  selected,
  basePath,
  disabled,
}: {
  weeks: string[];
  selected: string;
  basePath: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  return (
    <select
      value={selected}
      onChange={(e) => router.push(`${basePath}?week=${e.target.value}`)}
      disabled={disabled}
      className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm disabled:opacity-50"
    >
      {weeks.map((w) => (
        <option key={w} value={w}>
          Week of {formatWeek(w)}
        </option>
      ))}
    </select>
  );
}
