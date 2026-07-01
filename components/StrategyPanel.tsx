'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type {
  ChatMessage,
  StrategyDecision,
  StrategyRecommendation,
  StrategyResult,
} from '../src/types.js';
import { formatDateTime } from '../lib/format';
import { ProviderSelect, useProvider, type Provider } from './ProviderSelect';
import { ProgressBar, useElapsed } from './ProgressBar';
import { GenerationContextBox } from './GenerationContextBox';
import { StrategyChat } from './StrategyChat';

const STATUS_STYLE: Record<StrategyDecision['status'], string> = {
  accepted: 'bg-emerald-900/60 text-emerald-200 border-emerald-700',
  shipped: 'bg-sky-900/60 text-sky-200 border-sky-700',
  deferred: 'bg-amber-900/60 text-amber-200 border-amber-700',
  rejected: 'bg-rose-900/60 text-rose-200 border-rose-700',
};

const AREA_STYLE: Record<string, string> = {
  monetization: 'bg-violet-900/50 text-violet-200 border-violet-700',
  pricing: 'bg-violet-900/50 text-violet-200 border-violet-700',
  growth: 'bg-emerald-900/50 text-emerald-200 border-emerald-700',
  retention: 'bg-sky-900/50 text-sky-200 border-sky-700',
  site: 'bg-neutral-800 text-neutral-200 border-neutral-600',
  app: 'bg-neutral-800 text-neutral-200 border-neutral-600',
};

const EFFORT = { S: 'Small', M: 'Medium', L: 'Large' } as const;
/** Decided and done with — hide from the active list, same as Growth's board. */
const HANDLED_DECISION_STATUSES = new Set<StrategyDecision['status']>(['shipped', 'rejected']);
const STALE_MS = 20 * 60 * 1000;
const pendingKey = (week: string) => `llmnesia:strat-pending:${week}`;

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-xs capitalize ${
        className ?? 'border-neutral-600 bg-neutral-800 text-neutral-300'
      }`}
    >
      {children}
    </span>
  );
}

function RecommendationCard({
  week,
  rec,
  rank,
  decision,
  onDecided,
  initialChat,
}: {
  week: string;
  rec: StrategyRecommendation;
  rank: number;
  decision?: StrategyDecision;
  onDecided: (d: StrategyDecision[]) => void;
  initialChat: ChatMessage[];
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discussing, setDiscussing] = useState(initialChat.length > 0);
  const top = rank === 1;

  async function decide(status: StrategyDecision['status']) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/strategy/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week,
          recommendation_id: rec.id,
          status,
          title: rec.title,
          [status === 'shipped' ? 'outcome' : 'note']: note || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed');
      onDecided(body.decisions as StrategyDecision[]);
      setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function copyPrompt() {
    if (!rec.handoff.coding_agent_prompt) return;
    await navigator.clipboard.writeText(rec.handoff.coding_agent_prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        {decision && (
          <Chip className={STATUS_STYLE[decision.status]}>{decision.status}</Chip>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Chip className={AREA_STYLE[rec.area]}>{rec.area}</Chip>
        <Chip>{EFFORT[rec.effort]} effort</Chip>
        <Chip>{rec.confidence} confidence</Chip>
        {rec.target_repo !== 'none' && <Chip>{rec.target_repo}</Chip>}
      </div>

      <p className="text-[15px] leading-relaxed text-neutral-100">{rec.recommendation}</p>
      <p className="mt-3 text-[15px] leading-relaxed text-neutral-300">
        <span className="font-semibold text-neutral-400">Why: </span>
        {rec.rationale}
      </p>
      <p className="mt-2 text-[15px] leading-relaxed text-neutral-300">
        <span className="font-semibold text-neutral-400">Expected impact: </span>
        {rec.expected_impact}
      </p>
      {rec.metrics_to_watch.length > 0 && (
        <p className="mt-2 text-sm text-neutral-500">
          Watch: {rec.metrics_to_watch.join(' · ')}
        </p>
      )}

      {rec.handoff.coding_agent_prompt && (
        <div className="mt-4">
          <button
            onClick={copyPrompt}
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/15"
          >
            {copied
              ? '✓ Copied — paste into Claude Code / Codex'
              : `Copy coding-agent prompt${rec.target_repo !== 'none' ? ` · ${rec.target_repo}` : ''}`}
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
      {rec.handoff.founder_steps && rec.handoff.founder_steps.length > 0 && (
        <div className="mt-4 rounded-lg border border-neutral-800/80 bg-neutral-950/45 p-4">
          <div className="text-sm font-semibold text-neutral-300">Your steps</div>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed text-neutral-300">
            {rec.handoff.founder_steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-800 pt-4">
        <button
          type="button"
          onClick={() => setDiscussing((open) => !open)}
          aria-expanded={discussing}
          className="rounded-md border border-violet-500/40 bg-violet-500/10 px-3.5 py-2 text-sm font-medium text-violet-200 hover:bg-violet-500/15"
        >
          {discussing ? 'Close discussion' : 'Discuss / regenerate'}
        </button>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note / outcome…"
          className="min-w-[12rem] flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none placeholder:text-neutral-600 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10"
        />
        {(['accepted', 'deferred', 'rejected', 'shipped'] as const).map((s) => (
          <button
            key={s}
            onClick={() => decide(s)}
            disabled={busy}
            className="rounded-md border border-neutral-700 px-3.5 py-2 text-sm capitalize text-neutral-200 hover:bg-neutral-800/80 disabled:opacity-50"
          >
            {s === 'shipped' ? 'Mark shipped' : s}
          </button>
        ))}
      </div>
      {decision?.note && (
        <p className="mt-2 text-sm text-neutral-400">Note: {decision.note}</p>
      )}
      {decision?.outcome && (
        <p className="mt-1 text-sm text-neutral-400">Outcome: {decision.outcome}</p>
      )}
      {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
      {discussing && (
        <div className="mt-4 border-t border-neutral-800 pt-4">
          <StrategyChat
            week={week}
            recommendation={rec}
            rank={rank}
            initialChat={initialChat}
            hasStrategy
          />
        </div>
      )}
    </li>
  );
}

export function StrategyPanel({
  week,
  strategy: initialStrategy,
  strategyGoal: initialStrategyGoal,
  decisions: initialDecisions,
  recommendationChats,
}: {
  week: string;
  strategy: StrategyResult | null;
  strategyGoal?: string | null;
  decisions: StrategyDecision[];
  recommendationChats: Record<string, ChatMessage[]>;
}) {
  const router = useRouter();
  const [strategy, setStrategy] = useState<StrategyResult | null>(initialStrategy);
  const [decisions, setDecisions] = useState<StrategyDecision[]>(initialDecisions);
  const [provider, setProvider] = useProvider({
    storageKey: 'llm-provider-strategy',
    fallback: 'openai',
  });
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationContext, setGenerationContext] = useState('');
  const [strategyGoal, setStrategyGoal] = useState(initialStrategyGoal ?? '');
  const baseOffset = useRef(0);
  const tick = useElapsed(busy || polling);
  const shown = baseOffset.current + tick;

  const label = (p: Provider) =>
    p === 'openai' ? 'GPT-5.5' : p === 'deepseek' ? 'DeepSeek' : 'Claude';

  const pollStop = useRef(true);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setStrategy(initialStrategy);
    setDecisions(initialDecisions);
    setStrategyGoal(initialStrategyGoal ?? '');
    const raw = localStorage.getItem(pendingKey(week));
    const start = raw ? Number(raw) : 0;
    const generatedAt = initialStrategy?.generated_at
      ? new Date(initialStrategy.generated_at).getTime()
      : 0;
    if (initialStrategy && (!start || generatedAt >= start - 1000)) {
      localStorage.removeItem(pendingKey(week));
    }
  }, [week, initialStrategy, initialStrategyGoal, initialDecisions]);

  function stopPoll() {
    pollStop.current = true;
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }

  // Poll the row until the server-side generation lands. Generation runs in
  // the route's after() handler — owned by the server, so it finishes and
  // saves even if this tab is closed/navigated/reloaded. This just watches.
  function runPoll(startMs: number) {
    pollStop.current = false;
    baseOffset.current = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    setPolling(true);
    const step = async () => {
      if (pollStop.current) return;
      try {
        const r = await fetch(`/api/strategy?week=${week}`);
        if (r.ok) {
          const b = await r.json();
          const nextStrategy = b.strategy as StrategyResult | null;
          const generatedAt = nextStrategy?.generated_at
            ? new Date(nextStrategy.generated_at).getTime()
            : 0;
          if (nextStrategy && generatedAt >= startMs - 1000) {
            setStrategy(nextStrategy);
            setDecisions((b.decisions as StrategyDecision[]) ?? []);
            localStorage.removeItem(pendingKey(week));
            setPolling(false);
            stopPoll();
            router.refresh();
            return;
          }
        }
      } catch {
        /* transient — keep polling */
      }
      if (Date.now() - startMs > STALE_MS) {
        localStorage.removeItem(pendingKey(week));
        setPolling(false);
        setError('Generation took too long. Try again.');
        stopPoll();
        return;
      }
      pollTimer.current = setTimeout(step, 15000);
    };
    pollTimer.current = setTimeout(step, 4000);
  }

  // On mount: if a generation was kicked off (marker present) and the result
  // isn't here yet, resume watching it.
  useEffect(() => {
    const raw = localStorage.getItem(pendingKey(week));
    const start = raw ? Number(raw) : 0;
    if (initialStrategy) {
      const generatedAt = initialStrategy.generated_at
        ? new Date(initialStrategy.generated_at).getTime()
        : 0;
      if (!start || generatedAt >= start - 1000) {
        localStorage.removeItem(pendingKey(week));
        return;
      }
    }
    if (!start || Date.now() - start > STALE_MS) {
      if (raw) localStorage.removeItem(pendingKey(week));
      return;
    }
    runPoll(start);
    return () => stopPoll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Always stop polling when the component goes away.
  useEffect(() => () => stopPoll(), []);

  async function generate(contextOverride?: string) {
    if (busy || polling) return;
    setBusy(true);
    setError(null);
    const start = Date.now();
    localStorage.setItem(pendingKey(week), String(start));
    try {
      const res = await fetch('/api/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week,
          provider,
          generationContext: (contextOverride ?? generationContext).trim() || undefined,
          strategyGoal: strategyGoal.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || `Failed (${res.status})`);
      }
      // 202 Accepted — generation now runs server-side; watch for the result.
      runPoll(start);
    } catch (e) {
      localStorage.removeItem(pendingKey(week));
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ week?: string; context?: string }>).detail;
      if (detail?.week && detail.week !== week) return;
      void generate(detail?.context);
    };
    window.addEventListener('llmnesia:strategy-regenerate', handler);
    return () => window.removeEventListener('llmnesia:strategy-regenerate', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week, busy, polling, provider, generationContext, strategyGoal]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ week?: string; goal?: string }>).detail;
      if (detail?.week && detail.week !== week) return;
      setStrategyGoal(detail?.goal ?? '');
    };
    window.addEventListener('llmnesia:strategy-goal-change', handler);
    return () => window.removeEventListener('llmnesia:strategy-goal-change', handler);
  }, [week]);

  const byId = new Map(decisions.map((d) => [d.recommendation_id, d]));
  const working = busy || polling;
  const activeRecommendations =
    strategy?.recommendations.filter((rec) => {
      const decision = byId.get(rec.id);
      return !decision || !HANDLED_DECISION_STATUSES.has(decision.status);
    }) ?? [];
  const handledCount = (strategy?.recommendations.length ?? 0) - activeRecommendations.length;
  const sortedDecisions = [...decisions].sort(
    (a, b) => new Date(b.decided_at).getTime() - new Date(a.decided_at).getTime(),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-neutral-100">Revenue & growth strategy</h2>
          {strategy && (
            <p className="text-sm text-neutral-500">
              {label(provider)} · generated {formatDateTime(strategy.generated_at)} · model{' '}
              {strategy.model_used}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ProviderSelect
            provider={provider}
            onChange={setProvider}
            options={['openai', 'claude', 'deepseek']}
            title="Which model acts as PM"
            disabled={working}
          />
          <button
            onClick={() => generate()}
            disabled={working}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_22px_rgba(5,150,105,0.2)] hover:bg-emerald-500 disabled:opacity-50 disabled:shadow-none"
          >
            {working ? 'Working…' : strategy ? 'Regenerate' : 'Generate PM strategy'}
          </button>
        </div>
      </div>

      <GenerationContextBox
        value={generationContext}
        onChange={setGenerationContext}
        disabled={working}
        placeholder="Optional: e.g. wait for the release to be pushed before recommending follow-up, prioritize store listing work, avoid pricing changes this week…"
        label="Context for next strategy generation"
      />

      {working && (
        <div className="rounded-lg border border-neutral-800/80 bg-neutral-900/70 p-4 shadow-[0_12px_34px_rgba(0,0,0,0.16)]">
          <ProgressBar
            seconds={shown}
            label={`${label(provider)} is thinking through the strategy (reasoning model — a few minutes)${
              polling ? ' · running in the background, safe to navigate away' : ''
            }`}
          />
          <p className="mt-2 text-sm text-neutral-500">
            This keeps running even if you leave this tab — come back and it’ll be here.
          </p>
        </div>
      )}
      {error && <div className="text-base text-rose-400">{error}</div>}

      {!strategy && !working && (
        <div className="rounded-lg border border-neutral-800/80 bg-neutral-900/70 px-5 py-8 text-center shadow-[0_12px_34px_rgba(0,0,0,0.16)]">
          <p className="text-base text-neutral-300">No strategy yet for this week.</p>
          <p className="mx-auto mt-2 max-w-xl text-[15px] leading-relaxed text-neutral-500">
            Generate one — the PM reads the project brief, this week’s analysis, prior theses
            and your past decisions, then proposes how to grow now and make money later.
          </p>
        </div>
      )}

      {strategy && (
        <>
          <section className="rounded-lg border border-emerald-500/35 bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(23,23,23,0.72))] p-6 shadow-[0_16px_42px_rgba(0,0,0,0.2)]">
            <div className="text-xs font-bold uppercase tracking-widest text-emerald-400">
              This week’s thesis
            </div>
            <p className="mt-2 text-xl font-semibold leading-relaxed text-neutral-50">
              {strategy.thesis}
            </p>
          </section>

          <section className="rounded-lg border border-neutral-800/80 bg-neutral-900/70 p-6 shadow-[0_12px_34px_rgba(0,0,0,0.16)]">
            <h3 className="mb-3 text-base font-bold text-neutral-100">
              Monetization plan (design-ahead)
            </h3>
            <dl className="space-y-2 text-[15px] leading-relaxed">
              <div>
                <dt className="inline font-semibold text-neutral-400">Model: </dt>
                <dd className="inline text-neutral-100">{strategy.monetization.model}</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-neutral-400">What’s paid: </dt>
                <dd className="inline text-neutral-100">
                  {strategy.monetization.what_to_gate}
                </dd>
              </div>
              <div>
                <dt className="inline font-semibold text-neutral-400">Pricing hypothesis: </dt>
                <dd className="inline text-neutral-100">
                  {strategy.monetization.pricing_hypothesis}
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <h3 className="mb-3 text-base font-bold text-neutral-100">
              {activeRecommendations.length > 0
                ? 'Recommendations — ranked, do #1 first'
                : 'Recommendations'}
              {handledCount > 0 && (
                <span className="ml-2 text-sm font-normal text-neutral-500">
                  {handledCount} shipped/rejected hidden
                </span>
              )}
            </h3>
            {activeRecommendations.length === 0 ? (
              <div className="rounded-lg border border-neutral-800/80 bg-neutral-900/70 px-5 py-6 text-sm text-neutral-400 shadow-[0_12px_34px_rgba(0,0,0,0.16)]">
                All recommendations in this strategy have been shipped or rejected. Regenerate when
                you want a fresh set.
              </div>
            ) : (
              <ul className="space-y-4">
                {activeRecommendations.map((rec) => (
                  <RecommendationCard
                    key={rec.id}
                    week={week}
                    rec={rec}
                    rank={strategy.recommendations.indexOf(rec) + 1}
                    decision={byId.get(rec.id)}
                    onDecided={setDecisions}
                    initialChat={recommendationChats[rec.id] ?? []}
                  />
                ))}
              </ul>
            )}
          </section>

          {sortedDecisions.length > 0 && (
            <details className="rounded-lg border border-neutral-800/80 bg-neutral-900/50 shadow-[0_12px_34px_rgba(0,0,0,0.16)]">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-neutral-300 hover:bg-neutral-900/70">
                Decision history ({sortedDecisions.length}) — every decision ever made this week,
                even after regenerating
              </summary>
              <ul className="space-y-2 border-t border-neutral-800 p-4">
                {sortedDecisions.map((d, i) => (
                  <li
                    key={`${d.recommendation_id}-${i}`}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800/80 bg-neutral-950/40 p-3 text-sm"
                  >
                    <Chip className={STATUS_STYLE[d.status]}>{d.status}</Chip>
                    <span className="font-medium text-neutral-200">
                      {d.title ?? 'Untitled recommendation'}
                    </span>
                    {d.outcome && <span className="text-neutral-400">— outcome: {d.outcome}</span>}
                    {d.note && <span className="text-neutral-400">— note: {d.note}</span>}
                    <span className="ml-auto text-xs text-neutral-600">
                      {formatDateTime(d.decided_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {strategy.experiments.length > 0 && (
            <section className="rounded-lg border border-neutral-800/80 bg-neutral-900/70 p-6 shadow-[0_12px_34px_rgba(0,0,0,0.16)]">
              <h3 className="mb-3 text-base font-bold text-neutral-100">Experiments</h3>
              <ul className="space-y-2 text-[15px] leading-relaxed text-neutral-200">
                {strategy.experiments.map((e, i) => (
                  <li key={i}>
                    {e.hypothesis}{' '}
                    <span className="text-neutral-500">— measure: {e.measure}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {strategy.risks.length > 0 && (
            <section className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-6 shadow-[0_12px_34px_rgba(0,0,0,0.16)]">
              <h3 className="mb-3 text-base font-bold text-amber-300">Risks</h3>
              <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-amber-100">
                {strategy.risks.map((r, i) => (
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
