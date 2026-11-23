# Where new installs stall, November 2026

Read on 2026-11-23. Analysis only, no code changes. Source: PostHog, aggregate
counts of anonymous installs (no identifiers kept).

## Short answer

**The biggest leak is installs that never start an import: 441 of 919 (48%).
Only 3% of them search within 24 hours, against 42% of installs that do start
an import.** Import completion is not the main problem: people whose import
started but did not finish search about as often (39%) as people whose import
finished (34%) in the last two weeks.

Two things changed in the last two weeks:

1. **Edge installs jumped** from about 23 a week to 110 and 76. Only 16% of
   them start an import. In the 9–21 November cohorts, 156 of 186 Edge installs
   (84%) never started one, and 2 searched.
2. **Chrome and other browsers stayed steady at starting imports (about 60%)**,
   but fewer starters finish (22% of installs were "started, not completed"
   before 9 November, 32% since) and fewer completers search (44% before,
   34% since).

## Method

- Cohort: installs from 26 October to 21 November 2026, Monday to Saturday of
  each week (UTC), internal installs excluded, first `extension_installed`
  event per anonymous install. Sunday is left out because the newest Sunday
  does not yet have 24 hours of data. This is the same cohort as
  `scripts/activation-diagnosis.mjs`. Weekly sizes match it exactly
  (200, 170, 310, 239). I ran that script for the four weeks starting 26 October,
  2 November, 9 November and 16 November and used its error and invitation tables.
- Steps count an install once if the event occurs within 24 hours of install:
  import started `backfill_started`; import completed `backfill_first_completed`;
  first search `search_submitted`; search with results `search_submitted` with
  `result_count` above 0; result opened `result_opened`.
- Version is the version at install. Platform is the platform of the install's
  first `backfill_started`.
- The headline "19% used it within 24 hours" is all days and all browsers for
  16–22 November (52 of 270). This table's equivalent for 16–21 November is
  41 of 239 (17%).
- **0.4.26 is not in the table.** It was prepared today and is not in the
  store, so it has no cohort. Add it after its first full week.
- "Result opened" is not limited to search results (it also fires when a saved
  chat is opened from a list), so it can exceed "search with results".

## Install to first result, by install version

| Version | Installs | Import started | Import completed | First search | Search with results | Result opened |
|---|---:|---:|---:|---:|---:|---:|
| 0.4.18–0.4.20 | 25 | 16 (64%) | 9 (36%) | 8 (32%) | 5 (20%) | 8 (32%) |
| 0.4.21 | 182 | 103 (57%) | 54 (30%) | 57 (31%) | 44 (24%) | 59 (32%) |
| 0.4.23 | 222 | 136 (61%) | 92 (41%) | 58 (26%) | 50 (23%) | 81 (36%) |
| 0.4.24 | 189 | 79 (42%) | 36 (19%) | 37 (20%) | 34 (18%) | 51 (27%) |
| 0.4.25 | 301 | 144 (48%) | 66 (22%) | 55 (18%) | 48 (16%) | 94 (31%) |
| **All** | **919** | **478 (52%)** | **257 (28%)** | **215 (23%)** | **181 (20%)** | **293 (32%)** |

By week of install: first search was 30%, 29%, 21%, 17% for the weeks starting
26 October, 2 November, 9 November, 16 November. Import started was 60%, 60%,
47%, 46%. The version columns are tangled with the Edge surge (below): 0.4.24
and 0.4.25 are the versions Edge visitors installed, so the table cannot say
whether those releases made anything worse.

## Same funnel by browser and import outcome

| Period | Browser | Installs | No import started | Started, not completed | Completed |
|---|---|---:|---:|---:|---:|
| 26 Oct–8 Nov | Chrome and others | 323 | 127 (39%) | 72 (22%) | 124 (38%) |
| 26 Oct–8 Nov | Edge | 47 | 21 (45%) | 15 (32%) | 11 (23%) |
| 9–21 Nov | Chrome and others | 363 | 137 (38%) | 115 (32%) | 111 (31%) |
| 9–21 Nov | Edge | 186 | **156 (84%)** | 19 (10%) | 11 (6%) |

Share who searched within 24 hours, by the same groups:

| Period | Browser | No import | Started, not completed | Completed |
|---|---|---:|---:|---:|
| 26 Oct–8 Nov | Chrome and others | 4 of 127 (3%) | 34 of 72 (47%) | 55 of 124 (44%) |
| 26 Oct–8 Nov | Edge | 2 of 21 | 9 of 15 | 6 of 11 |
| 9–21 Nov | Chrome and others | 5 of 137 (4%) | 45 of 115 (39%) | 38 of 111 (34%) |
| 9–21 Nov | Edge | 2 of 156 (1%) | 8 of 19 | 7 of 11 |

Edge installs per week: 23, 24, 110, 76. Chrome and others: 177, 146, 200, 163.
Chrome-only first-search rate by week: 32%, 27%, 26%, 18%.

## First import platform

Rows are installs that started an import, by the platform of their first
import. These groups do not overlap, so they sum to the "import started" totals.

| First import | Version group | Started | Completed | First search | Search with results | Result opened |
|---|---|---:|---:|---:|---:|---:|
| **Character.AI** | 0.4.21–0.4.23 | 53 | 7 (13%) | 30 (57%) | 30 (57%) | 45 (85%) |
| **Character.AI** | 0.4.24–0.4.25 | 52 | 5 (10%) | 28 (54%) | 28 (54%) | 42 (81%) |
| ChatGPT | 0.4.21–0.4.23 | 62 | 39 (63%) | 26 (42%) | 21 (34%) | 27 (44%) |
| ChatGPT | 0.4.24–0.4.25 | 56 | 33 (59%) | 25 (45%) | 20 (36%) | 28 (50%) |
| Claude | 0.4.21–0.4.23 | 35 | 29 (83%) | 21 (60%) | 17 (49%) | 19 (54%) |
| Claude | 0.4.24–0.4.25 | 31 | 17 (55%) | 13 (42%) | 13 (42%) | 18 (58%) |
| Gemini | 0.4.21–0.4.23 | 29 | 25 (86%) | 12 (41%) | 10 (34%) | 14 (48%) |
| Gemini | 0.4.24–0.4.25 | 22 | 17 (77%) | 5 (23%) | 5 (23%) | 9 (41%) |
| All other platforms | 0.4.21–0.4.23 | 60 | 46 (77%) | 19 (32%) | 15 (25%) | 29 (48%) |
| All other platforms | 0.4.24–0.4.25 | 62 | 30 (48%) | 16 (26%) | 11 (18%) | 40 (65%) |

- **Character.AI:** almost nobody finishes the import (10–13%), yet about half
  search and about 80% open a result. Partial imports are searchable, and
  Character.AI starters mostly arrive from the "old character ai" guide. Every
  Character.AI starter who searched also got results (60 of 60), which is
  unusual and not explained here. Do not read this as "Character.AI imports
  work".
- **Claude:** import completion fell from 83% to 55% and searching from 60%
  to 42%, on small numbers (35 and 31 installs).
- **Gemini:** imports complete (77–86%), but only 23–41% search.
- "All other platforms" is Copilot, DeepSeek, Google AI Mode, Grok, Perplexity
  and a few others. 0.4.18–0.4.20 installs (16 starters) are left out of the
  platform rows.

## The biggest drop-off, and the evidence

**Step: install to import started** (441 of 919 installs lost here).

- 441 installs started no import; 13 of them searched (3%) and 6 got results.
- The welcome page's import buttons are the only way a first import starts for
  these people, and it does not look like they leave it unseen. Among installs
  since 0.4.24 that never started an import, 100 of 267 recorded
  `pin_nudge_shown` (a proxy for the welcome page rendering; only 13 of 223
  installs that did start an import clicked an onboarding step, so the page's
  own events are thin). In-page search-ready popups appeared for 39 of those 267.
- Only about 4–5% of no-import installs opened the extension popup afterwards
  (`extension_opened`: 14 of 174 before 0.4.24, 10 of 267 since), and none of
  them saw `backfill_search_nudge_shown`, which only fires for installs that
  already started an import. So no later prompt reaches them.
- In the Edge group since 9 November, 87 of 156 no-import installs saw the pin
  nudge or an in-page popup, so most of them are real users who saw the
  welcome page and did not click an import button (the other 65 recorded
  nothing beyond the install events). Edge installs are recorded as "not
  pinned" every time (233 of 233), which may be a detection limit rather than
  user behaviour.
- Chrome installs recorded as pinned start imports more often (62%) than
  unpinned (50%).
- Import errors do not explain it: the error events in the script output
  (Claude HTTP 403 on 19 of 36 Claude starters, Character.AI HTTP 403 on 14 of
  19 starters in the week of 16 November) come from installs that already
  started an import.

**Second step: import completed, then first search** (276 starters did not
search). Among Chrome and other installs since 9 November, 111 completed but
only 38 (34%) searched. The search-ready invitation brings people to the search
palette (palette opened 42 of 42 clickers, week of 16 November), but only 14 of
those 42 then submitted a search. Failures during import matter less: starters
who did not complete still searched 39% of the time.

## Recommended product changes, ranked by expected effect

Expected effects use the rates above. An install that starts an import searches
about 42% of the time, one that does not about 3%. At about 280 installs a week,
moving 10% of installs from "no import" to "started" adds roughly 11 searchers
a week, about 4 points of the first-day rate. These are estimates from a few
weeks of data, not forecasts.

1. **Prompt installs to start an import after the welcome page, and look at
   Edge separately.** Today no prompt reaches the 48% who skip the welcome
   buttons. On the first visit to a supported chat site with no import started,
   show a one-line "Save the chats on this site" prompt that starts the
   import. Before building, check where the Edge installs since 9 November came
   from (store listing, referrer, a feature in Microsoft's store) and what
   their welcome page looks like, because 84% of them do nothing. Largest
   expected effect: about +4 points of first-day use for every 10% of installs
   it moves.
2. **After an import completes or the invitation is clicked, start the first
   search for the person.** Only 34% of completers search, and 14 of 42 who
   clicked the invitation searched. Open the palette with one suggested
   search from their own newest chat titles already filled in, or run it.
   Estimate: lifting completers from 34% to 50% adds about 9 searchers a week,
   about 3 points.
3. **Fix the Claude and ChatGPT import failures that interrupt starters.**
   Claude discovery was refused (HTTP 403) for 19 of 36 Claude starters and 30
   ChatGPT installs recorded a cancelled import in the week of 16 November.
   This protects trust but has the smallest effect on first-day use, because
   partial imports still support search. Needs a reproduction against a signed-in
   account before any change is scoped.

## Limits

- Only 24 hours after install is measured. Late starters are not counted.
- Edge versus Chrome comes from the browser reported on the install event.
  Why Edge installs rose is not established here.
- Version and week move together with the Edge surge, so no version is shown to
  be better or worse.
- Failed-import counts repeat per install and cannot be added across weeks.
