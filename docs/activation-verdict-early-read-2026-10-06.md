# Activation verdict early read, 6 October 2026

Read-only PostHog early read toward the handoff
`docs/handoffs/GROWTH_ACTIVATION_VERDICT_READ.md`. The handoff's definitive
verdict (installs 5 to 10 October) is due on or after 12 October and is not
attempted here. This note uses only cohorts whose 24-hour observation windows
had fully elapsed at run time: external installs of 2 to 4 October 2026, the
first post-release days after the first-search invitation shipped in store
release 0.4.10 (commit `cf6ca8a`, changelog "search invitations retry when a
previously hidden tab becomes visible"). Aggregate results only.

## Method

- Source: PostHog EU query API, read-only HogQL. Main run at
  2026-10-06T09:51Z; follow-up diagnostics minutes later. All timestamps UTC.
- Unit: unique installs keyed on `anonymous_install_id` (install time = first
  `extension_installed` event), 24-hour observation window from install time.
- Maturity: installs through 2026-10-04 23:59:59 UTC have fully elapsed
  windows at run time, with milestone events collected through 2026-10-06
  (install date + 2 days), matching `docs/activation-funnel-validation-2026-09-28.md`.
  Installs of 5 and 6 October are counted for volume context only and receive
  no rates.
- Internal exclusion: an install is excluded if its install event carries
  `is_internal=true`, or if any of its events in the window does.
- Minimum-cell rule (handoff): rates are suppressed for cells under roughly
  30 installs. Per-day and per-version cells below that line are shown as
  counts only; the pooled 2 to 4 October cohort (76 installs) and the fix
  version group (53 installs) clear the line.
- Cohorts: the baseline cohort 21 to 26 September (Monday to Saturday, values
  recorded in the 28 September validation note, re-run here as a continuity
  check), the post-release cohort 2 to 4 October (Friday to Sunday), and the
  3 to 4 October subset (the first days the store served only fix versions to
  essentially all installs).
- Reproduce: adapt `.insights/growth-activation-verdict-2026-10-06.mjs` and
  `.insights/growth-activation-popup-crosstab-2026-10-06.mjs` (local, not
  committed), which produced every number in this note.

## Data quality

- Continuity: re-running the baseline cohort reproduced every recorded value
  exactly (185 installs, 182 first open, 90 import completed, 126 with
  searchable content, 57 first searches, 61 result opens), so the pipeline is
  consistent with the 28 September note.
- Missing install IDs: 0 of 78 `extension_installed` events in 2 to 6 October
  lack `anonymous_install_id`. Duplicate install events: none (every install
  ID has exactly one event).
- Internal installs: 4 of 78 unique IDs flagged internal on the install event
  and 3 only on later events; all 7 are excluded. One "2.4.0" internal build
  install is among the excluded.
- Store serving timeline (from version-at-install): the store served 0.4.9 to
  every install on 2 October until 0.4.10 first appeared at 22:00 to 23:00
  UTC; 0.4.11 installs start 3 October and 0.4.12 installs start 4 October.
  0.4.9 installs kept arriving at 2 to 3 per day through 4 October. Day
  mixes: 2 October 18x0.4.9 + 2x0.4.10; 3 October 28x0.4.11 + 2x0.4.9;
  4 October 14x0.4.12 + 10x0.4.11 + 3x0.4.9.
- Search event emission: 19 external installs in the window searched within
  24 hours by either event; 18 fired `search_submitted` and 1 (a 0.4.11
  install) fired only the legacy keystroke-level `search_performed`. Store
  builds through 0.4.12 still send `search_performed`; the client-side
  reduction rides a future release.
- The 6 October account ingestion filter and client sampling do not touch any
  cohort in this note: every observation window closed by 5 October 23:59 UTC,
  before the filter went live, and the funnel events (`search_submitted`,
  `result_opened`, `backfill_first_completed`, first `conversation_captured`)
  remain unsampled and unfiltered in any case. The filter drops only retired
  event names.
- Import completion fell to 36.8 percent (from 48.6 percent baseline) while
  first capture held (59.2 percent). The drop appears in both the fix version
  group (16 of 38 on 0.4.11) and the pre-fix group (9 of 23 on 0.4.9), so it
  is not explained by the invitation change. Possible causes are the weekend
  cohort mix, audience mix, or import-completion behavior changes in 0.4.11
  (its changelog touches import completion semantics). Unresolved; the
  definitive week should watch this denominator.

## Funnel, external installs, 24-hour windows

| Step | 21-26 Sep (baseline) | 2-4 Oct (post-release) | 3-4 Oct (fix versions) |
| --- | --- | --- | --- |
| Installs (unique, external) | 185 | 76 | 56 |
| First open (`extension_first_open`) | 182 (98.4%) | 73 (96.1%) | 55 (98.2%) |
| Import completed (`backfill_first_completed`) | 90 (48.6%) | 28 (36.8%) | 20 (35.7%) |
| Any searchable content (import done or first capture) | 126 (68.1%) | 47 (61.8%) | 36 (64.3%) |
| First intentional search (`search_submitted`) | 57 (30.8%) | 18 (23.7%) | 14 (25.0%) |
| Result opened (`result_opened`) | 61 (33.0%) | 23 (30.3%) | 18 (32.1%) |

Install volume context: 2 to 4 October averaged 25.3 external installs per
day against 36.7 per day in the prior completed week. The immature 5 to 6
October days show 19 and 26 external installs (counts only).

Fix version contrast within 2 to 4 October (install version 0.4.10 or later
versus 0.4.9; the 0.4.12 group at 13 installs is shown in the local output but
its rate is suppressed under the minimum-cell rule):

| Group | Installs | Searchable content | First search | Search AND searchable |
| --- | --- | --- | --- | --- |
| Fix versions (0.4.10+) | 53 | 36 (67.9%) | 13 (24.5%) | 10 (27.8% of searchable) |
| Pre-fix (0.4.9) | 23 | 11 | 5 | 2 |

The fix and pre-fix groups are statistically indistinguishable in this window
(one-sided p = 0.36), and both sit below the baseline first-search rate.

## Ordered transitions

| Transition | 21-26 Sep | 2-4 Oct |
| --- | --- | --- |
| Searched AND had searchable content | 50/57 | 12/18 |
| Searched AFTER content was available | 42/57 | 12/18 |
| Searched with no searchable content in 24h | 7/57 | 6/18 |
| Searched AND opened a result | 43/57 | 8/18 |

Every searcher with content in the post-release window searched after content
was available (12 of 12), consistent with the invitation's design of prompting
search once content exists.

Elapsed time, searching installs: median install-to-search 2.8 minutes
(baseline 3.3), median searchable-to-search 3.0 minutes (baseline 2.5), mean
install-to-search 12.7 minutes (baseline 41). Searchers still move fast; the
lower mean reflects more invitation-driven early searches.

## Prompt surfaces

The invitation surface changed completely between the cohorts:

| Surface | 21-26 Sep | 2-4 Oct |
| --- | --- | --- |
| `backfill_search_nudge_shown` | 85/185 (46.0%) | 12/76 (15.8%) |
| `search_ready_popup_shown` (the new one-per-install invitation) | 0/185 | 21/76 (27.6%) |
| `search_ready_popup_cta_clicked` | 0/185 | 11/76 |
| `search_ready_popup_dismissed` | 0/185 | 6/76 |

The shipped fix arms the popup that previously never fired. Its stage funnel
within the post-release cohort, as counts: of 47 installs with searchable
content, 21 saw the popup (44.7 percent), 11 clicked its call to action (52.4
percent of those shown), and 4 of those 11 submitted a search within 24 hours.
Raw cross-tab: no popup 55 installs, 12 searched, 27 with content; shown and
clicked 11, 4 searched; shown and dismissed 6, 1 searched; shown only 4, 1
searched. Both stage conversions (reach among content installs, follow-through
after a click) leak roughly half their cell, and both cells are small.

## Statistical read

Exact one-sided binomial tests against the recorded baseline rates (57/185 =
30.8 percent install-to-first-search; 50/126 = 39.7 percent
searchable-to-search):

- Install to first search, 2 to 4 October: 18/76. Probability of a result this
  weak or weaker if the true rate were the baseline 30.8 percent: p = 0.11.
  Improvement direction: p = 0.93.
- Searchable to first search, 2 to 4 October: 12/47. Decline direction:
  p = 0.031; improvement direction: p = 0.99. This is a nominally significant
  decline, but it carries the heaviest confounds in this read (weekday mix,
  the import-completion drop in the denominator, version mix) and 47 is a
  small denominator, so it is evidence of direction, not a confirmed
  regression.
- 3 to 4 October subset, install to first search: 14/56, decline p = 0.21.
- Fix group versus baseline: 13/53, decline p = 0.20. Pre-fix group versus
  baseline: 5/23, decline p = 0.24.

## Verdict status (handoff output questions)

1. **Content-to-search conversion versus the 30.8 percent baseline:** 18/76 =
   23.7 percent on the mature post-release cohort, about 7 points below
   baseline; the clean fix-version subset reads 25.0 percent. The strict
   conditional (searchable-to-search) reads 25.5 percent against 39.7 percent.
   Direction: down, not up.
2. **Hypothesis status:** the early read does not support the ledger
   hypothesis; there is no evidence of uplift in any cut. The decision-grade
   verdict remains undecidable until the handoff's 12 October run, because
   this window has a third of the needed cohort, a mismatched weekday mix
   (Friday to Sunday versus the baseline's Monday to Saturday), a mixed
   version population, and a shifted import-completion denominator. The
   decline itself is not statistically decisive on the install-to-search rate
   and is confounded on the conditional rate.
3. **Largest remaining step-loss:** unchanged in position. Content-to-search
   is still the biggest leak (62 percent of installs with searchable content
   never search within 24 hours, versus 55 percent at baseline). The new
   mechanism findings sit underneath it: the invitation reached only 44.7
   percent of content installs, and only 4 of 11 call-to-action clickers went
   on to submit a search. Both are product-addressable regardless of the
   verdict.
4. **Data-quality caveats:** weekend versus weekday cohort mix; 0.4.9 served
   to a tail of installs through 4 October; import completion fell in both
   version groups (cause unresolved); one search counted only by the legacy
   event; the 6 October ingestion filter and client sampling do not affect
   these windows; internal installs excluded (7 of 78); observational design
   cannot prove causality.

## What the 12 October run must add

The definitive cohort (installs 5 to 10 October, Monday to Saturday) matches
the baseline weekday structure, roughly triples the sample, and should run an
essentially all-fix version population. It should re-check the
import-completion denominator first (if import completion stays near 37
percent, the searchable pool, not the invitation, becomes the binding
constraint), then repeat the funnel, the version contrast, and the popup stage
funnel with cells large enough for the handoff's minimum-cell rule.

## Limitations

- Observational before/after comparison; cannot prove causal uplift.
- "Searchable content" is proxied by `backfill_first_completed` and
  `conversation_captured` within 24 hours; import completion does not prove
  indexing had finished, so "searchable" is an upper bound.
- `result_opened` can fire from the popup recents list without a submitted
  search, so "searched AND opened" is overlap, not strict linkage (23 opens
  against 18 searchers in the post-release window).
- Version-at-install can lag the running version when Chrome auto-updates
  shortly after install, which blurs the fix versus pre-fix contrast toward
  null rather than manufacturing a positive effect.
- Cells under roughly 30 installs report counts only, per the handoff rule;
  several per-day and per-version rates are therefore intentionally absent.
