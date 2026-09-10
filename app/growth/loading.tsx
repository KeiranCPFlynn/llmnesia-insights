export default function GrowthLoading() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="h-5 w-36 animate-pulse rounded bg-neutral-800" />
      <div className="mt-4 h-9 w-64 animate-pulse rounded bg-neutral-800" />
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-36 animate-pulse rounded-xl bg-neutral-900" />)}
      </div>
    </main>
  );
}
