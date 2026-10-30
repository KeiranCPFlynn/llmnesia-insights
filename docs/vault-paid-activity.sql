-- Read-only weekly check of whether paying Vault subscribers actually use it.
-- Run against the LLMnesia Vault Supabase project. Returns counts only.
with paid as (
  select distinct on (user_id) user_id
  from public.vault_billing_subscriptions
  where livemode and stripe_status in ('active', 'past_due', 'trialing')
  order by user_id, created_at desc
), usage as (
  select
    p.user_id,
    exists (select 1 from public.vault_records r where r.user_id = p.user_id and not r.deleted) as stored,
    exists (select 1 from public.vault_legacy_rpc_daily d where d.user_id = p.user_id and d.day >= current_date - 14)
      or exists (select 1 from public.vault_client_compatibility c where c.user_id = p.user_id and c.last_seen >= now() - interval '14 days') as active
  from paid p
)
select
  count(*) as paying,
  count(*) filter (where active) as active_14d,
  count(*) filter (where stored and not active) as stored_then_stopped,
  count(*) filter (where not stored and not active) as never_started
from usage;
