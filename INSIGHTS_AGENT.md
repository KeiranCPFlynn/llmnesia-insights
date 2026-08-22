# Insights agent runbook

Use this runbook when the founder says **Run the Insights review.** Insights is
the evidence store and dashboard; you are the strategy and execution agent.

1. Run `npm run insights:prepare` first. Read `.insights/evidence-pack.json`
   completely. It contains the reporting period, current/prior snapshots,
   computed deltas, freshness, current Strategy Ledger, prior review and
   decisions, caveats, definitions, goals, and constraints. Never put secrets
   or raw private conversation transcripts in review output.
2. Inspect relevant repositories with your own Git and file tools. Read the
   changed code that matters; do not infer shipped work from commit messages
   alone. Record repository, commit refs, inspected files, and concise findings.
3. Use LLMnesia MCP to retrieve relevant decisions, rejected ideas,
   constraints, and recent work. Record only conversation identifiers, titles,
   and why they mattered—never transcript text.
4. If prepared evidence raises a material question, use PostHog or another
   available source tool for a focused follow-up query and record the tool in
   `sources.follow_up_tools`.
5. Edit `.insights/review.json` to match the freshly generated
   `.insights/review.template.json` (the prepare command preserves an existing
   draft). Keep observed
   `facts`, your `inferences`, and proposed recommendations distinct. Every
   finding and patch must cite real evidence. Empty arrays are correct when the
   evidence warrants no finding, patch, recommendation, risk, or experiment;
   never invent work to fill the dashboard. Do not change the generated
   reporting dates, prepared timestamp, or snapshot hash.
6. Run `npm run insights:publish -- .insights/review.json`. Do not write review
   or strategy state directly to Supabase. Fix validation errors in the review
   file and run the same command again.
7. Report exactly what the publish command says it wrote: reporting period,
   data-as-of date, agent, counts of ledger patches, recommendations and
   provenance records, plus any section intentionally left empty.

Publishing rejects unknown operations, malformed recommendations, missing
source evidence, mismatched or stale periods, and patches that cannot be fully
applied. Re-running identical content is a no-op; a changed review for the same
period is safely replayed from that period’s saved pre-review ledger.
