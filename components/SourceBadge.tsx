import type { DataSource } from '../src/types.js';

const STYLE: Record<DataSource, string> = {
  PostHog: 'bg-indigo-950 text-indigo-300 border-indigo-800',
  GA4: 'bg-orange-950 text-orange-300 border-orange-800',
  Combined: 'bg-teal-950 text-teal-300 border-teal-800',
};

const WHAT: Record<DataSource, string> = {
  PostHog: 'in-product usage',
  GA4: 'website / store traffic',
  Combined: 'PostHog + GA4',
};

/** Tiny pill that makes it obvious where a number or finding came from. */
export function SourceBadge({ source, title = false }: { source: DataSource; title?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STYLE[source]}`}
      title={WHAT[source]}
    >
      {source}
      {title && <span className="ml-1 font-normal opacity-70">· {WHAT[source]}</span>}
    </span>
  );
}
