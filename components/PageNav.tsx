'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Insights ↔ Strategy switch that preserves the selected week. */
export function PageNav({ week }: { week: string }) {
  const path = usePathname() ?? '/';
  const onStrategy = path.startsWith('/strategy');

  const cls = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${
      active
        ? 'bg-neutral-800 text-neutral-100'
        : 'text-neutral-400 hover:text-neutral-200'
    }`;

  return (
    <nav className="flex gap-1 rounded-lg border border-neutral-800 bg-neutral-900/50 p-1">
      <Link href={`/?week=${week}`} className={cls(!onStrategy)}>
        Insights
      </Link>
      <Link href={`/strategy?week=${week}`} className={cls(onStrategy)}>
        Strategy
      </Link>
    </nav>
  );
}
