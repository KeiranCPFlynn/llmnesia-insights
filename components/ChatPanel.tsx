'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ChatMessage } from '../src/types.js';
import { useProvider, type Provider } from './ProviderSelect';
import { ProgressBar, useElapsed } from './ProgressBar';
import { ChatCore } from './ChatCore';

type Suggestion = { kind: 'caveat' | 'context'; affected_metric: string; note: string };

function CorrectionCard({
  week,
  suggestion,
  provider,
  clear,
  setMessages,
}: {
  week: string;
  suggestion: Suggestion;
  provider: Provider;
  clear: () => void;
  setMessages: (m: ChatMessage[]) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elapsed = useElapsed(saving);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week, ...suggestion, provider }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to save');
      if (Array.isArray(body.chat)) setMessages(body.chat as ChatMessage[]);
      clear();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
      setSaving(false);
    }
  }

  const isContext = suggestion.kind === 'context';
  return (
    <div
      className={`rounded-lg border p-3 ${
        isContext ? 'border-sky-800 bg-sky-950/40' : 'border-amber-800 bg-amber-950/40'
      }`}
    >
      <div
        className={`text-xs font-semibold uppercase tracking-wide ${
          isContext ? 'text-sky-300' : 'text-amber-300'
        }`}
      >
        Proposed {isContext ? 'context note' : 'data caveat'} · {suggestion.affected_metric}
      </div>
      <p className={`mt-1 text-sm ${isContext ? 'text-sky-100' : 'text-amber-100'}`}>
        {suggestion.note}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
        >
          {saving ? 'Saving & regenerating…' : 'Save & regenerate report'}
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
          <ProgressBar
            seconds={elapsed}
            label={`Regenerating the report on ${
              provider === 'deepseek' ? 'DeepSeek (~3–4 min)' : 'Claude (~1 min)'
            }`}
          />
        </div>
      )}
      {error && <div className="mt-2 text-sm text-rose-400">{error}</div>}
    </div>
  );
}

export function ChatPanel({
  week,
  initialChat,
}: {
  week: string;
  initialChat: ChatMessage[];
}) {
  const [provider, setProvider] = useProvider();

  return (
    <ChatCore<Suggestion>
      title="Discuss this week"
      collapsedLabel="💬 Discuss this week — question the numbers, flag bad data"
      placeholder="Ask or challenge the data…  (Enter to send, Shift+Enter for a new line)"
      emptyHint="Ask anything about this week, or point out data that looks wrong (e.g. “the zero-result spike is a PostHog misconfig, not real users”). If we agree it’s skewed, I’ll offer to save a caveat and regenerate the report."
      initialChat={initialChat}
      provider={provider}
      setProvider={setProvider}
      providerOptions={['claude', 'deepseek']}
      providerTitle="Which model answers / regenerates the analysis"
      busyLabel={(p) => `${p === 'deepseek' ? 'DeepSeek' : 'Claude'} is thinking`}
      onSend={async (messages, p) => {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ week, messages, provider: p }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Chat failed');
        return { reply: body.reply as ChatMessage, extra: (body.suggestion as Suggestion) ?? null };
      }}
      renderExtra={({ extra, clear, setMessages, provider: p }) => (
        <CorrectionCard
          week={week}
          suggestion={extra}
          provider={p}
          clear={clear}
          setMessages={setMessages}
        />
      )}
    />
  );
}
