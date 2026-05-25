import Link from 'next/link';
import { getAllInsights, toTrend, topChannel } from '../lib/dashboard';
import { selectWeek } from '../lib/week';
import { delta, formatWeek, num, pct } from '../lib/format';
import { Toolbar } from '../components/Toolbar';
import { PageNav } from '../components/PageNav';
import { TrendCharts } from '../components/TrendCharts';
import { SourceBadge } from '../components/SourceBadge';
import { ChatPanel } from '../components/ChatPanel';
import { getDefaultWeek } from '../src/pipeline.js';
import type { DataSource } from '../src/types.js';

export const dynamic = 'force-dynamic';

const SEVERITY: Record<string, string> = {
  critical: 'bg-rose-500/12 text-rose-200 border-rose-500/40',
  concern: 'bg-amber-500/12 text-amber-200 border-amber-500/40',
  watch: 'bg-sky-500/12 text-sky-200 border-sky-500/40',
  info: 'bg-neutral-800/80 text-neutral-300 border-neutral-700',
};

const PRIORITY: Record<string, string> = {
  high: 'bg-rose-500/12 text-rose-200 border-rose-500/40',
  medium: 'bg-amber-500/12 text-amber-200 border-amber-500/40',
  low: 'bg-neutral-800/80 text-neutral-300 border-neutral-700',
};

function StatCard({
  label,
  value,
  d,
}: {
  label: string;
  value: string;
  d?: { label: string; dir: 'up' | 'down' | 'flat' };
}) {
  const color =
    d?.dir === 'up'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : d?.dir === 'down'
        ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
        : 'border-neutral-700 bg-neutral-800/70 text-neutral-400';
  return (
    <div className="rounded-lg border border-neutral-800/80 bg-neutral-900/70 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold leading-none text-neutral-50">{value}</div>
      {d?.label && (
        <div className={`mt-3 inline-flex rounded-full border px-2 py-0.5 text-[11px] ${color}`}>
          {d.label} vs prev week
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children, source }: { children: React.ReactNode; source?: DataSource }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">{children}</h2>
      {source && <SourceBadge source={source} />}
      <div className="h-px flex-1 bg-neutral-800/80" />
    </div>
  );
}

function Empty() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24 text-center">
      <h1 className="text-xl font-semibold">No insights yet</h1>
      <p className="mt-2 text-neutral-400">
        Run the pipeline to generate the first weekly analysis — locally with{' '}
        <code className="rounded bg-neutral-800 px-1">npm run pipeline</code>, or hit the{' '}
        <strong>Run analysis now</strong> button once deployed.
      </p>
    </main>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const insights = await getAllInsights();
  if (insights.length === 0) return <Empty />;

  const { week } = await searchParams;
  const { weeks, current, prev } = selectWeek(insights, week);
  const latestRunWeek = getDefaultWeek();

  const openRecs = current.strategy
    ? current.strategy.recommendations.filter(
        (r) => !(current.strategy_decisions ?? []).some((d) => d.recommendation_id === r.id),
      ).length
    : 0;

  const m = current.metrics_snapshot;
  const pm = prev?.metrics_snapshot;
  const ga4 = m.ga4;
  const trend = toTrend(insights);

  const headline = current.headline ?? current.summary;
  const showSummary = current.headline ? current.summary : null;

  // Surface only the signal: things actually worth acting on this week.
  const attentionFindings = current.findings
    .filter((f) => f.severity === 'critical' || f.severity === 'concern')
    .sort((a, b) => (a.severity === 'critical' ? -1 : 1) - (b.severity === 'critical' ? -1 : 1));
  const highActions = current.action_items.filter((a) => a.priority === 'high');
  const sorted = (arr: typeof current.action_items) =>
    [...arr].sort(
      (a, b) =>
        ['high', 'medium', 'low'].indexOf(a.priority) -
        ['high', 'medium', 'low'].indexOf(b.priority),
    );

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-8 sm:px-6 sm:py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-50">LLMnesia Insights</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Week of {formatWeek(current.week_start)} → {formatWeek(current.week_end)} ·{' '}
            {insights.length} weeks tracked
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-3">
            <Link
              href={`/strategy?week=${current.week_start}`}
              className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-200 shadow-[0_0_0_1px_rgba(16,185,129,0.04)] hover:bg-emerald-500/15"
            >
              Strategy{openRecs > 0 ? ` · ${openRecs} open` : ''} →
            </Link>
            <PageNav week={current.week_start} />
          </div>
          <Toolbar
            weeks={[...weeks].reverse()}
            selected={current.week_start}
            latestRunWeekStart={latestRunWeek.weekStart}
            latestRunWeekEnd={latestRunWeek.weekEnd}
          />
        </div>
      </header>

      {/* Hero — the one thing to take away */}
      <section className="mb-8 rounded-lg border border-neutral-800/80 bg-[linear-gradient(135deg,rgba(23,23,23,0.92),rgba(6,78,59,0.18))] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
          Current readout
        </div>
        <p className="max-w-4xl text-xl font-semibold leading-relaxed text-neutral-50">
          {headline}
        </p>
        {showSummary && (
          <p className="mt-3 max-w-4xl text-sm leading-relaxed text-neutral-400">
            {showSummary}
          </p>
        )}
      </section>

      {/* Confirmed caveats & context — applied to the analysis above */}
      {(() => {
        const all = current.corrections ?? [];
        const caveats = all.filter((c) => c.kind !== 'context');
        const ctx = all.filter((c) => c.kind === 'context');
        const Block = ({
          title,
          items,
          tone,
        }: {
          title: string;
          items: typeof all;
          tone: 'amber' | 'sky';
        }) =>
          items.length === 0 ? null : (
            <section
              className={`mb-4 rounded-lg border p-4 shadow-[0_10px_28px_rgba(0,0,0,0.14)] ${
                tone === 'amber'
                  ? 'border-amber-500/25 bg-amber-500/10'
                  : 'border-sky-500/25 bg-sky-500/10'
              }`}
            >
              <h2
                className={`mb-2 text-xs font-semibold uppercase tracking-wide ${
                  tone === 'amber' ? 'text-amber-400' : 'text-sky-400'
                }`}
              >
                {title}
              </h2>
              <ul className="space-y-2">
                {items.map((c) => (
                  <li
                    key={c.id}
                    className={`text-sm ${tone === 'amber' ? 'text-amber-100' : 'text-sky-100'}`}
                  >
                    <span className="font-medium">{c.affected_metric}:</span> {c.note}{' '}
                    <span className={tone === 'amber' ? 'text-amber-500/70' : 'text-sky-500/70'}>
                      · {formatWeek(c.created_at.slice(0, 10))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        return (
          <div className="mb-4">
            <Block
              title="Known data caveats — analysis adjusted for these"
              items={caveats}
              tone="amber"
            />
            <Block
              title="Founder context — factored into the analysis"
              items={ctx}
              tone="sky"
            />
          </div>
        );
      })()}

      {/* Chat — interrogate the report, flag bad data, regenerate. Kept high
          on the page so it's the first thing you can act on. */}
      <section className="mb-8">
        {/* key forces a remount per week so the panel reloads that week's
            own thread on the client — not just after a full page refresh. */}
        <ChatPanel
          key={current.week_start}
          week={current.week_start}
          initialChat={current.chat ?? []}
        />
      </section>

      {/* Needs attention — concern/critical findings + high-priority actions only */}
      <section className="mb-8">
        <SectionTitle>What needs attention</SectionTitle>
        {attentionFindings.length === 0 && highActions.length === 0 ? (
          <div className="rounded-lg border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
            Nothing urgent this week — scan the numbers below to stay on top of trends.
          </div>
        ) : (
          <ul className="space-y-3">
            {attentionFindings.map((f, i) => (
              <li
                key={`f${i}`}
                className="rounded-lg border border-neutral-800/80 bg-neutral-900/70 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.16)]"
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] capitalize ${SEVERITY[f.severity]}`}
                  >
                    {f.severity}
                  </span>
                  <span className="text-sm font-medium text-neutral-200">{f.metric}</span>
                  <SourceBadge source={f.source ?? 'PostHog'} />
                </div>
                <p className="text-sm text-neutral-400">{f.observation}</p>
              </li>
            ))}
            {highActions.map((a, i) => (
              <li
                key={`a${i}`}
                className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.16)]"
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] capitalize ${PRIORITY[a.priority]}`}
                  >
                    do this
                  </span>
                  <span className="text-sm font-medium text-neutral-200">{a.action}</span>
                </div>
                <p className="text-sm text-neutral-400">{a.rationale}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Key product numbers */}
      <section className="mb-10">
        <SectionTitle source="PostHog">The numbers</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="Installs"
            value={num(m.installs?.total)}
            d={delta(m.installs?.total, pm?.installs?.total)}
          />
          <StatCard
            label="Activated in 24h"
            value={pct(m.activation?.rate)}
            d={delta(m.activation?.rate, pm?.activation?.rate)}
          />
          <StatCard
            label="Weekly active users"
            value={num(m.engagement?.wau)}
            d={delta(m.engagement?.wau, pm?.engagement?.wau)}
          />
          <StatCard
            label="Came back (week 1)"
            value={pct(m.retention?.w1_rolling?.rate)}
            d={delta(m.retention?.w1_rolling?.rate, pm?.retention?.w1_rolling?.rate)}
          />
        </div>
      </section>

      {/* Acquisition — GA4 traffic, clearly labelled */}
      {ga4?.website && (
        <section className="mb-10">
          <SectionTitle source="GA4">Where people come from</SectionTitle>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label="Website visitors"
              value={num(ga4.website.users?.total)}
              d={delta(ga4.website.users?.total, pm?.ga4?.website?.users?.total)}
            />
            <StatCard label="New visitors" value={num(ga4.website.users?.new_users)} />
            <StatCard
              label="Website sessions"
              value={num(ga4.website.sessions)}
              d={delta(ga4.website.sessions, pm?.ga4?.website?.sessions)}
            />
            {(() => {
              const tc = topChannel(ga4.website);
              return (
                <StatCard
                  label="Top channel"
                  value={tc ? `${tc.name}` : '—'}
                />
              );
            })()}
          </div>
          {ga4.extension && (
            <p className="mt-2 text-xs text-neutral-500">
              Chrome Web Store listing: {num(ga4.extension.sessions)} sessions ·{' '}
              {num(ga4.extension.users?.total)} visitors
            </p>
          )}
        </section>
      )}

      {/* Conversion funnel — the website's actual job. Rates matter more than
          raw counts: low CTA rate = site doesn't sell; low click→install rate
          = store listing leaks. */}
      {ga4?.website?.conversions && (() => {
        const conv = ga4.website.conversions;
        const prevConv = pm?.ga4?.website?.conversions;
        const sessions = ga4.website.sessions;
        const prevSessions = pm?.ga4?.website?.sessions;
        const storeInstalls = ga4.extension?.store_installs?.events;
        const prevStoreInstalls = pm?.ga4?.extension?.store_installs?.events;

        const rate = (n?: number, d?: number) =>
          n != null && d != null && d > 0 ? n / d : undefined;

        const cta = conv.install_click;
        const prevCta = prevConv?.install_click;
        const ctaRate = rate(cta, sessions);
        const prevCtaRate = rate(prevCta, prevSessions);
        const clickToInstall = rate(storeInstalls, cta);
        const prevClickToInstall = rate(prevStoreInstalls, prevCta);

        return (
          <section className="mb-10">
            <SectionTitle source="GA4">How well it converts</SectionTitle>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard
                label="CTA click rate"
                value={pct(ctaRate)}
                d={delta(ctaRate, prevCtaRate)}
              />
              <StatCard
                label="Click → install"
                value={pct(clickToInstall)}
                d={delta(clickToInstall, prevClickToInstall)}
              />
              <StatCard
                label="Install CTA clicks"
                value={num(cta)}
                d={delta(cta, prevCta)}
              />
              <StatCard
                label="Email signups"
                value={num(conv.email_signup)}
                d={delta(conv.email_signup, prevConv?.email_signup)}
              />
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Funnel: sessions → install CTA click → Chrome Web Store install.
              {conv.contact_submit ? ` · ${num(conv.contact_submit)} contact submits` : ''}
            </p>
          </section>
        );
      })()}

      {/* Trends */}
      <section className="mb-10">
        <SectionTitle source="PostHog">Trends over {insights.length} weeks</SectionTitle>
        <TrendCharts data={trend} />
      </section>

      {/* Everything else — present but tucked away */}
      <details className="mb-10 rounded-lg border border-neutral-800/80 bg-neutral-900/50 shadow-[0_12px_34px_rgba(0,0,0,0.16)]">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-neutral-300 hover:bg-neutral-900/70">
          Full analysis ({current.findings.length} findings, {current.action_items.length} actions
          {current.open_threads.length ? `, ${current.open_threads.length} open threads` : ''})
        </summary>
        <div className="space-y-8 border-t border-neutral-800 p-4">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              All findings
            </h3>
            <ul className="space-y-2">
              {current.findings.map((f, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-neutral-800/80 bg-neutral-950/40 p-3"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] capitalize ${SEVERITY[f.severity] ?? SEVERITY.info}`}
                    >
                      {f.severity}
                    </span>
                    <span className="text-sm font-medium text-neutral-200">{f.metric}</span>
                    <SourceBadge source={f.source ?? 'PostHog'} />
                  </div>
                  <p className="text-sm text-neutral-400">{f.observation}</p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              All recommended actions
            </h3>
            <ul className="space-y-2">
              {sorted(current.action_items).map((a, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-neutral-800/80 bg-neutral-950/40 p-3"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] capitalize ${PRIORITY[a.priority] ?? PRIORITY.low}`}
                    >
                      {a.priority}
                    </span>
                    <span className="text-sm font-medium text-neutral-200">{a.action}</span>
                  </div>
                  <p className="text-sm text-neutral-400">{a.rationale}</p>
                </li>
              ))}
            </ul>
          </div>

          {current.open_threads.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Open threads
              </h3>
              <ul className="space-y-2">
                {current.open_threads.map((t, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-neutral-800/80 bg-neutral-950/40 px-3 py-2 text-sm"
                  >
                    <span className="text-neutral-200">{t.thread}</span>{' '}
                    <span className="text-neutral-500">
                      — {t.current_status} (since {formatWeek(t.first_flagged)})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>

      {/* Revision history — every pre-correction version of the report, kept
          for the audit trail. Read-only. */}
      {(current.revisions?.length ?? 0) > 0 && (
        <details className="mb-10 rounded-lg border border-neutral-800/80 bg-neutral-900/50 shadow-[0_12px_34px_rgba(0,0,0,0.16)]">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-neutral-300 hover:bg-neutral-900/70">
            Revision history ({current.revisions!.length} prior version
            {current.revisions!.length === 1 ? '' : 's'} — before chat-driven corrections)
          </summary>
          <div className="space-y-4 border-t border-neutral-800 p-4">
            {[...current.revisions!].reverse().map((r, i) => {
              const c = (current.corrections ?? []).find((x) => x.id === r.correction_id);
              return (
                <div
                  key={i}
                  className="rounded-lg border border-neutral-800/80 bg-neutral-950/40 p-4"
                >
                  <div className="mb-2 text-xs text-neutral-500">
                    Superseded {new Date(r.revised_at).toLocaleString('en-GB')} · model{' '}
                    {r.model_used} · ref{' '}
                    <code className="rounded bg-neutral-800 px-1">
                      {r.correction_id.slice(0, 8)}
                    </code>
                    {c && (
                      <>
                        {' '}
                        · caused by {c.kind} <span className="text-neutral-400">{c.affected_metric}</span>
                        {c.source_excerpt && (
                          <span className="text-neutral-600"> — “{c.source_excerpt}”</span>
                        )}
                      </>
                    )}
                  </div>
                  <p className="text-sm font-medium text-neutral-200">
                    {r.headline ?? r.summary}
                  </p>
                  {r.headline && (
                    <p className="mt-1 text-sm text-neutral-400">{r.summary}</p>
                  )}
                  <p className="mt-2 text-xs text-neutral-600">
                    {r.findings.length} findings · {r.action_items.length} actions ·{' '}
                    {r.open_threads.length} open threads
                  </p>
                </div>
              );
            })}
          </div>
        </details>
      )}

      <footer className="border-t border-neutral-800 pt-4 text-xs text-neutral-600">
        <SourceBadge source="PostHog" title /> in-product events ·{' '}
        <SourceBadge source="GA4" title /> site &amp; store traffic · Model {current.model_used} ·
        Generated{' '}
        {current.created_at ? new Date(current.created_at).toLocaleString('en-GB') : '—'}
      </footer>
    </main>
  );
}
