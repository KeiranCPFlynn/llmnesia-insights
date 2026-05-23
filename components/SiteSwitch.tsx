'use client';

import Link from 'next/link';
import type { Site } from '../src/types.js';

/**
 * Pill switch between the configured sites. Mirrors PageNav's visual idiom so
 * the multi-site picker reads as "first-class navigation", not a buried filter.
 */
export function SiteSwitch({
  sites,
  selectedId,
  week,
}: {
  sites: Site[];
  selectedId: string;
  week: string;
}) {
  if (sites.length <= 1) return null;
  return (
    <nav className="flex flex-wrap gap-1 rounded-lg border border-neutral-800/80 bg-neutral-950/70 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.16)]">
      {sites.map((s) => {
        const active = s.id === selectedId;
        return (
          <Link
            key={s.id}
            href={`/growth?site=${s.id}&week=${week}`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              active
                ? 'bg-neutral-100 text-neutral-950 shadow-sm'
                : 'text-neutral-400 hover:bg-neutral-800/70 hover:text-neutral-200'
            }`}
          >
            {s.name}
          </Link>
        );
      })}
    </nav>
  );
}
