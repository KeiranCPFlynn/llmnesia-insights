import type { DataSource } from '../src/types.js';

const STYLE: Record<DataSource, string> = {
  PostHog: 'bg-indigo-500/10 text-indigo-200 border-indigo-500/30',
  GA4: 'bg-orange-500/10 text-orange-200 border-orange-500/30',
  Combined: 'bg-teal-500/10 text-teal-200 border-teal-500/30',
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
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${STYLE[source]}`}
      title={WHAT[source]}
    >
      {source}
      {title && <span className="ml-1 font-normal opacity-70">· {WHAT[source]}</span>}
    </span>
  );
}
