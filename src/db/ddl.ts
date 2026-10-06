/**
 * SQLite schema for the local insights database. Applied with
 * `create table if not exists` on every connection open, so a fresh checkout
 * just works and adding a table means adding a statement here.
 *
 * This is the single source of truth for the schema (it replaced the
 * hand-applied Supabase dashboard DDL and `scripts/check-schema.ts`). Column
 * names and types mirror the old Postgres schema so data imported from the
 * Supabase dump loads unchanged:
 *   - uuid       → text (ids are opaque strings; default expression mints
 *                  dashed lowercase hex)
 *   - date       → text ('YYYY-MM-DD'; lexicographic order == chronological)
 *   - timestamptz→ text (ISO 8601 UTC, matching JS `toISOString()`)
 *   - jsonb      → text (JSON.stringify on write, JSON.parse on read —
 *                  handled by the column registries in `query.ts`)
 *   - boolean    → integer 0/1 (also handled by `query.ts`)
 *   - double precision → real
 */

/** Dashed lowercase uuid v4-shaped default (random bytes, no RFC version bits). */
const UUID_DEFAULT =
  `(lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-'||` +
  `lower(hex(randomblob(2)))||'-'||lower(hex(randomblob(2)))||'-'||` +
  `lower(hex(randomblob(6))))`;

/** ISO-8601 UTC timestamp with milliseconds, identical shape to `toISOString()`. */
const NOW_DEFAULT = `(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

export const DDL_STATEMENTS: string[] = [
  `create table if not exists weekly_insights (
     id text primary key default ${UUID_DEFAULT},
     week_start text not null unique,
     week_end text not null,
     metrics_snapshot text not null,
     headline text,
     summary text not null,
     findings text not null,
     action_items text not null,
     open_threads text not null,
     resolved_threads text not null,
     corrections text not null default '[]',
     revisions text not null default '[]',
     chat text not null default '[]',
     strategy text,
     strategy_goal text,
     strategy_decisions text not null default '[]',
     strategy_chat text not null default '[]',
     strategy_recommendation_chats text not null default '{}',
     model_used text not null,
     created_at text not null default ${NOW_DEFAULT}
   )`,
  `create index if not exists weekly_insights_week_start_desc
     on weekly_insights (week_start desc)`,

  `create table if not exists standing_caveats (
     id text primary key default ${UUID_DEFAULT},
     created_at text not null default ${NOW_DEFAULT},
     updated_at text,
     kind text not null default 'caveat',
     affected_metric text not null,
     note text not null,
     active integer not null default 1
   )`,

  `create table if not exists strategy_ledger (
     id integer primary key check (id = 1),
     state text not null,
     version integer not null default 1,
     updated_at text not null default ${NOW_DEFAULT},
     updated_by text
   )`,

  `create table if not exists evidence_deltas (
     id text primary key default ${UUID_DEFAULT},
     week_start text not null unique,
     week_end text not null,
     delta text not null,
     raw_snapshot text not null,
     created_at text not null default ${NOW_DEFAULT}
   )`,
  `create index if not exists evidence_deltas_week_start_desc
     on evidence_deltas (week_start desc)`,

  `create table if not exists ledger_entries (
     id text primary key default ${UUID_DEFAULT},
     week_start text not null,
     entry_type text not null,
     target text,
     operation text not null,
     patch text,
     evidence text,
     confidence text,
     model_used text not null,
     created_at text not null default ${NOW_DEFAULT}
   )`,
  `create index if not exists ledger_entries_week_start_desc
     on ledger_entries (week_start desc)`,
  `create index if not exists ledger_entries_entry_type
     on ledger_entries (entry_type)`,

  `create table if not exists context_sources (
     id text primary key default ${UUID_DEFAULT},
     week_start text not null,
     source_type text not null,
     repo text,
     digest text not null,
     created_at text not null default ${NOW_DEFAULT}
   )`,
  `create index if not exists context_sources_week_start_desc
     on context_sources (week_start desc)`,

  `create table if not exists source_sync_state (
     source text not null,
     scope text not null default 'llmnesia',
     latest_data_date text,
     last_success_at text,
     last_attempt_at text,
     status text not null default 'never',
     detail text,
     primary key (source, scope)
   )`,

  `create table if not exists source_snapshots (
     source text not null,
     scope text not null default 'llmnesia',
     period_start text not null,
     period_end text not null,
     snapshot text not null,
     collected_at text not null default ${NOW_DEFAULT},
     primary key (source, scope, period_start, period_end)
   )`,
  `create index if not exists source_snapshots_source_period
     on source_snapshots (source, scope, period_end desc)`,

  `create table if not exists sites (
     id text primary key default ${UUID_DEFAULT},
     name text not null,
     root_url text not null,
     gsc_property text not null,
     sitemap_url text,
     brief_override text,
     growth_goal text,
     repo text,
     bing_site_url text,
     enabled integer not null default 1,
     created_at text not null default ${NOW_DEFAULT},
     unique (gsc_property)
   )`,

  `create table if not exists gsc_rows (
     site_id text not null references sites(id) on delete cascade,
     query text not null,
     page text not null,
     date text not null,
     country text not null default 'zzz',
     device text not null default 'all',
     clicks integer not null default 0,
     impressions integer not null default 0,
     ctr real not null default 0,
     position real not null default 0,
     synced_at text not null default ${NOW_DEFAULT},
     primary key (site_id, query, page, date, country, device)
   )`,
  `create index if not exists gsc_rows_site_date on gsc_rows (site_id, date desc)`,
  `create index if not exists gsc_rows_site_query on gsc_rows (site_id, query)`,
  `create index if not exists gsc_rows_site_page on gsc_rows (site_id, page)`,

  `create table if not exists bing_rows (
     site_id text not null references sites(id) on delete cascade,
     query text not null,
     date text not null,
     country text not null default 'all',
     clicks integer not null default 0,
     impressions integer not null default 0,
     ctr real not null default 0,
     position real not null default 0,
     synced_at text not null default ${NOW_DEFAULT},
     primary key (site_id, query, date, country)
   )`,
  `create index if not exists bing_rows_site_date on bing_rows (site_id, date desc)`,
  `create index if not exists bing_rows_site_query on bing_rows (site_id, query)`,

  `create table if not exists growth_opportunities (
     id text primary key default ${UUID_DEFAULT},
     site_id text not null references sites(id) on delete cascade,
     week_start text not null,
     type text not null,
     target_query text,
     target_page text,
     evidence text not null,
     score real not null,
     source text not null default 'google',
     created_at text not null default ${NOW_DEFAULT}
   )`,
  `create index if not exists growth_opps_site_week
     on growth_opportunities (site_id, week_start desc)`,

  `create table if not exists growth_plans (
     site_id text not null references sites(id) on delete cascade,
     week_start text not null,
     plan text not null,
     model_used text not null,
     generated_at text not null default ${NOW_DEFAULT},
     primary key (site_id, week_start)
   )`,

  `create table if not exists growth_actions (
     id text primary key default ${UUID_DEFAULT},
     site_id text not null references sites(id) on delete cascade,
     week_start text not null,
     recommendation_id text,
     opportunity_id text,
     action_type text not null,
     target_query text,
     target_page text,
     suggested_title text,
     brief text,
     status text not null default 'planned',
     status_updated_at text not null default ${NOW_DEFAULT},
     published_url text,
     follow_up_date text,
     note text,
     created_at text not null default ${NOW_DEFAULT}
   )`,
  `create index if not exists growth_actions_site_status on growth_actions (site_id, status)`,
  `create index if not exists growth_actions_recommendation on growth_actions (recommendation_id)`,
];
