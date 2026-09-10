export default function InsightsLoading() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="h-5 w-40 animate-pulse rounded bg-neutral-800" />
      <div className="mt-4 h-9 w-72 animate-pulse rounded bg-neutral-800" />
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {[0, 1].map((i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-neutral-900" />)}
      </div>
    </main>
  );
}
