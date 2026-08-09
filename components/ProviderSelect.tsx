'use client';

import { useEffect, useState } from 'react';

export type Provider = 'claude' | 'deepseek' | 'openai' | 'qwen';

export const PROVIDER_LABEL: Record<Provider, string> = {
  claude: 'Claude',
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  qwen: 'Qwen Token Plan',
};

const ALL: Provider[] = ['claude', 'deepseek', 'openai', 'qwen'];

/** Fired on every `set()` so same-tab instances sharing a key stay in sync. */
const PROVIDER_CHANGE_EVENT = 'llm-provider-change';

// ─── Model definitions per provider ──────────────────────────────────

interface ModelDef {
  id: string;
  label: string;
}

const PROVIDER_MODELS: Record<Provider, ModelDef[]> = {
  claude: [
    { id: 'claude-fable-5', label: 'Fable 5 — highest capability' },
    { id: 'claude-opus-5', label: 'Opus 5 — complex work' },
    { id: 'claude-sonnet-5', label: 'Sonnet 5 — recommended' },
    { id: 'claude-haiku-4-5', label: 'Haiku 4.5 — fastest' },
  ],
  deepseek: [
    { id: 'deepseek-v4-pro', label: 'V4 Pro — recommended' },
    { id: 'deepseek-v4-flash', label: 'V4 Flash — lower cost' },
  ],
  openai: [
    { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol — highest capability' },
    { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra — recommended' },
    { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna — lowest cost' },
  ],
  qwen: [
    { id: 'qwen3.8-max', label: 'Qwen3.8 Max — highest capability' },
    { id: 'qwen3.7-plus', label: 'Qwen3.7 Plus — recommended' },
    { id: 'qwen3.7-flash', label: 'Qwen3.7 Flash — fastest' },
    { id: 'glm-5.2', label: 'GLM 5.2' },
  ],
};

const DEFAULT_MODEL: Record<Provider, string> = {
  claude: 'claude-sonnet-5',
  deepseek: 'deepseek-v4-pro',
  openai: 'gpt-5.6-terra',
  qwen: 'qwen3.7-plus',
};

const MODEL_STORAGE_KEY_SUFFIX: Record<Provider, string> = {
  claude: 'model-claude',
  deepseek: 'model-deepseek',
  openai: 'model-openai',
  qwen: 'model-qwen',
};

// ─── Hooks ───────────────────────────────────────────────────────────

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

export function useModel(provider: Provider): [string, (m: string) => void] {
  const storageKey = MODEL_STORAGE_KEY_SUFFIX[provider];
  const fallback = DEFAULT_MODEL[provider];
  const [model, setModel] = useState<string>(fallback);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    const supported = PROVIDER_MODELS[provider].some((candidate) => candidate.id === saved);
    setModel(supported ? saved! : fallback);
  }, [storageKey]);

  const set = (m: string) => {
    setModel(m);
    window.localStorage.setItem(storageKey, m);
  };

  return [model, set];
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Look up the display label for a model ID within a provider. */
export function modelLabel(provider: Provider, modelId: string): string {
  const found = PROVIDER_MODELS[provider].find((m) => m.id === modelId);
  return found?.label ?? modelId;
}

/** The full "Provider · Model" display string. */
export function fullModelLabel(provider: Provider, modelId: string): string {
  return `${PROVIDER_LABEL[provider]} · ${modelLabel(provider, modelId)}`;
}

// ─── Unified ModelPicker ─────────────────────────────────────────────

const SELECT_CLASS =
  'rounded-md border border-neutral-700 bg-neutral-950/80 px-2.5 py-1.5 text-sm text-neutral-200 ' +
  'outline-none hover:border-neutral-600 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10 ' +
  'disabled:opacity-50 w-full min-w-0';

/**
 * Single dropdown that shows every model grouped by provider.
 * Replaces the old ProviderSelect + ModelSelect pair.
 *
 * The value encodes both provider and model: "qwen:qwen3.7-plus".
 * When the user picks a different provider group, the model automatically
 * switches to that provider's default (or the last-used model for it).
 */
export function ModelPicker({
  provider,
  model,
  onProviderChange,
  onModelChange,
  options = ALL,
  disabled,
  title,
}: {
  provider: Provider;
  model: string;
  onProviderChange: (p: Provider) => void;
  onModelChange: (m: string) => void;
  options?: Provider[];
  disabled?: boolean;
  title?: string;
}) {
  function handleChange(value: string) {
    const [p, ...rest] = value.split(':');
    const m = rest.join(':');
    const newProvider = p as Provider;
    if (newProvider !== provider) {
      onProviderChange(newProvider);
      // When switching providers, use the stored model for that provider
      // (useModel will pick it up from localStorage on next render).
      const stored = window.localStorage.getItem(MODEL_STORAGE_KEY_SUFFIX[newProvider]);
      const allowed = PROVIDER_MODELS[newProvider].map((x) => x.id);
      onModelChange(stored && allowed.includes(stored) ? stored : DEFAULT_MODEL[newProvider]);
    } else {
      onModelChange(m);
    }
  }

  const currentValue = `${provider}:${model}`;

  return (
    <select
      value={currentValue}
      onChange={(e) => handleChange(e.target.value)}
      disabled={disabled}
      title={title}
      className={SELECT_CLASS}
    >
      {options.map((p) => (
        <optgroup key={p} label={PROVIDER_LABEL[p]}>
          {PROVIDER_MODELS[p].map((m) => (
            <option key={`${p}:${m.id}`} value={`${p}:${m.id}`}>
              {m.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// ─── Legacy exports (kept for backwards compat during migration) ─────

/** @deprecated Use ModelPicker instead. */
export function ProviderSelect({
  provider,
  onChange,
  disabled,
  options = ALL,
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
      className={SELECT_CLASS}
    >
      {options.map((p) => (
        <option key={p} value={p}>
          {PROVIDER_LABEL[p]}
        </option>
      ))}
    </select>
  );
}

/** @deprecated Use ModelPicker instead. */
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
      className={SELECT_CLASS}
    >
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
