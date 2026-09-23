# Insights agent runbook

Use this runbook when the founder says **Run the Insights review.** Insights is
the evidence store and dashboard; you are the strategy and execution agent.

1. Run `npm run insights:prepare` first. The default refreshes all sources
   through the run date and stores the evidence in Supabase. This is a partial
   week, including on Sunday while that day is still in progress. Report the
   actual collection time and source availability; requesting today's date
   does not mean a provider has finished processing today's data. Search data
   can lag. Use `--completed-week` only when the founder requests a completed
   week, or `--week-start YYYY-MM-DD` for a historical week. Those explicit
   historical requests can reuse stored evidence; `--refresh-evidence` forces
   a refresh. Read `.insights/evidence-pack.json` completely. It contains the
   reporting period, current/prior snapshots, deltas, freshness, Strategy
   Ledger, prior review and decisions, caveats, definitions, and constraints.
   Never put secrets or raw private conversation transcripts in review output.
2. Inspect relevant repositories with your own Git and file tools. Read the
   changed code that matters; do not infer shipped work from commit messages
   alone. Record repository, commit refs, inspected files, and concise findings.
3. Use LLMnesia MCP to retrieve only the decisions, rejected ideas,
   constraints, and recent work relevant to the changed evidence. Record only
   conversation identifiers, titles, and why they mattered—never transcript text.
4. Inspect only the code changed since the previous review unless the evidence
   requires a broader investigation. If the stored evidence raises a material
   question, use a focused source follow-up query and record the tool in
   `sources.follow_up_tools`; this is drill-down, not a replacement for the
   mandatory stored analytics ingestion.
   Keep a normal review bounded: inspect no more than 10 changed files across
   the relevant repositories, retrieve one focused set of conversations, and
   make at most three ranked recommendations. A founder can explicitly request
   a deep review when wider research is warranted.
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

8. Lead the founder-facing answer with plain English under four short questions:
   **What changed? Why? Do we have a problem? What should we do next?**
   Lead with evidence refreshed through the run date and explicitly label the
   current day and week as partial. Do not compare partial-week totals with
   complete-week totals as if the windows matched. Use completed weeks as
   historical context, show only decision-relevant numbers, and state source
   delays and uncertainty directly.
9. Resolve founder follow-ups from the existing evidence pack, inspected Git,
   and LLMnesia history before running new analytics queries. Treat founder
   corrections as authoritative context, update and republish the same weekly
   review when needed. Dashboard report chat can save factual context for this
   validated republish flow; recommendation chat can be used to challenge a
   published recommendation without bypassing the Strategy Ledger.

Publishing rejects unknown operations, malformed recommendations, missing
source evidence, mismatched or stale periods, and patches that cannot be fully
applied. Re-running identical content is a no-op; a changed review for the same
period is safely replayed from that period’s saved pre-review ledger.
