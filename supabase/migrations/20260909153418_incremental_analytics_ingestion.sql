-- Durable payload cache and cursors for the mandatory analytics ingestion
-- pipeline. These tables are server-only: the dashboard reads derived review
-- records, while service_role writes raw source responses.

create table if not exists public.source_sync_state (
  source text not null,
  scope text not null default 'llmnesia',
  latest_data_date date,
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  status text not null default 'never',
  detail text,
  primary key (source, scope)
);

create table if not exists public.source_snapshots (
  source text not null,
  scope text not null default 'llmnesia',
  period_start date not null,
  period_end date not null,
  snapshot jsonb not null,
  collected_at timestamptz not null default now(),
  primary key (source, scope, period_start, period_end)
);
create index if not exists source_snapshots_source_period
  on public.source_snapshots (source, scope, period_end desc);

alter table public.source_sync_state enable row level security;
alter table public.source_snapshots enable row level security;

revoke all on table public.source_sync_state, public.source_snapshots from anon, authenticated;
grant select, insert, update, delete on table public.source_sync_state, public.source_snapshots to service_role;
