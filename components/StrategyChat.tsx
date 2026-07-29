'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ChatMessage, StrategyRecommendation } from '../src/types.js';
import { useProvider, useModel, type Provider, PROVIDER_LABEL } from './ProviderSelect';
import { ProgressBar, useElapsed } from './ProgressBar';
import { ChatCore } from './ChatCore';

type Revision = {
  replaces_id?: string;
  recommendation: Omit<StrategyRecommendation, 'id'>;
};

function RevisionCard({
  week,
  revision,
  clear,
}: {
  week: string;
  revision: Revision;
  clear: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elapsed = useElapsed(saving);
  const r = revision.recommendation;

  async function copyPrompt() {
    if (!r.handoff.coding_agent_prompt) return;
    await navigator.clipboard.writeText(r.handoff.coding_agent_prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function apply() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/strategy/revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week, ...revision }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to apply');
      clear();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply');
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-violet-800 bg-violet-950/40 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-violet-300">
        {revision.replaces_id ? 'Revised recommendation' : 'New recommendation'} · {r.area}
      </div>
      <p className="mt-1 text-sm font-medium text-violet-100">{r.title}</p>
      <p className="mt-1 text-sm text-violet-100/90">{r.recommendation}</p>

      {r.handoff.coding_agent_prompt && (
        <div className="mt-3">
          <button
            onClick={copyPrompt}
            className="rounded-md border border-emerald-700 bg-emerald-900/40 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-900/70"
          >
            {copied
              ? '✓ Copied — paste into Claude Code / Codex'
              : `Copy coding-agent prompt${r.target_repo !== 'none' ? ` · ${r.target_repo}` : ''
              }`}
          </button>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-violet-300/80 hover:text-violet-200">
              Preview prompt
            </summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-neutral-950 p-3 text-xs leading-relaxed text-neutral-300">
              {r.handoff.coding_agent_prompt}
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
          {saving ? 'Applying…' : revision.replaces_id ? 'Apply & replace' : 'Add to strategy'}
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
          <ProgressBar seconds={elapsed} label="Saving to the strategy" />
        </div>
      )}
      {error && <div className="mt-2 text-sm text-rose-400">{error}</div>}
    </div>
  );
}

export function StrategyChat({
  week,
  initialChat,
  hasStrategy,
  recommendation,
  rank,
}: {
  week: string;
  initialChat: ChatMessage[];
  hasStrategy: boolean;
  recommendation?: StrategyRecommendation;
  rank?: number;
}) {
  const [provider, setProvider] = useProvider({
    storageKey: 'llm-provider-strategy',
    fallback: 'openai',
  });
  const [model, setModel] = useModel(provider);
  const [regenStarted, setRegenStarted] = useState(false);

  const focused = recommendation != null;
  const recommendationLabel = rank ? `Recommendation #${rank}` : 'Recommendation';

  return (
    <ChatCore<Revision>
      title={
        focused
          ? `${recommendationLabel}: ${recommendation.title}`
          : 'Discuss the overall strategy'
      }
      collapsedLabel={
        focused
          ? 'Discuss or regenerate this recommendation'
          : 'Discuss the overall strategy'
      }
      placeholder={
        focused
          ? 'Explain what should change, or ask a question about this recommendation…'
          : 'Ask the PM about priorities, tradeoffs, or the overall strategy…'
      }
      emptyHint={
        focused
          ? 'This thread is tied to this recommendation. Ask questions or request a concrete revision. Any regenerated version is shown for review before it replaces the current recommendation.'
          : "Interrogate or refine this week's strategy. Each recommendation also has its own discussion and regeneration control."
      }
      initialChat={initialChat}
      defaultOpen={focused || hasStrategy}
      provider={provider}
      setProvider={setProvider}
      model={model}
      setModel={setModel}
      providerOptions={['openai', 'claude', 'deepseek', 'qwen']}
      providerTitle="Which model acts as PM"
      busyLabel={(p) => `${PROVIDER_LABEL[p]} is thinking`}
      suggestedPrompts={
        focused
          ? [
            {
              label: 'Regenerate',
              prompt:
                'Regenerate this recommendation from scratch using the same evidence and strategy goal. Return a complete replacement for my review.',
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
                'Challenge the ranking of this strategy. Which recommendation should actually be first, and why?',
            },
            {
              label: 'Add recommendation',
              prompt:
                'Propose one additional recommendation that fills the biggest gap in the strategy.',
            },
          ]
      }
      onSend={async (messages, p, m) => {
        const res = await fetch('/api/strategy/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            week,
            messages,
            provider: p,
            model: m,
            recommendationId: recommendation?.id,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Chat failed');
        return { reply: body.reply as ChatMessage, extra: (body.revision as Revision) ?? null };
      }}
      renderExtra={({ extra, clear }) => (
        <RevisionCard week={week} revision={extra} clear={clear} />
      )}
      renderAction={({ messages, busy }) =>
        focused || messages.length === 0 ? null : (
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-emerald-100">
                {hasStrategy
                  ? 'Regenerate the strategy using this PM discussion.'
                  : 'Generate the strategy using this PM discussion.'}
              </p>
              <button
                onClick={() => {
                  setRegenStarted(true);
                  window.dispatchEvent(
                    new CustomEvent('llmnesia:strategy-regenerate', {
                      detail: { week },
                    }),
                  );
                }}
                disabled={busy}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {hasStrategy ? 'Regenerate strategy' : 'Generate strategy'}
              </button>
            </div>
            {regenStarted && (
              <p className="mt-2 text-xs text-emerald-300">
                Started — watch the strategy panel below for progress.
              </p>
            )}
          </div>
        )
      }
    />
  );
}
