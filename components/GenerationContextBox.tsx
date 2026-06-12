'use client';

export function GenerationContextBox({
  value,
  onChange,
  disabled,
  placeholder,
  label = 'Context for next generation',
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder: string;
  label?: string;
}) {
  return (
    <label className="block rounded-lg border border-neutral-800/80 bg-neutral-950/35 p-3 text-left">
      <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </span>
      <textarea
        value={value}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="mt-2 max-h-36 min-h-16 w-full resize-y rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm leading-relaxed text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10 disabled:opacity-50"
      />
    </label>
  );
}
