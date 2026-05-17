'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '../src/types.js';
import { ProviderSelect, type Provider } from './ProviderSelect';
import { ProgressBar, useElapsed } from './ProgressBar';

export const MD_CLASS =
  'space-y-2 [&_p]:m-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 ' +
  '[&_li]:my-0.5 [&_code]:rounded [&_code]:bg-neutral-900 [&_code]:px-1 [&_code]:py-0.5 ' +
  '[&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-neutral-900 [&_pre]:p-2 ' +
  '[&_a]:underline [&_strong]:font-semibold [&_h1]:font-semibold [&_h2]:font-semibold ' +
  '[&_h3]:font-semibold [&_table]:w-full [&_th]:border [&_th]:border-neutral-700 [&_th]:px-2 ' +
  '[&_td]:border [&_td]:border-neutral-700 [&_td]:px-2';

export interface SendResult<E> {
  reply: ChatMessage;
  /** A suggestion/revision payload to render via renderExtra. */
  extra?: E | null;
  /** If the server returned the authoritative transcript, replace with it. */
  replaceMessages?: ChatMessage[];
}

/**
 * Generic chat surface shared by the analytics ChatPanel and the strategy
 * StrategyChat: textarea (Enter sends / Shift+Enter newline), markdown replies,
 * scroll-within-box, thinking progress, provider select. The network call and
 * the optional "extra" card (caveat-save / revision-apply) are injected.
 */
export function ChatCore<E>({
  title,
  collapsedLabel,
  placeholder,
  emptyHint,
  initialChat,
  defaultOpen,
  provider,
  setProvider,
  providerOptions,
  providerTitle,
  busyLabel,
  onSend,
  renderExtra,
}: {
  title: string;
  collapsedLabel: string;
  placeholder: string;
  emptyHint: string;
  initialChat: ChatMessage[];
  defaultOpen?: boolean;
  provider: Provider;
  setProvider: (p: Provider) => void;
  providerOptions: Provider[];
  providerTitle: string;
  busyLabel: (p: Provider) => string;
  onSend: (messages: ChatMessage[], provider: Provider) => Promise<SendResult<E>>;
  renderExtra?: (args: {
    extra: E;
    clear: () => void;
    setMessages: (m: ChatMessage[]) => void;
    provider: Provider;
  }) => ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen || initialChat.length > 0);
  const [messages, setMessages] = useState<ChatMessage[]>(initialChat);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [extra, setExtra] = useState<E | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const sendElapsed = useElapsed(busy);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, extra]);

  function grow(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 208)}px`;
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setExtra(null);
    const next: ChatMessage[] = [
      ...messages,
      { role: 'user', content: text, ts: new Date().toISOString() },
    ];
    setMessages(next);
    setInput('');
    if (taRef.current) taRef.current.style.height = 'auto';
    setBusy(true);
    try {
      const res = await onSend(next, provider);
      if (res.replaceMessages) setMessages(res.replaceMessages);
      else setMessages((m) => [...m, res.reply]);
      if (res.extra) setExtra(res.extra);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chat failed');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3 text-sm text-neutral-300 hover:bg-neutral-900"
      >
        {collapsedLabel}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-200">{title}</h2>
        <div className="flex items-center gap-3">
          <ProviderSelect
            provider={provider}
            onChange={setProvider}
            options={providerOptions}
            title={providerTitle}
            disabled={busy}
          />
          <button
            onClick={() => setOpen(false)}
            className="text-xs text-neutral-500 hover:text-neutral-300"
          >
            Hide
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="max-h-[28rem] space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-base leading-relaxed text-neutral-400">{emptyHint}</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[85%] rounded-lg px-3.5 py-2.5 text-[15px] leading-relaxed ${
                m.role === 'user'
                  ? 'whitespace-pre-wrap bg-emerald-700/40 text-emerald-50'
                  : 'bg-neutral-800 text-neutral-100'
              }`}
            >
              {m.role === 'user' ? (
                m.content
              ) : (
                <div className={MD_CLASS}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}

        {extra != null &&
          renderExtra?.({
            extra,
            clear: () => setExtra(null),
            setMessages,
            provider,
          })}

        {busy && <ProgressBar seconds={sendElapsed} label={busyLabel(provider)} />}
        {error && <div className="text-sm text-rose-400">{error}</div>}
      </div>

      <div className="flex items-end gap-2 border-t border-neutral-800 p-3">
        <textarea
          ref={taRef}
          value={input}
          rows={3}
          onChange={(e) => {
            setInput(e.target.value);
            grow(e.target);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={placeholder}
          disabled={busy}
          className="max-h-52 flex-1 resize-none rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-[15px] leading-relaxed outline-none focus:border-neutral-500 disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
