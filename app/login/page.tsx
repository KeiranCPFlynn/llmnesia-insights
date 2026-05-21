'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.push(params.get('next') || '/');
      router.refresh();
    } else {
      setError('Wrong password');
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-sm space-y-4 rounded-lg border border-neutral-800/80 bg-neutral-900/70 p-6 shadow-[0_18px_50px_rgba(0,0,0,0.24)]"
    >
      <div>
        <div className="mb-2 h-1 w-10 rounded-full bg-emerald-500" />
        <h1 className="text-xl font-semibold text-neutral-50">LLMnesia Insights</h1>
        <p className="mt-1 text-sm text-neutral-500">Weekly product signal and strategy.</p>
      </div>
      <input
        type="password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="w-full rounded-md border border-neutral-700 bg-neutral-950/80 px-3 py-2 text-sm outline-none placeholder:text-neutral-600 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10"
      />
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-[0_8px_22px_rgba(5,150,105,0.2)] hover:bg-emerald-500 disabled:opacity-50 disabled:shadow-none"
      >
        {busy ? 'Checking…' : 'Enter'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
