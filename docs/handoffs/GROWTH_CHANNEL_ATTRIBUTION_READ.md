# Read-only analysis: which channels produce activated users

## Goal and reasoning

Acquisition effort currently has no attribution: the Strategy Ledger
initiative "Measure MCP as a qualified-acquisition channel" (in progress
since 22 August) has no measured cohort, the 88 outreach follow-ups carry
tagged links whose yield has never been tallied, and GA4 channel data is
never joined to activation. The founder is directing effort at growth, so
the question is: which channel delivers installs that activate and retain,
and where should effort stop. One focused read answers it.

## Sources (all existing, no new collection)

- `/Users/Kdog/Code-Projects/llmnesia-insights`:
  `outreach/research-2026-09-23-next-100/` send logs (four batches, 88 sent,
  tagged links per draft) and `gmail-follow-up-drafts-2026-09-28.json` for
  the exact tagged-link set; `outreach/research-2026-09-22/` for the earlier
  cohort's links.
- PostHog EU (read-only): `extension_installed` and its source properties if
  present (inspect the actual event payload schema first; do not assume a
  property exists), plus first-search within 24 hours per install and
  week-one capture days where the window has matured.
- GA4 (read-only): sessions and install_click by default channel group and,
  where present, by tagged-link parameters, for the completed weeks 28
  September to 4 October and 21 to 27 September.

## Questions to answer

1. Channel table: for each acquisition source visible in the data (Organic
   Search, Direct, Cross-network, AI Assistant, Referral, Email/tagged
   outreach, extension store detail page), report sessions or installs,
   installs where attributable, activation within 24 hours, and any mature
   week-one capture-day rate.
2. MCP: is there any measurable MCP-acquired cohort today? If the install
   event carries no MCP source marker, say so plainly; that is itself the
   finding, and the initiative's measurement plan needs a marker decision
   rather than more querying.
3. Outreach tagged links: which of the 88 tagged links produced visits
   (GA4), and did any visited cohort reach install or activation? Note the
   response reality from the 6 October inbox review: two human responders
   in 96 contacted prospects, so expect small numbers and say so.
4. Ranked recommendation: which one channel deserves the next unit of
   effort, which should stop, and what single instrumentation gap (if any)
   blocks the ranking.

## Output

A dated note in this repo's `docs/` with the channel table, the MCP finding,
the tagged-link yield, and the ranked recommendation. Keep GA4 and PostHog
figures clearly separated; never present them as one funnel.

## Boundaries

Read-only against PostHog and GA4. No emails, no tracking changes, no
product changes. Local commits for the note are authorized. Do not commit
credentials or raw recipient lists; aggregate counts only.
