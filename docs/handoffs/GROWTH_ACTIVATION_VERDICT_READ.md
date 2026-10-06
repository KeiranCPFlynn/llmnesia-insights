# Read-only analysis: activation verdict for the shipped invitation fix

## Goal and reasoning

The first-search invitation fix shipped in store release 0.4.10 on 2 October
(changelog: search invitations retry when a previously hidden tab becomes
visible; extension commit `cf6ca8a`). The completed week under review at the
time (28 September to 4 October) mixed three pre-fix and three post-fix
install days, so its 27.6 percent activation cannot show the effect. The
Strategy Ledger carries the hypothesis (id `43c1a174-b722-4c7a-bb6b-7597fc9c203a`):
the invitation raises new external installs' first-search conversion above
the validated 30.8 percent baseline. This analysis is the hypothesis test and
the founder's decision input for the next onboarding move.

## Timing

Run on or after 12 October 2026, when the completed week 5 to 11 October has
mature 24-hour windows for installs through 10 October (install date plus two
days, matching the method in the baseline note). Do not run early and do not
present immature windows.

## Method (follow the baseline note exactly)

- Definitions and structure: `docs/activation-funnel-validation-2026-09-28.md`
  in this repo. Unit: unique installs keyed on `anonymous_install_id`;
  24-hour observation window from install time; internal exclusion via
  `is_internal` on the install event or any event in the window.
- PostHog EU query API, read-only HogQL, using the repository's existing
  client. Do not use sampled events for any definition; per
  `docs/POSTHOG_USAGE_REDUCTION.md`, `search_submitted`, `result_opened`,
  and activation milestones remain unsampled, while `conversation_captured`
  update events and ingestion-lane events sample at 10 percent and must not
  be used as denominators. `search_performed` and `zero_results_returned`
  are retired and must not appear in the funnel.
- Funnel steps: install, first open, import completed, any searchable
  content, first intentional search, result opened.
- Cohorts: the baseline cohort (21 to 26 September, recorded values: 98.4
  percent first open, 68.1 percent content, 30.8 percent first search) and
  the new cohort (installs 5 to 10 October). Additionally split the new
  cohort by install day relative to the 2 October release where per-day
  counts allow a rate (suppress cells under roughly 30 installs rather than
  reporting noisy percentages).
- If 5 to 11 October closes with too few installs to decide, report that and
  extend to a second week rather than declaring a verdict.

## Output

Write findings to a dated note in this repo's `docs/` following the baseline
note's format (method, data quality, funnel table, ordered transitions,
elapsed-time if useful), then report:

1. Content-to-search conversion for the post-release cohort versus 30.8
   percent, with the direction and rough size of the change.
2. Whether the hypothesis is supported, refuted, or undecidable this week.
3. The largest remaining funnel step-loss and whether it changed position.
4. Any data-quality caveats (internal contamination, version mix, the 6
   October PostHog ingestion filter's effect on any-event denominators).

Do not update the Strategy Ledger, review files, or database directly; the
next weekly review consumes the note.

## Boundaries

Read-only against PostHog. No product code changes, no tracking changes, no
pushes or deploys. Local commits for the dated note and any local analysis
scripts are authorized; do not commit credentials or query keys.
