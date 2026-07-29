'use client';

import { useEffect, useState } from 'react';

export type Provider = 'claude' | 'deepseek' | 'openai' | 'qwen';

export const PROVIDER_LABEL: Record<Provider, string> = {
  claude: 'Claude',
  deepseek: 'DeepSeek',
  openai: 'GPT-5.5',
  qwen: 'Qwen',
};

const ALL: Provider[] = ['claude', 'deepseek', 'openai', 'qwen'];

/** Fired on every `set()` so same-tab instances sharing a key stay in sync ('storage' only fires cross-tab). */
const PROVIDER_CHANGE_EVENT = 'llm-provider-change';

// ─── Model definitions per provider ──────────────────────────────────

interface ModelDef {
  id: string;
  label: string;
}

const PROVIDER_MODELS: Record<Provider, ModelDef[]> = {
  claude: [
    { id: 'claude-sonnet-5', label: 'Sonnet 5' },
    { id: 'claude-opus-4', label: 'Opus 4' },
    { id: 'claude-haiku-4', label: 'Haiku 4' },
  ],
  deepseek: [
    { id: 'deepseek-v4-pro', label: 'V4 Pro' },
    { id: 'deepseek-chat', label: 'Chat (R1)' },
    { id: 'deepseek-reasoner', label: 'Reasoner' },
  ],
  openai: [
    { id: 'gpt-5.5', label: 'GPT-5.5' },
    { id: 'o3', label: 'o3' },
    { id: 'o4-mini', label: 'o4-mini' },
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
  ],
  qwen: [
    { id: 'qwen3.8-max-preview', label: 'Qwen3.8 Max Preview' },
    { id: 'qwen3.7-plus', label: 'Qwen3.7 Plus' },
    { id: 'qwen3.7-max', label: 'Qwen3.7 Max' },
    { id: 'qwen3.6-flash', label: 'Qwen3.6 Flash' },
    { id: 'qwen3-235b-a22b', label: 'Qwen3 (235B MoE)' },
    { id: 'qwen3-max', label: 'Qwen3 Max' },
    { id: 'qwen3-plus', label: 'Qwen3 Plus' },
    { id: 'qwen3-turbo', label: 'Qwen3 Turbo' },
    { id: 'qwen-plus', label: 'Qwen Plus' },
    { id: 'qwen-turbo', label: 'Qwen Turbo' },
    { id: 'qwen-max', label: 'Qwen Max' },
    { id: 'qwq-plus', label: 'QwQ Plus (reasoning)' },
    { id: 'qwq-32b', label: 'QwQ 32B (reasoning)' },
    { id: 'qwen-coder-plus', label: 'Qwen Coder Plus' },
    { id: 'qwen-coder-plus-latest', label: 'Qwen Coder Latest' },
    { id: 'qwen-long', label: 'Qwen Long (1M ctx)' },
    { id: 'qwen-plus-latest', label: 'Qwen Plus Latest' },
    { id: 'qwen-max-latest', label: 'Qwen Max Latest' },
    { id: 'glm-5.2', label: 'GLM 5.2' },
  ],
};

// Default model for each provider (matches env defaults in src/llm.ts)
const DEFAULT_MODEL: Record<Provider, string> = {
  claude: 'claude-sonnet-5',
  deepseek: 'deepseek-v4-pro',
  openai: 'gpt-5.5',
  qwen: 'qwen-plus',
};

/** Storage key suffixes — one localStorage key per provider. */
const MODEL_STORAGE_KEY_SUFFIX: Record<Provider, string> = {
  claude: 'model-claude',
  deepseek: 'model-deepseek',
  openai: 'model-openai',
  qwen: 'model-qwen',
};

// ─── Provider selection ──────────────────────────────────────────────

/**
 * Remembers the chosen provider in localStorage so selectors stay in sync and the
 * choice survives reloads. Multiple instances on the same page with the same key
 * stay in sync via a same-tab custom event.
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

    function onChange(e: Event) {
      const detail = (e as CustomEvent<{ key: string; provider: Provider }>).detail;
      if (detail?.key === key) setProvider(detail.provider);
    }
    window.addEventListener(PROVIDER_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(PROVIDER_CHANGE_EVENT, onChange);
  }, [key]);

  const set = (p: Provider) => {
    setProvider(p);
    window.localStorage.setItem(key, p);
    window.dispatchEvent(new CustomEvent(PROVIDER_CHANGE_EVENT, { detail: { key, provider: p } }));
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

// ─── Model selection ─────────────────────────────────────────────────

/**
 * Returns the current model for *any* provider (the model for the given provider),
 * plus a setter. Each provider has its own localStorage slot.
 */
export function useModel(provider: Provider): [string, (m: string) => void] {
  const storageKey = MODEL_STORAGE_KEY_SUFFIX[provider];
  const fallback = DEFAULT_MODEL[provider];
  const [model, setModel] = useState<string>(fallback);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) setModel(saved);
  }, [storageKey]);

  const set = (m: string) => {
    setModel(m);
    window.localStorage.setItem(storageKey, m);
  };

  return [model, set];
}

/**
 * Returns the effective model ID: if the stored model is in this provider's list
 * use it; otherwise fall back to the provider default.
 */
export function resolveModelForProvider(provider: Provider, rawStored: string): string {
  const allowed = PROVIDER_MODELS[provider].map((m) => m.id);
  return allowed.includes(rawStored) ? rawStored : DEFAULT_MODEL[provider];
}

export function ModelSelect({
  provider,
  model,
  onChange,
  disabled,
  title = 'Which variant of this provider to use',
}: {
  provider: Provider;
  model: string;
  onChange: (m: string) => void;
  disabled?: boolean;
  title?: string;
}) {
  const models = PROVIDER_MODELS[provider];
  if (models.length <= 1) return null;

  return (
    <select
      value={model}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      title={title}
      className="rounded-md border border-neutral-700 bg-neutral-950/80 px-3 py-2 text-sm text-neutral-200 outline-none hover:border-neutral-600 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10 disabled:opacity-50"
    >
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
