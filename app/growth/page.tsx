import Link from 'next/link';
import { formatWeek } from '../../lib/format';
import {
  OPP_HINT,
  OPP_LABEL,
  getCurrentWeekStart,
  getEnabledSites,
  getGrowthPageData,
  getGrowthWeekOptions,
  groupOpportunities,
} from '../../lib/growth';
import { AppShell } from '../../components/AppShell';
import { SiteSwitch } from '../../components/SiteSwitch';
import { WeekSelect } from '../../components/WeekSelect';
import { GrowthSyncToolbar } from '../../components/GrowthDashboard';
import { GrowthGoalEditor } from '../../components/GrowthGoalEditor';
import { GSCDataVisuals } from '../../components/GSCDataVisuals';
import { WeeklyPlan } from '../../components/WeeklyPlan';
import { OpportunityList } from '../../components/OpportunityList';
import { ActionBoard } from '../../components/ActionBoard';
import { ensureOpportunities } from '../../src/growth.js';
import type { GrowthActionStatus, GrowthOpportunityType } from '../../src/types.js';

export const dynamic = 'force-dynamic';

function mondayFor(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  const day = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() - ((day + 6) % 7));
  return value.toISOString().slice(0, 10);
}

function EmptySites() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24 text-center">
      <h1 className="text-xl font-semibold">No sites configured</h1>
      <p className="mt-2 text-neutral-400">
        Add at least one row to <code className="rounded bg-neutral-800 px-1">public.sites</code> —
        the README has the seed SQL.
      </p>
      <Link href="/" className="mt-4 inline-block text-sm text-emerald-400 hover:underline">
        ← Back to Insights
      </Link>
    </main>
  );
}

export default async function GrowthPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; week?: string; period?: string }>;
}) {
  const sites = await getEnabledSites();
  if (sites.length === 0) return <EmptySites />;

  const { site: siteParam, week: weekParam, period } = await searchParams;
  const siteId = siteParam ?? sites[0].id;
  const currentWeekStart = getCurrentWeekStart();

  const weekOptions = await getGrowthWeekOptions(siteId, currentWeekStart);
  const requestedWeek = period ?? (weekParam ? mondayFor(weekParam) : null);
  // Open on the latest week with growth work (defaultWeek = newest growth plan).
  const weekStart = requestedWeek ?? weekOptions.defaultWeek;

  // Growth's own weeks — the current week plus every week that has a growth
  // plan/action/opportunity. These are the weeks with growth content to show,
  // so each option loads. Growth runs ahead of the insights pipeline, so this
  // list is intentionally more recent than the Insights/Strategy dropdowns.
  const allWeeks = weekOptions.weeks;

  const data = await getGrowthPageData(siteId, weekStart);
  if (!data) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h1 className="text-xl font-semibold">Site not found</h1>
        <Link href="/growth" className="mt-4 inline-block text-sm text-emerald-400 hover:underline">
          ← Back to Growth
        </Link>
      </main>
    );
  }

  // If GSC data is synced but opportunities haven't been computed for this
  // week yet, compute them now on the server — pure SQL + JS, no LLM, fast.
  // Without this the page looks empty after a successful sync until the user
  // also clicks "Generate weekly plan", which is bad UX.
  let opportunities = data.opportunities;
  if (data.rowCount > 0 && opportunities.length === 0) {
    try {
      opportunities = await ensureOpportunities({ siteId, weekStart });
    } catch (e) {
      console.error('[growth-page] opportunity detection failed:', e);
    }
  }
  const grouped = groupOpportunities(opportunities);
  const orderedTypes: GrowthOpportunityType[] = [
    'near_win',
    'low_ctr',
    'gap',
    'declining',
    'proven_expander',
  ];

  // Recommendation/opportunity ids already turned into actions. Keep the
  // recommendation action state so the plan cards can manage stale recs
  // without forcing the user into the action board first.
  const recommendationActions: Record<
    string,
    { id: string; status: GrowthActionStatus; note?: string | null; status_updated_at: string }
  > = {};
  const acceptedOpportunityIds: string[] = [];
  for (const a of data.actions) {
    if (a.recommendation_id) {
      recommendationActions[a.recommendation_id] = {
        id: a.id,
        status: a.status,
        note: a.note,
        status_updated_at: a.status_updated_at,
      };
    }
    if (a.opportunity_id) acceptedOpportunityIds.push(a.opportunity_id);
  }

  const thisWeekActions = data.actions.filter((a) => a.week_start === weekStart);

  return (
    <AppShell
      week={weekStart}
      eyebrow="Acquisition workspace"
      title="Organic growth"
      description="Move from Search Console signal to a ranked weekly plan, then track the work through to publication."
      context={`${data.site.name} · week of ${formatWeek(weekStart)} · ${opportunities.length} opportunities`}
      controls={
        <div className="flex flex-wrap justify-end gap-2">
          <WeekSelect
            weeks={allWeeks}
            selected={weekStart}
            basePath="/growth"
            params={{ site: siteId }}
          />
          <SiteSwitch sites={sites} selectedId={siteId} week={weekStart} />
        </div>
      }
      sections={[
        { href: '#setup', label: 'Goal & data' },
        { href: '#plan', label: 'Weekly plan' },
        { href: '#search-data', label: 'Search data' },
        { href: '#opportunities', label: 'Opportunities' },
        { href: '#actions', label: 'Action board' },
      ]}
    >

      <section id="setup" className="scroll-mt-36 mb-6">
        <GrowthGoalEditor
          key={siteId}
          siteId={siteId}
          initialGoal={data.site.growth_goal}
        />
      </section>

      <section className="mb-8">
        <GrowthSyncToolbar
          key={siteId}
          site={data.site}
          lastSyncedAt={data.lastSyncedAt}
          rowCount={data.rowCount}
        />
      </section>

      <section id="plan" className="scroll-mt-36 mb-10">
        <WeeklyPlan
          key={`${siteId}:${weekStart}`}
          siteId={siteId}
          weekStart={weekStart}
          initialPlan={data.plan}
          recommendationActions={recommendationActions}
          opportunityCount={opportunities.length}
        />
      </section>

      <section id="search-data" className="scroll-mt-36 mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Search performance{' '}
          <span className="ml-2 font-normal text-neutral-500">
            clicks, impressions, CTR and ranking context
          </span>
        </h2>
        <GSCDataVisuals key={`${siteId}:${weekStart}`} digest={data.gscDigest} />
      </section>

      <section id="opportunities" className="scroll-mt-36 mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Opportunity queues{' '}
          <span className="ml-2 font-normal text-neutral-500">
            {opportunities.length === 0
              ? data.rowCount === 0
                ? 'sync GSC above to surface these'
                : 'no opportunities matched the detectors this week — try a longer backfill or wait for more data'
              : `${opportunities.length} detected from ${data.rowCount.toLocaleString('en-GB')} GSC rows`}
          </span>
        </h2>
        <div className="space-y-3">
          {orderedTypes.map((t) =>
            grouped[t].length === 0 ? null : (
              <OpportunityList
                key={t}
                siteId={siteId}
                weekStart={weekStart}
                type={t}
                label={OPP_LABEL[t]}
                hint={OPP_HINT[t]}
                opportunities={grouped[t]}
                acceptedIds={acceptedOpportunityIds}
              />
            ),
          )}
        </div>
      </section>

      <section id="actions" className="scroll-mt-36 mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Action board — this week
          <span className="ml-2 font-normal text-neutral-500">
            {thisWeekActions.length} action{thisWeekActions.length === 1 ? '' : 's'}
          </span>
        </h2>
        {thisWeekActions.length === 0 ? (
          <div className="rounded-lg border border-neutral-800/80 bg-neutral-900/70 px-4 py-6 text-sm text-neutral-500">
            Nothing planned yet for this week. Generate a plan or accept opportunities to populate
            this board.
          </div>
        ) : (
          <ActionBoard
            key={`${siteId}:${weekStart}`}
            actions={thisWeekActions}
            recommendations={data.plan?.recommendations ?? []}
          />
        )}
      </section>

      <footer className="border-t border-neutral-800 pt-4 text-xs text-neutral-600">
        Google Search Console + opportunity detectors + LLM-composed weekly plan ·{' '}
        Window: rolling 90 days anchored to the selected week
      </footer>
    </AppShell>
  );
}
