'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ChatMessage, GrowthRecommendation } from '../src/types.js';
import { ChatCore } from './ChatCore';
import { ProgressBar, useElapsed } from './ProgressBar';
import { useProvider, type Provider } from './ProviderSelect';

type GrowthRevision = {
  replaces_id?: string;
  recommendation: Omit<GrowthRecommendation, 'id'>;
};

function RevisionCard({
  siteId,
  weekStart,
  revision,
  clear,
}: {
  siteId: string;
  weekStart: string;
  revision: GrowthRevision;
  clear: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elapsed = useElapsed(saving);
  const rec = revision.recommendation;

  async function copyPrompt() {
    if (!rec.handoff?.coding_agent_prompt) return;
    await navigator.clipboard.writeText(rec.handoff.coding_agent_prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function apply() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/growth/revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, weekStart, ...revision }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to apply recommendation');
      clear();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply recommendation');
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-violet-800 bg-violet-950/40 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-violet-300">
        {revision.replaces_id ? 'Revised recommendation' : 'New recommendation'} ·{' '}
        {rec.action_type.replace('_', ' ')}
      </div>
      <p className="mt-1 text-base font-semibold text-violet-100">{rec.title}</p>
      <p className="mt-2 text-sm leading-relaxed text-violet-100/90">{rec.recommendation}</p>
      <p className="mt-2 text-sm leading-relaxed text-violet-200/80">
        <span className="font-semibold">Why: </span>
        {rec.rationale}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-violet-200/80">
        <span className="font-semibold">Expected impact: </span>
        {rec.expected_impact}
      </p>

      {rec.handoff?.coding_agent_prompt && (
        <div className="mt-3">
          <button
            onClick={copyPrompt}
            className="rounded-md border border-emerald-700 bg-emerald-900/40 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-900/70"
          >
            {copied
              ? '✓ Copied — paste into Claude Code / Codex'
              : `Copy coding-agent prompt${
                  rec.target_repo && rec.target_repo !== 'none' ? ` · ${rec.target_repo}` : ''
                }`}
          </button>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-violet-300/80 hover:text-violet-200">
              Preview prompt
            </summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-neutral-950 p-3 text-xs leading-relaxed text-neutral-300">
              {rec.handoff.coding_agent_prompt}
            </pre>
          </details>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={apply}
          disabled={saving}
          className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {saving
            ? 'Applying…'
            : revision.replaces_id
              ? 'Apply & replace'
              : 'Add to plan'}
        </button>
        <button
          onClick={clear}
          disabled={saving}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
        >
          Dismiss
        </button>
      </div>
      {saving && (
        <div className="mt-3">
          <ProgressBar seconds={elapsed} label="Updating the growth plan" />
        </div>
      )}
      {error && <div className="mt-2 text-sm text-rose-400">{error}</div>}
    </div>
  );
}

export function GrowthPlanChat({
  siteId,
  weekStart,
  initialChat,
  recommendation,
  rank,
}: {
  siteId: string;
  weekStart: string;
  initialChat: ChatMessage[];
  recommendation?: GrowthRecommendation;
  rank?: number;
}) {
  const [provider, setProvider] = useProvider({
    storageKey: 'llm-provider-growth-chat',
    fallback: 'claude',
  });

  const label = (p: Provider) =>
    p === 'openai' ? 'GPT-5.5' : p === 'deepseek' ? 'DeepSeek' : 'Claude';
  const focused = recommendation != null;
  const recommendationLabel = rank ? `Recommendation #${rank}` : 'Recommendation';

  return (
    <ChatCore<GrowthRevision>
      title={
        focused
          ? `${recommendationLabel}: ${recommendation.title}`
          : 'Discuss the overall growth plan'
      }
      collapsedLabel={
        focused
          ? 'Discuss or regenerate this recommendation'
          : 'Discuss the overall plan'
      }
      placeholder={
        focused
          ? 'Explain what should change, or ask a question about this recommendation…'
          : 'Challenge the plan, compare recommendations, or ask to add new work…'
      }
      emptyHint={
        focused
          ? 'This thread is tied to this recommendation. Ask questions or request a concrete revision. Any regenerated version is shown for review before it replaces the current recommendation.'
          : 'Use this for plan-wide questions or to request additional work. Each recommendation also has its own discussion and regeneration control.'
      }
      initialChat={initialChat}
      defaultOpen={focused}
      provider={provider}
      setProvider={setProvider}
      providerOptions={['claude', 'openai', 'deepseek']}
      providerTitle="Which model discusses the growth plan"
      busyLabel={(p) => `${label(p)} is reviewing the plan`}
      suggestedPrompts={
        focused
          ? [
              {
                label: 'Regenerate',
                prompt:
                  'Regenerate this recommendation from scratch using the same evidence and goal. Keep it concrete and return a complete replacement for my review.',
              },
              {
                label: 'Make smaller',
                prompt:
                  'Revise this into the smallest useful version that can be completed quickly this week.',
              },
              {
                label: 'New handoff prompt',
                prompt:
                  'Keep the recommendation, but regenerate a stronger, self-contained coding-agent handoff prompt.',
              },
            ]
          : [
              {
                label: 'Challenge priorities',
                prompt:
                  'Challenge the ranking of this plan. Which recommendation should actually be first, and why?',
              },
              {
                label: 'Add recommendation',
                prompt:
                  'Propose one additional recommendation that fills the biggest gap in the current plan.',
              },
            ]
      }
      onSend={async (messages, p) => {
        const res = await fetch('/api/growth/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteId,
            weekStart,
            messages,
            provider: p,
            recommendationId: recommendation?.id,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Growth chat failed');
        return {
          reply: body.reply as ChatMessage,
          extra: (body.revision as GrowthRevision) ?? null,
        };
      }}
      renderExtra={({ extra, clear }) => (
        <RevisionCard
          siteId={siteId}
          weekStart={weekStart}
          revision={extra}
          clear={clear}
        />
      )}
    />
  );
}
