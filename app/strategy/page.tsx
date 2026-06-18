import Link from 'next/link';
import { getAllInsights } from '../../lib/dashboard';
import { calendarWeekStart, selectWeek } from '../../lib/week';
import { formatWeek } from '../../lib/format';
import { AppShell } from '../../components/AppShell';
import { WeekSelect } from '../../components/WeekSelect';
import { StrategyPanel } from '../../components/StrategyPanel';
import { StrategyChat } from '../../components/StrategyChat';
import { StrategyGoalEditor } from '../../components/StrategyGoalEditor';

export const dynamic = 'force-dynamic';

export default async function StrategyPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; period?: string }>;
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

  const { week, period } = await searchParams;
  const { weeks, current } = selectWeek(insights, week, period);

  return (
    <AppShell
      week={current.week_start}
      eyebrow="Decision workspace"
      title="Strategy"
      description="Turn the weekly product signal into a focused set of decisions, recommendations, and implementation handoffs."
      context={`Week of ${formatWeek(calendarWeekStart(current.week_start))} · source window ${formatWeek(current.week_start)} → ${formatWeek(current.week_end)} · revenue & growth PM`}
      controls={
        <WeekSelect
          weeks={[...weeks].reverse()}
          selected={current.week_start}
          basePath="/strategy"
        />
      }
      sections={[
        { href: '#goal', label: 'Goal' },
        { href: '#discuss', label: 'Discuss' },
        { href: '#recommendations', label: 'Recommendations' },
      ]}
    >

      <section id="goal" className="scroll-mt-36 mb-6">
        <StrategyGoalEditor
          key={current.week_start}
          week={current.week_start}
          initialGoal={current.strategy_goal}
        />
      </section>

      <section id="discuss" className="scroll-mt-36 mb-10">
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

      <section id="recommendations" className="scroll-mt-36 mb-8">
        <StrategyPanel
          key={current.week_start}
          week={current.week_start}
          strategy={current.strategy ?? null}
          strategyGoal={current.strategy_goal}
          decisions={current.strategy_decisions ?? []}
          recommendationChats={current.strategy_recommendation_chats ?? {}}
        />
      </section>
    </AppShell>
  );
}
