import { redirect } from 'next/navigation';

/** Legacy deep links now land in the unified Strategy Ledger. */
export default async function StrategyPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; period?: string }>;
}) {
  const { week, period } = await searchParams;
  const params = new URLSearchParams();
  if (period) params.set('period', period);
  else if (week) params.set('week', week);
  redirect(`/${params.size ? `?${params.toString()}` : ''}`);
}
