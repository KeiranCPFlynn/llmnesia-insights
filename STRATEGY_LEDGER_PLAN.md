# Strategy Ledger Refactoring Plan

## Context

LLMnesia Insights currently acts as a **stateless insight generator** — it pulls weekly analytics from PostHog/GA4/Bing, sends raw metrics to an LLM, and produces a one-off analysis. The strategy is regenerated from scratch each week with only lossy summary text from prior weeks as continuity. There is no persistent "current strategy state" that evolves over time, no delta tracking between weeks, and no awareness of what has already been built (git) or decided (conversations).

The goal is to transform this into a **Stateful Strategy Ledger**: a single living strategy document that the system reads, proposes structured patches to, and persists — so the picture compounds over time instead of resetting.

User decisions shaping this plan:
- **Ledger shape**: Single document + patches (one JSON doc, LLM proposes JSON patches)
- **Phasing**: Git + MCP context included from day one
- **UI**: Unified ledger view (collapse Insights/Strategy/Growth into one primary page)

---

## Part 1: Investigation Findings

### 1. Architecture & Connectors

| Connector | File | Method | Output | Delta? |
|-----------|------|--------|--------|--------|
| **PostHog** | `src/posthog.ts` | HogQL queries (9 parallel queries per week) | Aggregated metrics: installs, activation, retention W1/W4, WAU, search quality, platform distribution, email capture, version adoption, backfill correlation | **No** — pulls fixed week window. No comparison to prior week at data level. |
| **GA4** | `src/ga4.ts` | Google Analytics Data API (2 properties: website via service account, extension via OAuth) | Users, sessions, acquisition, top pages, geo, devices, conversions, store installs | **No** — same fixed-window aggregated pulls |
| **Bing** | `src/bing.ts` | REST API `GetKeywordStats` | Per-query×date×country rows, upserted into `bing_rows` | **No** — but stored as rows so delta could be computed |
| **GSC** | `src/gsc.ts` | Search Console API | Per-query×page×date×country×device rows into `gsc_rows` | **No** — same pattern as Bing |
| **Search Digest** | `src/search-digest.ts` | Reads stored rows from gsc_rows + bing_rows | `SearchPerformanceDigest` with prior-week comparison | **Yes (partial)** — only source that computes week-over-week at the data level |

**Pipeline orchestrator** (`src/pipeline.ts`):
- `runPipeline()` runs PostHog + GA4 + search sync in parallel → merges into one `MetricsSnapshot` → passes to `analyseMetrics()` → upserts into `weekly_insights`
- Supports `mode: 'complete'` (last finished Mon-Sun week) and `mode: 'current'` (this week to date)
- Fetches 6 weeks of `HistoricalInsight` (summary + findings + action_items + open_threads text only — lossy)

### 2. Supabase State

**Tables that exist:**

| Table | Purpose | Strategy state? |
|-------|---------|----------------|
| `weekly_insights` | Everything: metrics_snapshot (jsonb), analysis (headline/summary/findings/action_items/open_threads/resolved_threads), strategy (jsonb), corrections, revisions, chat, strategy_decisions, strategy_chat, strategy_goal | **No** — strategy is a weekly snapshot, not a living state |
| `standing_caveats` | Persistent cross-week known facts | Closest thing to persistent state, but only caveats |
| `sites` | Multi-site config for growth planner | No |
| `gsc_rows` / `bing_rows` | Raw search data (row-level) | No |
| `growth_opportunities` | Detected growth candidates | No |
| `growth_plans` | Generated growth plans (per site, per week) | No |
| `growth_actions` | Materialized recommendations with status workflow | Best workflow tracking, but per-week scoped |

**Key gaps:**
- No `strategy_ledger` table (single living strategy document)
- No `evidence_deltas` table (pre-computed metric changes)
- No `ledger_entries` table (append-only audit log of strategy changes)
- `open_threads`/`resolved_threads` in `weekly_insights` are a proto-hypothesis tracker but completely lossy — LLM re-derives each week from summary text
- `strategy_decisions` are per-week, not cross-week queryable
- Everything crammed into one `weekly_insights` row with ~15 jsonb columns

### 3. LLM Orchestration

Three separate "brains", each stateless:

1. **Analysis** (`src/analyse.ts` + `src/prompts/analysis-prompt.ts`)
   - Persona: "product analyst"
   - Input: Full MetricsSnapshot JSON + 6 weeks of prior summary text + corrections/caveats
   - Output: Forced tool `submit_analysis` → structured JSON (headline, summary, findings[], action_items[], open_threads[], resolved_threads[])
   - Reads prior state? Only lossy summary text, not full metrics or strategy

2. **Strategy** (`src/strategy.ts` + `src/prompts/strategy-prompt.ts`)
   - Persona: "acting Head of Product & Growth"
   - Input: PROJECT_BRIEF.md + analysis text + metricsDigest (~15 numbers) + corrections + strategy goal + prior theses text + decision log + strategy chat
   - Output: Forced tool `submit_strategy` → (thesis, monetization, recommendations[], risks, experiments)
   - Reads prior state? Prior thesis text only — NOT the full strategy document

3. **Growth Plan** (`src/growth-plan.ts` + `src/prompts/growth-prompt.ts`)
   - Persona: "Head of SEO/Content Growth"
   - Input: Brief + growth goal + opportunity candidates + site scale + GA4/Bing digests + prior plan theses + prior actions
   - Output: Forced tool `submit_growth_plan` → (thesis, balance, recommendations[], risks, experiments)

**Common pattern:** All three generate one-off outputs from scratch. None read a persistent strategy state.

### 4. Context Gaps

- **No Git integration** — LLM has no idea what code has been written, what features shipped, what PRs merged
- **No MCP/chat-history integration** — LLMnesia MCP (local, indexes all AI chats) exists but is not connected
- **No concept of "what's been built"** — the `coding_agent_prompt` handoff is one-directional
- **PROJECT_BRIEF.md** is founder-maintained and static, not auto-updated
- **Standing caveats** are the only persistent cross-week state mechanism

---

## Part 2: The Refactoring Plan

### A. The Delta (What's Missing)

1. **No living strategy document** — need a single `strategy_ledger` row that holds the current worldview and gets patched, not replaced
2. **No evidence deltas** — metrics are pulled as raw weekly snapshots; need pre-computed diffs
3. **No audit trail of strategy evolution** — `ledger_entries` to record every patch and why
4. **No external context** — git history and MCP chat digests as evidence sources
5. **Unified UI** — the 3-tab sprawl should collapse into one primary ledger view

### B. Supabase Schema Proposals

#### New table: `strategy_ledger` (single living document)

```sql
create table if not exists public.strategy_ledger (
  id integer primary key default 1 check (id = 1),  -- singleton: always one row
  state jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text  -- model that last patched it
);
alter table public.strategy_ledger enable row level security;
```

The `state` JSONB document shape:

```typescript
interface StrategyLedgerState {
  north_star: string;           // e.g. "Grow to 500 WAU with >40% W1 retention before monetizing"
  stage: string;                // e.g. "pre-monetization, growth-first"
  stage_triggers: string[];     // conditions that unlock the next stage

  active_hypotheses: Array<{
    id: string;
    claim: string;              // e.g. "Improving store listing copy will lift install rate by 20%"
    bet_type: 'growth' | 'activation' | 'retention' | 'monetization' | 'product';
    confidence: 'low' | 'medium' | 'high';
    evidence_for: string[];
    evidence_against: string[];
    falsification: string;      // what would disprove it
    first_proposed: string;
    last_reviewed: string;
  }>;

  constraints: Array<{
    id: string;
    constraint: string;
    source: 'founder' | 'data' | 'technical';
  }>;

  open_questions: Array<{
    id: string;
    question: string;
    first_asked: string;
    context: string;
  }>;

  monetization_design: {
    model: string;
    what_to_gate: string;
    pricing_hypothesis: string;
    trigger_conditions: string[];
  };

  active_initiatives: Array<{
    id: string;
    title: string;
    area: string;
    status: 'accepted' | 'in_progress' | 'shipped' | 'measuring';
    expected_outcome: string;
    metrics_to_watch: string[];
    started: string;
  }>;

  metrics_baseline: Record<string, number | string>;
  version: number;
}
```

#### New table: `evidence_deltas` (pre-computed metric changes)

```sql
create table if not exists public.evidence_deltas (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  week_end date not null,
  delta jsonb not null,
  raw_snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index on public.evidence_deltas (week_start desc);
alter table public.evidence_deltas enable row level security;
```

#### New table: `ledger_entries` (append-only audit log)

```sql
create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  entry_type text not null,      -- 'patch' | 'evidence' | 'decision' | 'question' | 'context'
  target text,                   -- which part of the ledger was affected
  operation text not null,       -- 'add' | 'update' | 'retire' | 'escalate' | 'open'
  patch jsonb,
  evidence text,
  confidence text,
  model_used text not null,
  created_at timestamptz not null default now()
);
create index on public.ledger_entries (week_start desc);
create index on public.ledger_entries (entry_type);
alter table public.ledger_entries enable row level security;
```

#### New table: `context_sources` (git + MCP digests)

```sql
create table if not exists public.context_sources (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  source_type text not null,     -- 'git' | 'mcp' | 'manual'
  repo text,
  digest jsonb not null,
  created_at timestamptz not null default now()
);
create index on public.context_sources (week_start desc);
alter table public.context_sources enable row level security;
```

### C. The Pipeline Refactor

**Current flow:**
```
PostHog + GA4 + Search → MetricsSnapshot → analyseMetrics() → AnalysisResult → Supabase
```

**New flow:**
```
1. COLLECT evidence:
   ├── PostHog + GA4 + Search → MetricsSnapshot (unchanged)
   ├── computeEvidenceDelta(current, prior) → EvidenceDelta (NEW)
   ├── collectGitContext(repos, since) → GitDigest (NEW)
   └── collectMcpContext(since) → McpDigest (NEW)

2. READ current state:
   └── getStrategyLedger() → StrategyLedgerState (NEW)

3. ANALYSE (existing analyst, enriched):
   └── analyseMetrics(metrics, delta, history, caveats) → AnalysisResult

4. UPDATE LEDGER (NEW step):
   └── updateLedger(state, delta, analysis, gitContext, mcpContext) → {patches, narrative}
       ├── Apply patches to strategy_ledger.state
       ├── Append to ledger_entries
       └── Save evidence_deltas
```

**Key files to modify:**

| File | Change |
|------|--------|
| `src/pipeline.ts` | Add delta computation, ledger read/write, git/MCP context collection |
| `src/evidence-delta.ts` | **NEW** — structured diff between current and prior MetricsSnapshot |
| `src/git-context.ts` | **NEW** — shell to `git log` for configured repos, summarize commits |
| `src/mcp-context.ts` | **NEW** — query LLMnesia MCP for recent strategy conversations |
| `src/ledger.ts` | **NEW** — read/write strategy_ledger, apply patches, append ledger_entries |
| `src/supabase.ts` | Add CRUD for new tables |
| `src/types.ts` | Add new type definitions |

### D. The New LLM Prompt Strategy

**The shift:** LLM stops being a "chatbot generating strategy from scratch" and becomes a **"Ledger Editor" proposing targeted patches**.

The strategy brain keeps producing weekly recommendations BUT ALSO returns a `patches[]` array. Each patch is a structured operation:

- `add_hypothesis` / `update_hypothesis` / `retire_hypothesis`
- `add_constraint`
- `update_goal` / `update_north_star`
- `open_question` / `resolve_question`
- `add_initiative` / `update_initiative`
- `update_monetization`
- `update_baseline`

The tool schema extends the existing `submit_strategy` to `submit_strategy_with_patches`:

```json
{
  "patches": [
    {
      "operation": "update_hypothesis",
      "target_id": "hypothesis-uuid",
      "changes": { "confidence": "high", "evidence_for": ["+W1 retention rose 8pts"] },
      "rationale": "The store listing rewrite shipped last week and W1 retention jumped..."
    }
  ],
  "narrative": "2-3 sentences on what the evidence says and where strategy is heading",
  "weekly_recommendations": [ /* same as current StrategyRecommendation */ ],
  "risks": []
}
```

**Rules enforced in the prompt:**
- Read the current ledger FIRST — build on what's there, don't regenerate
- Reference specific numbers from the evidence delta, not vague statements
- If nothing material changed, say so — don't patch for the sake of patching
- Respect all constraints — never propose something that violates a founder constraint
- Weekly recommendations are ephemeral; the ledger is persistent

### E. Context Sources: Git + MCP

**Git context** (`src/git-context.ts`):
- Configured via env: `GIT_REPOS=/Users/Kdog/Code-Projects/LLMnesia,/Users/Kdog/Code-Projects/llmnesia-site njs`
- For each repo: `git log --since=<last_run> --oneline --no-merges`
- Parse into: commit count, feature/fix/refactor split, notable changes
- Fail-soft: if git fails, return empty digest
- On Vercel: skip git context (local CLI only for phase 1)

**MCP context** (`src/mcp-context.ts`):
- Query local LLMnesia MCP for recent conversations with strategy keywords
- Digest into: key decisions, constraints stated, ideas discussed
- Fail-soft: if MCP unavailable, return empty digest
- On Vercel: skip gracefully

### F. UI Simplification

**Current (4 pages):** `/` Insights, `/strategy` Strategy, `/growth` Growth, `/data` Data

**Proposed (2 pages):**

**Primary: `/` — The Strategy Ledger**
- Hero: Current north star + stage + triggers (editable)
- Active Hypotheses: Cards with confidence badges, evidence, last reviewed
- Evidence Feed: This week's delta + notable git activity + key conversations
- Ledger History: Timeline of patches (collapsible)
- This Week's Recommendations: Tactical suggestions from latest run
- Decisions Board: Active decisions across all weeks

**Support: `/workspace` — Growth + Data**
- Growth planner (keep as-is, per-site)
- Data explorer (keep as-is)
- Known facts management (keep as-is)

### G. Migration Strategy

- **Do NOT modify `weekly_insights`** — stays as historical record
- **Dual-write**: Pipeline writes to BOTH `weekly_insights.strategy` (old) AND `strategy_ledger` + `ledger_entries` (new) during transition
- **Seed**: Script to initialize `strategy_ledger` from the most recent strategy output + PROJECT_BRIEF.md
- `evidence_deltas` starts empty and fills as pipeline runs
- Old UI continues working; new UI reads from ledger tables
- Each phase deployable and rollbackable independently

### H. Implementation Order

1. Schema — Create 4 new tables (manual DDL in Supabase)
2. Types — Add TypeScript interfaces to `src/types.ts`
3. Supabase CRUD — Add read/write for new tables to `src/supabase.ts`
4. Evidence delta — New `src/evidence-delta.ts`
5. Git context — New `src/git-context.ts`
6. MCP context — New `src/mcp-context.ts`
7. Ledger logic — New `src/ledger.ts` (read/patch/write)
8. Ledger prompt — New `src/prompts/ledger-prompt.ts`
9. Pipeline refactor — Wire new steps into `src/pipeline.ts`
10. Seed script — Initialize ledger from existing data
11. Unified UI — New `/` page, move existing pages to `/workspace`
12. API routes — New `/api/ledger/*` routes

### I. Verification

1. `npx tsc --noEmit` — type check passes
2. `npm run pipeline -- --dry-run` — verify delta + ledger without writing
3. Run DDL in Supabase — verify tables exist
4. Seed test — verify `strategy_ledger` has correct shape
5. End-to-end: "Update all" → verify evidence_deltas, ledger_entries, strategy_ledger all update
6. Git context: run with `GIT_REPOS` set → verify commit digests in evidence feed
7. Fail-soft: run without git/MCP → verify pipeline still completes

---

## Critical Files

| Category | Files |
|----------|-------|
| Pipeline core | `src/pipeline.ts`, `src/analyse.ts`, `src/strategy.ts` |
| Data connectors | `src/posthog.ts`, `src/ga4.ts`, `src/search-digest.ts` |
| Storage | `src/supabase.ts`, `src/types.ts` |
| Prompts | `src/prompts/analysis-prompt.ts`, `src/prompts/strategy-prompt.ts` |
| New files | `src/evidence-delta.ts`, `src/git-context.ts`, `src/mcp-context.ts`, `src/ledger.ts`, `src/prompts/ledger-prompt.ts` |
| UI | `app/page.tsx`, `components/StrategyPanel.tsx`, `components/AppShell.tsx` |
| API routes | `app/api/strategy/route.ts`, new `app/api/ledger/route.ts` |
| Project brief | `PROJECT_BRIEF.md` (becomes part of ledger seed) |
