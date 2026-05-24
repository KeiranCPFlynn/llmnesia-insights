'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type {
  GrowthAction,
  GrowthActionType,
  GrowthPlan,
  GrowthRecommendation,
} from '../src/types.js';
import { ProviderSelect, useProvider, type Provider } from './ProviderSelect';
import { ProgressBar, useElapsed } from './ProgressBar';

const STALE_MS = 20 * 60 * 1000;
const pendingKey = (siteId: string, week: string) =>
  `llmnesia:growth-plan-pending:${siteId}:${week}`;

const ACTION_TYPE_LABEL: Record<GrowthActionType, string> = {
  create: 'Create',
  improve: 'Improve',
  title_meta: 'Title / meta',
  add_section: 'Add section',
  internal_link: 'Internal links',
  fix_indexing: 'Fix indexing',
  refresh: 'Refresh',
  supporting_cluster: 'Supporting cluster',
  distribute: 'Distribute',
  monitor: 'Monitor',
};

const EFFORT = { S: 'Small', M: 'Medium', L: 'Large' } as const;

export function WeeklyPlan({
  siteId,
  weekStart,
  initialPlan,
  acceptedRecIds,
  opportunityCount,
}: {
  siteId: string;
  weekStart: string;
  initialPlan: GrowthPlan | null;
  /** Recommendation ids already turned into an action — hides the Accept button. */
  acceptedRecIds: Set<string>;
  opportunityCount: number;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<GrowthPlan | null>(initialPlan);
  const [provider, setProvider] = useProvider({
    storageKey: 'llm-provider-growth',
    fallback: 'claude',
  });
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const baseOffset = useRef(0);
  const tick = useElapsed(busy || polling);
  const shown = baseOffset.current + tick;

  const label = (p: Provider) =>
    p === 'openai' ? 'GPT-5.5' : p === 'deepseek' ? 'DeepSeek' : 'Claude';

  const pollStop = useRef(true);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setPlan(initialPlan);
    if (initialPlan) localStorage.removeItem(pendingKey(siteId, weekStart));
  }, [siteId, weekStart, initialPlan]);

  function stopPoll() {
    pollStop.current = true;
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }

  function runPoll(startMs: number) {
    pollStop.current = false;
    baseOffset.current = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    setPolling(true);
    const step = async () => {
      if (pollStop.current) return;
      try {
        const r = await fetch(`/api/growth/plan?site=${siteId}&week=${weekStart}`);
        if (r.ok) {
          const b = await r.json();
          if (b.plan) {
            setPlan(b.plan as GrowthPlan);
            localStorage.removeItem(pendingKey(siteId, weekStart));
            setPolling(false);
            stopPoll();
            router.refresh();
            return;
          }
        }
      } catch {
        /* transient */
      }
      if (Date.now() - startMs > STALE_MS) {
        localStorage.removeItem(pendingKey(siteId, weekStart));
        setPolling(false);
        setError('Generation took too long. Try again.');
        stopPoll();
        return;
      }
      pollTimer.current = setTimeout(step, 15000);
    };
    pollTimer.current = setTimeout(step, 4000);
  }

  // Resume polling if a previous tab kicked off a generation.
  useEffect(() => {
    if (initialPlan) {
      localStorage.removeItem(pendingKey(siteId, weekStart));
      return;
    }
    const raw = localStorage.getItem(pendingKey(siteId, weekStart));
    const start = raw ? Number(raw) : 0;
    if (!start || Date.now() - start > STALE_MS) {
      if (raw) localStorage.removeItem(pendingKey(siteId, weekStart));
      return;
    }
    runPoll(start);
    return () => stopPoll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => stopPoll(), []);

  async function generate() {
    if (busy || polling) return;
    setBusy(true);
    setError(null);
    const start = Date.now();
    localStorage.setItem(pendingKey(siteId, weekStart), String(start));
    try {
      const res = await fetch('/api/growth/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, weekStart, provider }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || `Failed (${res.status})`);
      }
      runPoll(start);
    } catch (e) {
      localStorage.removeItem(pendingKey(siteId, weekStart));
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  const working = busy || polling;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-neutral-100">This week’s plan</h2>
          {plan && (
            <p className="text-sm text-neutral-500">
              {label(provider)} · generated{' '}
              {new Date(plan.generated_at).toLocaleString('en-GB')} · model {plan.model_used}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ProviderSelect
            provider={provider}
            onChange={setProvider}
            options={['claude', 'openai', 'deepseek']}
            title="Which model composes the plan"
            disabled={working}
          />
          <button
            onClick={generate}
            disabled={working || opportunityCount === 0}
            title={opportunityCount === 0 ? 'Sync GSC data first to surface opportunities.' : ''}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_22px_rgba(5,150,105,0.2)] hover:bg-emerald-500 disabled:opacity-50 disabled:shadow-none"
          >
            {working ? 'Working…' : plan ? 'Regenerate plan' : 'Generate weekly plan'}
          </button>
        </div>
      </div>

      {working && (
        <div className="rounded-lg border border-neutral-800/80 bg-neutral-900/70 p-4 shadow-[0_12px_34px_rgba(0,0,0,0.16)]">
          <ProgressBar
            seconds={shown}
            label={`${label(provider)} is composing the plan${polling ? ' · running in the background, safe to navigate away' : ''}`}
          />
          <p className="mt-2 text-sm text-neutral-500">
            Keeps running even if you leave this tab.
          </p>
        </div>
      )}
      {error && <div className="text-base text-rose-400">{error}</div>}

      {!plan && !working && (
        <div className="rounded-lg border border-neutral-800/80 bg-neutral-900/70 px-5 py-8 text-center shadow-[0_12px_34px_rgba(0,0,0,0.16)]">
          <p className="text-base text-neutral-300">
            {opportunityCount === 0
              ? 'No GSC data synced yet — run a sync, then generate the plan.'
              : 'No plan yet for this week.'}
          </p>
          <p className="mx-auto mt-2 max-w-xl text-[15px] leading-relaxed text-neutral-500">
            {opportunityCount === 0
              ? "Use the Sync button above. The first run pulls 16 months of Search Console data; subsequent runs are a few days' delta."
              : `Generate one — the planner reads ${opportunityCount} ranked opportunities plus prior plans and your action history, and composes a balanced weekly plan.`}
          </p>
        </div>
      )}

      {plan && (
        <>
          <section className="rounded-lg border border-emerald-500/35 bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(23,23,23,0.72))] p-6 shadow-[0_16px_42px_rgba(0,0,0,0.2)]">
            <div className="text-xs font-bold uppercase tracking-widest text-emerald-400">
              Thesis
            </div>
            <p className="mt-2 text-xl font-semibold leading-relaxed text-neutral-50">
              {plan.thesis}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
              {(['create', 'improve', 'link', 'fix', 'distribute', 'measure'] as const).map((k) => (
                <span
                  key={k}
                  className="rounded-full border border-neutral-700 bg-neutral-950/60 px-2.5 py-0.5 capitalize text-neutral-300"
                >
                  {k}: {plan.balance[k]}
                </span>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-base font-bold text-neutral-100">
              Recommendations — ranked, do #1 first
            </h3>
            <ul className="space-y-4">
              {plan.recommendations.map((rec, i) => (
                <RecommendationCard
                  key={rec.id}
                  rank={i + 1}
                  rec={rec}
                  siteId={siteId}
                  weekStart={weekStart}
                  accepted={acceptedRecIds.has(rec.id)}
                />
              ))}
            </ul>
          </section>

          {plan.experiments.length > 0 && (
            <section className="rounded-lg border border-neutral-800/80 bg-neutral-900/70 p-6 shadow-[0_12px_34px_rgba(0,0,0,0.16)]">
              <h3 className="mb-3 text-base font-bold text-neutral-100">Experiments</h3>
              <ul className="space-y-2 text-[15px] leading-relaxed text-neutral-200">
                {plan.experiments.map((e, i) => (
                  <li key={i}>
                    {e.hypothesis}{' '}
                    <span className="text-neutral-500">— measure: {e.measure}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {plan.risks.length > 0 && (
            <section className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-6 shadow-[0_12px_34px_rgba(0,0,0,0.16)]">
              <h3 className="mb-3 text-base font-bold text-amber-300">Risks</h3>
              <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-amber-100">
                {plan.risks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function RecommendationCard({
  rank,
  rec,
  siteId,
  weekStart,
  accepted,
}: {
  rank: number;
  rec: GrowthRecommendation;
  siteId: string;
  weekStart: string;
  accepted: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [copied, setCopied] = useState(false);
  const top = rank === 1;

  async function copyPrompt() {
    if (!rec.handoff?.coding_agent_prompt) return;
    await navigator.clipboard.writeText(rec.handoff.coding_agent_prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function accept() {
    if (busy || accepted || accepting) return;
    setAccepting(true);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/growth/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId,
          weekStart,
          recommendationId: rec.id,
          opportunityId: rec.opportunity_id ?? null,
          actionType: rec.action_type,
          targetQuery: rec.target_query,
          targetPage: rec.target_page,
          suggestedTitle: rec.title,
          status: 'planned',
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
      setAccepting(false);
    }
  }

  return (
    <li
      className={`rounded-lg border p-5 shadow-[0_12px_34px_rgba(0,0,0,0.16)] ${
        top
          ? 'border-emerald-500/35 bg-emerald-500/10'
          : 'border-neutral-800/80 bg-neutral-900/70'
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
            top ? 'bg-emerald-600 text-white' : 'bg-neutral-800 text-neutral-400'
          }`}
        >
          {rank}
        </span>
        <h4 className="text-lg font-semibold text-neutral-50">{rec.title}</h4>
        {accepted && (
          <span className="rounded-full border border-emerald-700 bg-emerald-900/50 px-2.5 py-0.5 text-xs text-emerald-200">
            in plan
          </span>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-neutral-700 bg-neutral-800 px-2.5 py-0.5 capitalize text-neutral-200">
          {ACTION_TYPE_LABEL[rec.action_type]}
        </span>
        <span className="rounded-full border border-neutral-700 bg-neutral-800 px-2.5 py-0.5 text-neutral-200">
          {EFFORT[rec.effort]} effort
        </span>
        <span className="rounded-full border border-neutral-700 bg-neutral-800 px-2.5 py-0.5 text-neutral-200">
          {rec.confidence} confidence
        </span>
        {rec.target_query && (
          <span className="rounded-full border border-sky-700 bg-sky-900/40 px-2.5 py-0.5 text-sky-200">
            “{rec.target_query}”
          </span>
        )}
      </div>

      {rec.target_page && (
        <p className="text-sm text-neutral-400">
          <span className="font-semibold text-neutral-500">Page: </span>
          <code className="rounded bg-neutral-900 px-1 text-[12px]">{rec.target_page}</code>
        </p>
      )}

      <p className="mt-3 text-[15px] leading-relaxed text-neutral-100">{rec.recommendation}</p>
      <p className="mt-2 text-[15px] leading-relaxed text-neutral-300">
        <span className="font-semibold text-neutral-400">Why: </span>
        {rec.rationale}
      </p>
      <p className="mt-2 text-[15px] leading-relaxed text-neutral-300">
        <span className="font-semibold text-neutral-400">Expected impact: </span>
        {rec.expected_impact}
      </p>
      <p className="mt-2 text-sm text-neutral-500">
        <span className="font-semibold">Data: </span>
        {rec.source_data}
      </p>
      <p className="mt-2 text-sm text-neutral-300">
        <span className="font-semibold text-neutral-400">Next step: </span>
        {rec.next_step}
      </p>

      {rec.handoff?.coding_agent_prompt && (
        <div className="mt-4">
          <button
            onClick={copyPrompt}
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/15"
          >
            {copied
              ? '✓ Copied — paste into Claude Code / Codex'
              : `Copy coding-agent prompt${rec.target_repo && rec.target_repo !== 'none' ? ` · ${rec.target_repo}` : ''}`}
          </button>
          <details className="mt-2">
            <summary className="cursor-pointer text-sm text-neutral-500 hover:text-neutral-300">
              Preview prompt
            </summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-neutral-950 p-4 text-sm leading-relaxed text-neutral-300">
              {rec.handoff.coding_agent_prompt}
            </pre>
          </details>
        </div>
      )}
      {rec.handoff?.founder_steps && rec.handoff.founder_steps.length > 0 && (
        <div className="mt-4 rounded-lg border border-neutral-800/80 bg-neutral-950/45 p-4">
          <div className="text-sm font-semibold text-neutral-300">Your steps</div>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed text-neutral-300">
            {rec.handoff.founder_steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 border-t border-neutral-800 pt-4">
        {accepted ? (
          <span className="text-sm text-emerald-300">✓ Already in this week’s action board</span>
        ) : (
          <button
            onClick={accept}
            disabled={busy}
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-50"
          >
            {busy ? 'Adding…' : 'Add to plan'}
          </button>
        )}
        {error && <span className="text-sm text-rose-400">{error}</span>}
      </div>
    </li>
  );
}
