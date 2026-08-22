# Agent-Driven Insights — V1 Plan

## Status

This plan supersedes `STRATEGY_LEDGER_PLAN.md` as the target architecture.
The existing Supabase ledger and dashboard work may be reused, but Insights
must not act as the strategy agent.

## Product contract

LLMnesia Insights is the evidence store, durable strategy memory, and dashboard.
Codex or Claude Code is the strategy and execution agent.

The founder starts a coding-agent session in this repository and asks it to run
the Insights review. The agent gathers the prepared analytics evidence, uses its
own tools to inspect Git and search LLMnesia MCP, reasons and delegates as
needed, then publishes a validated review to Supabase. Insights displays the
result.

```text
PostHog / GA4 / Bing
          ↓
Evidence pack + Supabase strategy state
          ↓
Codex or Claude Code
  tools · Git · LLMnesia MCP · subagents
          ↓
Validated review written to Supabase
          ↓
Insights dashboard
```

## V1 user flow

1. Open `llmnesia-insights` in Codex or Claude Code.
2. Say: **Run the Insights review.**
3. The agent follows the repository runbook and runs the evidence preparation
   command.
4. The agent inspects the evidence, current strategy, recent code changes, and
   relevant prior conversations. It may use subagents for bounded investigation.
5. The agent creates a structured review and runs the publish command.
6. Refresh Insights to see the findings, strategy changes, actions, provenance,
   and evidence dates.

No dashboard button launches a local coding agent in V1.

## Implementation

### 1. Separate evidence collection from reasoning

- Extract the current PostHog, GA4, Bing/GSC collection and delta calculation
  into an evidence-only service.
- It must make no strategy or analysis LLM calls.
- Save the raw snapshot and computed delta in Supabase using the existing
  evidence storage where practical.
- Preserve current-week-to-date handling and clearly record `data_as_of`.
- The scheduled route becomes evidence-only.

### 2. Add an agent evidence command

Add a repository command such as:

```bash
npm run insights:prepare
```

It writes an ignored local evidence pack containing:

- current and prior metric snapshots;
- computed deltas and source freshness;
- current Strategy Ledger state;
- previous agent review and recommendation decisions;
- standing caveats, metric definitions, goals, and constraints;
- explicit instructions that Git and conversation research must be performed
  with the coding agent's own tools.

The pack must contain no API keys or credentials and must not be committed.

### 3. Add a validated publish command

Add a repository command such as:

```bash
npm run insights:publish -- .insights/review.json
```

The command must:

- validate the agent review before any write;
- reject unknown operations, malformed recommendations, missing evidence, and
  stale reporting periods;
- apply valid Strategy Ledger patches without replacing state after a read
  failure;
- write the human-readable findings and recommendations used by the dashboard;
- append an audit record including agent, evidence period, Git sources, and
  LLMnesia conversation sources;
- be safe to re-run for the same reporting period.

Existing `strategy_ledger`, `ledger_entries`, `evidence_deltas`, and
`weekly_insights` tables should be reused unless a verified requirement cannot
fit them. Avoid a new schema for V1 if possible.

### 4. Give coding agents one shared runbook

Add a concise `INSIGHTS_AGENT.md` that both Codex and Claude Code can follow.
It must tell the agent to:

- run the prepare command first;
- inspect relevant repos rather than relying on commit-message summaries;
- use LLMnesia MCP to retrieve decisions, rejected ideas, constraints, and
  recent work;
- use PostHog or other tools for follow-up queries when the prepared evidence
  raises a question;
- distinguish facts, inferences, and recommendations;
- avoid inventing work merely to fill the dashboard;
- publish only through the validated command;
- report exactly what was written.

The runbook is the prompt. The founder should only need to say: **Run the
Insights review.**

### 5. Make Insights a read-oriented dashboard

- Remove model selectors and language implying that Insights itself generates
  strategy.
- Remove the embedded analysis/Strategy Ledger LLM call from the active review
  and scheduled paths.
- Show evidence freshness separately from agent-review freshness.
- Show which agent published the review and which tools/sources it used.
- Keep decisions, findings, recommendations, history, and execution status.
- Provide a simple empty/stale state: open the repository in Codex or Claude
  Code and say **Run the Insights review.**

Legacy LLM-backed routes may remain temporarily for rollback, but they must not
be reachable from the primary workflow or scheduled job.

## Non-goals for V1

- Launching Codex or Claude Code from a hosted dashboard button.
- Building a new agent framework or custom tool loop inside Insights.
- Reimplementing Git, browser, LLMnesia, or subagent tools.
- Automatically executing recommendations without founder approval.
- Uploading raw private conversation transcripts to Supabase.
- Rebuilding the Growth workspace unless required by the main review flow.

## Acceptance criteria

1. The active Insights evidence path makes zero strategy/analysis LLM API calls.
2. A fresh Codex and Claude Code session can complete a review by reading only
   `INSIGHTS_AGENT.md` and running the documented commands.
3. The agent can use Git, LLMnesia MCP, and follow-up tools before publishing.
4. Malformed or stale agent output cannot modify the Strategy Ledger.
5. A successful publish appears on the dashboard with agent and source
   provenance.
6. A failed publish leaves the previous strategy intact and reports an
   actionable error.
7. The dashboard has no competing refresh/review controls and never implies it
   is the strategy agent.
8. Existing historical insights and decisions remain readable.
9. Typecheck, tests, production build, evidence dry-run, and fixture publish
   validation pass.

## Implementation order

1. Reconcile the current uncommitted work; retain only architecture-neutral
   correctness fixes.
2. Extract and verify evidence-only collection.
3. Implement the prepare pack and fixture tests.
4. Implement validated, idempotent publishing and fixture tests.
5. Write `INSIGHTS_AGENT.md` and test it in one fresh coding-agent session.
6. Switch the dashboard and cron to the agent-driven flow.
7. Run an end-to-end review and confirm the dashboard output.

## Cutover rule

Do not remove historical data or legacy code until one complete agent-driven
review has been prepared, published, and rendered successfully. After that,
remove or archive the unused embedded-LLM workflow in a separate cleanup.
