'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { calendarWeekStart } from '../lib/week';

const NAV_ITEMS = [
  {
    key: 'insights',
    label: 'Insights',
    description: 'Read the weekly signal',
    path: '/',
  },
  {
    key: 'strategy',
    label: 'Strategy',
    description: 'Decide what to do next',
    path: '/strategy',
  },
  {
    key: 'growth',
    label: 'Growth',
    description: 'Plan organic acquisition',
    path: '/growth',
  },
] as const;

/** Primary workspace navigation. The selected week follows the user between tabs. */
export function PageNav({
  week,
  variant = 'tabs',
}: {
  week: string;
  variant?: 'tabs' | 'rail';
}) {
  const path = usePathname() ?? '/';
  const activeKey = path.startsWith('/strategy')
    ? 'strategy'
    : path.startsWith('/growth')
      ? 'growth'
      : 'insights';

  // All workspaces share this canonical Monday. Each route resolves it to its
  // own stored record, whose exact week_start may differ.
  const period = calendarWeekStart(week);

  return (
    <nav
      aria-label="Primary"
      className={variant === 'rail' ? 'space-y-1' : 'grid grid-cols-3 gap-1 rounded-lg bg-white/[0.035] p-1'}
    >
      {NAV_ITEMS.map((item) => {
        const active = activeKey === item.key;
        const href =
          item.path === '/'
            ? `/?period=${period}`
            : item.path === '/strategy'
              ? `/strategy?period=${period}`
              : `/growth?period=${period}`;
        return (
          <Link
            key={item.key}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={
              variant === 'rail'
                ? `group block rounded-xl border px-3 py-3 ${
                    active
                      ? 'border-emerald-400/20 bg-emerald-400/[0.09] text-neutral-50'
                      : 'border-transparent text-neutral-400 hover:border-white/[0.06] hover:bg-white/[0.035] hover:text-neutral-200'
                  }`
                : `rounded-md px-2.5 py-2 text-center text-sm font-medium ${
                    active
                      ? 'bg-neutral-100 text-neutral-950 shadow-sm'
                      : 'text-neutral-400 hover:bg-white/[0.05] hover:text-neutral-200'
                  }`
            }
          >
            <span className="flex items-center gap-2">
              {variant === 'rail' && (
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    active ? 'bg-emerald-400' : 'bg-neutral-700 group-hover:bg-neutral-500'
                  }`}
                />
              )}
              <span>{item.label}</span>
            </span>
            {variant === 'rail' && (
              <span className="mt-1 block pl-3.5 text-xs font-normal text-neutral-600">
                {item.description}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
