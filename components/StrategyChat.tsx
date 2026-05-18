'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ChatMessage, StrategyRecommendation } from '../src/types.js';
import { useProvider, type Provider } from './ProviderSelect';
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
              : `Copy coding-agent prompt${
                  r.target_repo !== 'none' ? ` · ${r.target_repo}` : ''
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
}: {
  week: string;
  initialChat: ChatMessage[];
  hasStrategy: boolean;
}) {
  const [provider, setProvider] = useProvider({
    storageKey: 'llm-provider-strategy',
    fallback: 'openai',
  });

  const label = (p: Provider) =>
    p === 'openai' ? 'GPT-5.5' : p === 'deepseek' ? 'DeepSeek' : 'Claude';

  return (
    <ChatCore<Revision>
      title="Discuss the strategy"
      collapsedLabel="💬 Discuss the strategy — refine recommendations, get handoff prompts"
      placeholder="Ask the PM… e.g. “make the price cheaper” or “give me the Codex prompt for the paywall”  (Enter to send)"
      emptyHint="Interrogate or refine this week's strategy. Ask for a cheaper price, different gating, a brand-new idea, or a ready-to-paste coding-agent prompt for any recommendation."
      initialChat={initialChat}
      defaultOpen={hasStrategy}
      provider={provider}
      setProvider={setProvider}
      providerOptions={['openai', 'claude', 'deepseek']}
      providerTitle="Which model acts as PM"
      busyLabel={(p) => `${label(p)} is thinking`}
      onSend={async (messages, p) => {
        const res = await fetch('/api/strategy/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ week, messages, provider: p }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Chat failed');
        return { reply: body.reply as ChatMessage, extra: (body.revision as Revision) ?? null };
      }}
      renderExtra={({ extra, clear }) => (
        <RevisionCard week={week} revision={extra} clear={clear} />
      )}
    />
  );
}
