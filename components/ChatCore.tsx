'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatAttachment, ChatMessage } from '../src/types.js';
import { ProviderSelect, type Provider } from './ProviderSelect';
import { ProgressBar, useElapsed } from './ProgressBar';

/** GA4 exports are tiny; this is a generous guard against pasting a huge file. */
const MAX_FILE_BYTES = 1_000_000;
const ACCEPT = '.csv,.tsv,.txt,.json,.md,text/csv,text/plain,application/json';

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
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [extra, setExtra] = useState<E | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sendElapsed = useElapsed(busy);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, extra]);

  function grow(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 208)}px`;
  }

  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    const picked: ChatAttachment[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX_FILE_BYTES) {
        setError(`"${f.name}" is too large (max 1 MB).`);
        continue;
      }
      picked.push({ name: f.name, content: await f.text() });
    }
    if (picked.length) setAttachments((a) => [...a, ...picked]);
  }

  async function send() {
    const text = input.trim();
    if ((!text && attachments.length === 0) || busy) return;
    setError(null);
    setExtra(null);
    const next: ChatMessage[] = [
      ...messages,
      {
        role: 'user',
        content: text,
        ts: new Date().toISOString(),
        ...(attachments.length ? { attachments } : {}),
      },
    ];
    setMessages(next);
    setInput('');
    setAttachments([]);
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
        className="rounded-lg border border-neutral-800/80 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-300 shadow-[0_10px_30px_rgba(0,0,0,0.16)] hover:border-neutral-700 hover:bg-neutral-900"
      >
        {collapsedLabel}
      </button>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-800/80 bg-neutral-900/70 shadow-[0_16px_42px_rgba(0,0,0,0.22)]">
      <div className="flex items-center justify-between border-b border-neutral-800/80 bg-neutral-950/45 px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
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
            className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-800/80 hover:text-neutral-300"
          >
            Hide
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="max-h-[28rem] space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="rounded-lg border border-dashed border-neutral-800 bg-neutral-950/35 p-4 text-base leading-relaxed text-neutral-400">
            {emptyHint}
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[85%] rounded-lg px-3.5 py-2.5 text-[15px] leading-relaxed shadow-[0_6px_18px_rgba(0,0,0,0.14)] ${
                m.role === 'user'
                  ? 'whitespace-pre-wrap bg-emerald-600/25 text-emerald-50 ring-1 ring-emerald-500/20'
                  : 'bg-neutral-800/90 text-neutral-100 ring-1 ring-neutral-700/50'
              }`}
            >
              {m.role === 'user' ? (
                <>
                  {m.content && <div className="whitespace-pre-wrap">{m.content}</div>}
                  {m.attachments?.length ? (
                    <div className={`flex flex-wrap gap-1.5 ${m.content ? 'mt-2' : ''}`}>
                      {m.attachments.map((a, j) => (
                        <span
                          key={j}
                          className="rounded bg-emerald-900/60 px-2 py-0.5 text-xs text-emerald-100"
                          title={`${a.content.length.toLocaleString()} chars`}
                        >
                          📎 {a.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </>
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

      <div className="space-y-2 border-t border-neutral-800/80 bg-neutral-950/30 p-3">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((a, i) => (
              <span
                key={i}
                className="flex items-center gap-1 rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-200"
              >
                📎 {a.name}
                <button
                  onClick={() => setAttachments((as) => as.filter((_, j) => j !== i))}
                  disabled={busy}
                  className="text-neutral-500 hover:text-neutral-200 disabled:opacity-50"
                  title="Remove"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            title="Attach CSV / text file (e.g. a GA4 export)"
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800/80 disabled:opacity-50"
          >
            📎
          </button>
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
            className="max-h-52 flex-1 resize-none rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-[15px] leading-relaxed outline-none placeholder:text-neutral-600 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10 disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={busy || (!input.trim() && attachments.length === 0)}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-[0_8px_22px_rgba(5,150,105,0.2)] hover:bg-emerald-500 disabled:opacity-50 disabled:shadow-none"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
