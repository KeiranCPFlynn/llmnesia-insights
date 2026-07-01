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

  // The board shows all open work across every week — not just this week's —
  // so an unresolved action from three weeks ago doesn't silently disappear
  // just because you navigated to a different week. Completed/ignored items
  // are tucked into a separate recent-history list instead of vanishing.
  const openActions = data.actions.filter((a) => a.status !== 'completed' && a.status !== 'ignored');
  const recentHandled = data.actions
    .filter((a) => a.status === 'completed' || a.status === 'ignored')
    .slice(0, 20);

  // Recommendation ids reset on every plan regeneration, so a completed
  // action's recommendation_id often no longer matches anything in the
  // current plan — that recommendation then looks "new" again even though
  // it was already done. target_page + action_type survives regeneration
  // (it's the actual page/work, not the ephemeral wrapper id), so use that
  // as a second, durable way to recognize already-handled recommendations.
  const handledPageActionKeys = [
    ...new Set(
      data.actions
        .filter((a) => (a.status === 'completed' || a.status === 'ignored') && a.target_page)
        .map((a) => `${a.target_page}::${a.action_type}`),
    ),
  ];

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
          handledPageActionKeys={handledPageActionKeys}
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
          Action board — all open work
          <span className="ml-2 font-normal text-neutral-500">
            {openActions.length} action{openActions.length === 1 ? '' : 's'} across every week
          </span>
        </h2>
        {openActions.length === 0 ? (
          <div className="rounded-lg border border-neutral-800/80 bg-neutral-900/70 px-4 py-6 text-sm text-neutral-500">
            Nothing open right now. Generate a plan or accept opportunities to populate this board.
          </div>
        ) : (
          <ActionBoard
            key={siteId}
            actions={openActions}
            recommendations={data.plan?.recommendations ?? []}
          />
        )}

        {recentHandled.length > 0 && (
          <details className="mt-4 rounded-lg border border-neutral-800/80 bg-neutral-900/50 shadow-[0_12px_34px_rgba(0,0,0,0.16)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-neutral-300 hover:bg-neutral-900/70">
              Recently completed/ignored ({recentHandled.length})
            </summary>
            <ul className="space-y-2 border-t border-neutral-800 p-4">
              {recentHandled.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800/80 bg-neutral-950/40 p-3 text-sm"
                >
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] capitalize ${
                      a.status === 'completed'
                        ? 'border-emerald-700 bg-emerald-900/40 text-emerald-200'
                        : 'border-neutral-700 bg-neutral-900/60 text-neutral-500'
                    }`}
                  >
                    {a.status}
                  </span>
                  <span className="font-medium text-neutral-200">
                    {a.suggested_title ?? a.target_page ?? a.target_query ?? 'Growth action'}
                  </span>
                  {a.published_url && (
                    <a
                      href={a.published_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-400 hover:underline"
                    >
                      {a.published_url}
                    </a>
                  )}
                  <span className="ml-auto text-xs text-neutral-600">
                    week of {formatWeek(a.week_start)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <footer className="border-t border-neutral-800 pt-4 text-xs text-neutral-600">
        Google Search Console + opportunity detectors + LLM-composed weekly plan ·{' '}
        Window: rolling 90 days anchored to the selected week
      </footer>
    </AppShell>
  );
}
