'use client';

import { useEffect, useState } from 'react';

export type Provider = 'claude' | 'deepseek' | 'openai';

export const PROVIDER_LABEL: Record<Provider, string> = {
  claude: 'Claude',
  deepseek: 'DeepSeek',
  openai: 'GPT-5.5',
};

const ALL: Provider[] = ['claude', 'deepseek', 'openai'];

/**
 * Remembers the chosen model in localStorage so selectors stay in sync and the
 * choice survives reloads. Starts on `fallback` to avoid an SSR/CSR hydration
 * mismatch, then reads the stored value. The analyst surfaces share the default
 * key; the strategist uses its own key so it can default to GPT-5.5
 * independently.
 */
export function useProvider(opts?: {
  storageKey?: string;
  fallback?: Provider;
}): [Provider, (p: Provider) => void] {
  const key = opts?.storageKey ?? 'llm-provider';
  const fallback = opts?.fallback ?? 'claude';
  const [provider, setProvider] = useState<Provider>(fallback);

  useEffect(() => {
    const saved = window.localStorage.getItem(key);
    if (saved && (ALL as string[]).includes(saved)) setProvider(saved as Provider);
  }, [key]);

  const set = (p: Provider) => {
    setProvider(p);
    window.localStorage.setItem(key, p);
  };

  return [provider, set];
}

export function ProviderSelect({
  provider,
  onChange,
  disabled,
  options = ['claude', 'deepseek'],
  title = 'Which model to use',
}: {
  provider: Provider;
  onChange: (p: Provider) => void;
  disabled?: boolean;
  options?: Provider[];
  title?: string;
}) {
  return (
    <select
      value={provider}
      onChange={(e) => onChange(e.target.value as Provider)}
      disabled={disabled}
      title={title}
      className="rounded-md border border-neutral-700 bg-neutral-950/80 px-3 py-2 text-sm text-neutral-200 outline-none hover:border-neutral-600 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10 disabled:opacity-50"
    >
      {options.map((p) => (
        <option key={p} value={p}>
          {PROVIDER_LABEL[p]}
        </option>
      ))}
    </select>
  );
}
