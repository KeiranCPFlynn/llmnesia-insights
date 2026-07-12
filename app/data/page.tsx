import { getAllInsights } from '../../lib/dashboard';
import { calendarWeekStart, selectWeek } from '../../lib/week';
import { formatWeek } from '../../lib/format';
import { AppShell } from '../../components/AppShell';
import { DataExplorer } from '../../components/DataExplorer';
import { getDefaultWeek } from '../../src/pipeline.js';

export const dynamic = 'force-dynamic';

export default async function DataPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; period?: string }>;
}) {
  const insights = await getAllInsights();
  const { week, period } = await searchParams;

  // The explorer runs on its own arbitrary date range, but AppShell still wants
  // a canonical week for nav highlighting + the "active period" rail. Reuse the
  // shared week resolution when there are reports; otherwise fall back to the
  // most recently completed week so the page renders even before any pipeline run.
  const currentWeek = insights.length
    ? selectWeek(insights, week, period).current.week_start
    : getDefaultWeek().weekStart;

  return (
    <AppShell
      week={currentWeek}
      eyebrow="Raw data"
      title="Data explorer"
      description="Every GA4, PostHog and search metric in one place. Pick any date range, then copy the key numbers to hand to another AI."
      context={`Active period week of ${formatWeek(calendarWeekStart(currentWeek))} · GA4 · PostHog · Google + Bing`}
    >
      <DataExplorer />
    </AppShell>
  );
}
