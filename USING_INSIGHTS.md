# Using LLMnesia Insights

Insights separates evidence collection from strategic judgment. The dashboard
is the durable, read-only record; Codex or Claude Code prepares the evidence,
researches the relevant work and decisions, then publishes a validated review.

## The normal weekly workflow

1. Open this repository in Codex or Claude Code.
2. Say: **Run the Insights review.**
3. Let the agent prepare the evidence, inspect the relevant code and prior
   decisions, and publish the review.
4. Open the dashboard and use the published headline, recommendations, and
   Strategy Ledger to decide the next work.

The agent follows [`INSIGHTS_AGENT.md`](INSIGHTS_AGENT.md). It must distinguish
observed facts from its inferences and recommendations, cite evidence for
findings and ledger changes, and record Git, conversation, and follow-up-tool
provenance. It should leave sections empty when the evidence does not support a
claim.

## What to check on the dashboard

- **Evidence freshness** says when the underlying product and acquisition data
  was collected. Search data can lag by a day.
- **Agent-review freshness** says when the strategic review was prepared and
  which agent/model published it.
- **Recommendations** are proposed next actions, not automatic work.
- **Strategy Ledger** is the current durable strategy state and the history of
  evidence-backed updates.

If evidence is fresh but the review is old, request a new Insights review. If
both are old, run the review; preparation collects current evidence first.

## Manual fallback

The conversational workflow is preferred. To run its two phases manually:

```bash
npm run insights:prepare
```

This creates an ignored `.insights/` workspace:

- `evidence-pack.json` — the complete prepared context to review.
- `review.template.json` — the required output shape and current evidence hash.
- `review.json` — your draft; preparation preserves an existing draft.

Fill `review.json` from the fresh template, retaining its reporting period,
prepared timestamp, and snapshot hash. Then publish only through the validator:

```bash
npm run insights:publish -- .insights/review.json
```

Never edit the dashboard tables or Strategy Ledger directly for a review.
Publishing validates all patches and provenance before writing anything. An
identical re-run is a no-op; a changed review for the same week is replayed
safely from that week's saved pre-review ledger.

## When publishing is rejected

Start with a newly prepared template. Common causes are a stale or altered
evidence hash, an invalid ledger patch, or a finding/recommendation without
supporting evidence or source provenance. Correct `review.json` and re-run the
same publish command. Do not bypass the error with direct Supabase writes.

## Safety and automation

The generated `.insights/` files are ignored by Git. Do not add credentials,
raw conversation transcripts, or secrets to them. Vercel Cron collects
evidence only; it does not ask a model to analyze or change strategy. The old
`npm run pipeline` remains only as a temporary rollback path and is not the
normal workflow.

