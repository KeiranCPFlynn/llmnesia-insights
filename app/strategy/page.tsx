import Link from 'next/link';
import { getAllInsights } from '../../lib/dashboard';
import { selectWeek } from '../../lib/week';
import { formatWeek } from '../../lib/format';
import { PageNav } from '../../components/PageNav';
import { WeekSelect } from '../../components/WeekSelect';
import { StrategyPanel } from '../../components/StrategyPanel';
import { StrategyChat } from '../../components/StrategyChat';
import { StrategyGoalEditor } from '../../components/StrategyGoalEditor';

export const dynamic = 'force-dynamic';

export default async function StrategyPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const insights = await getAllInsights();
  if (insights.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h1 className="text-xl font-semibold">No data yet</h1>
        <p className="mt-2 text-neutral-400">
          Run the analysis pipeline first — the strategist builds on a week's report.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm text-emerald-400 hover:underline">
          ← Back to Insights
        </Link>
      </main>
    );
  }

  const { week } = await searchParams;
  const { weeks, current } = selectWeek(insights, week);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-8 sm:px-6 sm:py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-50">LLMnesia Strategy</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Revenue & growth PM · week of {formatWeek(current.week_start)} →{' '}
            {formatWeek(current.week_end)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <PageNav week={current.week_start} />
          <WeekSelect
            weeks={[...weeks].reverse()}
            selected={current.week_start}
            basePath="/strategy"
          />
        </div>
      </header>

      <section className="mb-6">
        <StrategyGoalEditor
          key={current.week_start}
          week={current.week_start}
          initialGoal={current.strategy_goal}
        />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Discuss the strategy with the PM
        </h2>
        <StrategyChat
          key={current.week_start}
          week={current.week_start}
          initialChat={current.strategy_chat ?? []}
          hasStrategy={!!current.strategy}
        />
      </section>

      <section className="mb-8">
        <StrategyPanel
          key={current.week_start}
          week={current.week_start}
          strategy={current.strategy ?? null}
          strategyGoal={current.strategy_goal}
          decisions={current.strategy_decisions ?? []}
        />
      </section>
    </main>
  );
}
