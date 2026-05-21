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
        ? 'bg-neutral-100 text-neutral-950 shadow-sm'
        : 'text-neutral-400 hover:bg-neutral-800/70 hover:text-neutral-200'
    }`;

  return (
    <nav className="flex gap-1 rounded-lg border border-neutral-800/80 bg-neutral-950/70 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.16)]">
      <Link href={`/?week=${week}`} className={cls(!onStrategy)}>
        Insights
      </Link>
      <Link href={`/strategy?week=${week}`} className={cls(onStrategy)}>
        Strategy
      </Link>
    </nav>
  );
}
