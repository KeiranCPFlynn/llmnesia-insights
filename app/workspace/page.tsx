import Link from 'next/link';
import { AppShell } from '../../components/AppShell';
import { getDefaultWeek } from '../../src/pipeline.js';
import { calendarWeekStart } from '../../lib/week';
import { formatWeek } from '../../lib/format';

export const dynamic = 'force-dynamic';

/** Supporting tools stay available without competing with the strategy ledger. */
export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period } = await searchParams;
  const week = period ?? getDefaultWeek().weekStart;
  const shared = `period=${calendarWeekStart(week)}`;

  return (
    <AppShell
      week={week}
      eyebrow="Supporting workspace"
      title="Growth & data"
      description="Use the supporting tools to plan organic acquisition and inspect the raw evidence behind the Strategy Ledger."
      context={`Active period week of ${formatWeek(calendarWeekStart(week))}`}
    >
      <div className="grid gap-5 md:grid-cols-2">
        <Link href={`/growth?${shared}`} className="group rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-6 shadow-[0_16px_42px_rgba(0,0,0,0.18)] hover:border-emerald-400/40 hover:bg-emerald-500/[0.09]">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Acquisition</div>
          <h2 className="mt-2 text-xl font-semibold text-neutral-50">Organic growth planner</h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-400">Turn Search Console and Bing data into a weekly content plan and action board.</p>
          <span className="mt-5 inline-block text-sm font-medium text-emerald-300 group-hover:text-emerald-200">Open growth planner →</span>
        </Link>
        <Link href={`/data?${shared}`} className="group rounded-xl border border-sky-500/20 bg-sky-500/[0.06] p-6 shadow-[0_16px_42px_rgba(0,0,0,0.18)] hover:border-sky-400/40 hover:bg-sky-500/[0.09]">
          <div className="text-xs font-semibold uppercase tracking-wide text-sky-300">Evidence</div>
          <h2 className="mt-2 text-xl font-semibold text-neutral-50">Data explorer</h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-400">Inspect the GA4, PostHog, Google, and Bing data that supports each decision.</p>
          <span className="mt-5 inline-block text-sm font-medium text-sky-300 group-hover:text-sky-200">Open data explorer →</span>
        </Link>
      </div>
    </AppShell>
  );
}
