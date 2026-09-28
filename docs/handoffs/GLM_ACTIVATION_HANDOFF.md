# GLM handoff: validate activation and improve the first-search handoff

Approved scope: 28 September 2026. Implement locally, test, and commit in focused checkpoints. Publishing and release require separate approval.

## Goal and reasoning

Help new LLMnesia users reach a useful first search after importing their conversations. Validate the measurement first, then implement a small, measurable first-search invitation. Success means users finding and opening their own conversations, not simply generating prompt clicks.

Work primarily in `/Users/Kdog/Code-Projects/LLMnesia`. Analytics code and local evidence are in `/Users/Kdog/Code-Projects/llmnesia-insights`. Read each repository's AGENTS.md before working there. Inspect current changes and preserve other work. This is an implementation task, not another strategy exercise.

## Evidence and limits

- The initial completed-week comparison, 14-20 versus 21-27 September, showed installs increasing from 164 to 223 while searches within 24 hours increased only from 61 to 64. The later Sunday cohort was not fully mature at collection.
- The more comparable Monday-Saturday cohorts, 14-19 versus 21-26 September, showed 55/144 (38.2%) versus 57/189 (30.2%) searching within 24 hours. These diagnostic counts still include internal users and need validation.
- In the later cohort, version 0.4.4 had 29/67 first-day searchers, 31/67 first import completions, and 40/67 conversation captures. Version 0.4.7 had 9/48 searchers, 22/48 import completions, and 28/48 captures. Version correlates with release date and audience, so these counts do not prove a version regression.
- Import and search milestone counts were independently measured inside each install's first 24 hours. Their overlap does not prove search happened after import. Passive capture is not intentional activation.
- The existing small `backfill_search_nudge_shown` event is firing. Do not treat that nudge as newly broken.
- The separate `search_ready_popup_shown` event was absent in the inspected cohorts. In inspected code, `llmnesia.activation.showReadyPopup` is read and cleared but never armed. This is an older documented gap, not a proven explanation for the recent decline.

Recheck these observations against current code. Useful entry points:

- Insights: `src/posthog.ts`, `.insights/activation-diagnostic.mjs`, `.insights/review.json`. The `.insights` files are local, ignored artifacts; do not assume they exist in another checkout or commit their contents wholesale.
- Extension: `extension/src/content/bootstrap.ts` (`checkAndShowReadyPopup`, `showReadyPopup`, `maybeShowPostBackfillSearchNudge`), `extension/src/background/service_worker.ts` (import completion and activation messages), `extension/src/shared/analytics.ts`, `extension/src/shared/backfill.ts`.
- Historical context: `docs/RELEASE_0_2_5_BOARD.md` T-D2 and `docs/REVENUE_LAUNCH_BOARD.md`. Treat old status and conclusions as historical, not current facts.

## 1. Validate the funnel

Use existing analytics access read-only and report aggregate results only. Exclude known internal installs, quantify unknown internal status, check missing IDs and duplicate install events, and verify consistent identity and search event emission across relevant versions. Use unique installs with fully elapsed observation windows and an explicit timezone and cutoff.

Measure ordered transitions: install, searchable content available, first intentional search, first result opened. Use actual supported events and timestamps. If searchable content availability or result linkage cannot be established, describe the limitation instead of inventing an event or inferring causality. Show counts, denominators, and elapsed time; segment by version and browser where sample sizes support it. Do not silently change the existing activation definition.

Keep this investigation bounded. If analytics access is unavailable, record that, prepare reproducible queries and synthetic validation, and continue the independently justified prompt fix after confirming the code gap. Do not fabricate live results or make broad attribution changes.

## 2. Implement the first-search invitation

Reuse the existing ready prompt and search-opening path where practical. Present it once after an import has produced genuinely searchable content, including a partial import with usable content. Do not imply that a partial import is complete.

- Support import completion while a content script is already running. Setting a flag checked only at page boot is insufficient.
- If there is no eligible visible page, retain pending eligibility for the next suitable page.
- Suppress it for users who have already searched, and after dismissal or use. Repeated imports, reloads, multiple tabs, and service-worker restarts must not produce duplicate prompts.
- The CTA must open the actual search interface. Do not automatically submit a query or count opening the interface as a search.
- Coordinate with the existing hint so users are not shown overlapping invitations.
- Preserve import/resume behavior, indexing, and existing search access. Reuse existing telemetry for shown, clicked, and dismissed where accurate; respect analytics opt-out and internal tagging. Never send query text or conversation content in new telemetry.
- Keep the change small. Avoid a general onboarding redesign, new infrastructure, dependencies, or unrelated product changes.

## 3. Verify and leave a reviewable result

Add focused behavioral tests for successful and partial imports, zero indexed content, already searched, dismissal, repeated completion, multiple tabs, and the live-page versus later-page paths. Exercise actual message/state wiring as well as isolated helpers. Run the applicable existing tests, typecheck, and build using installed tools and repository instructions.

Demonstrate the fresh-install flow in an isolated test profile with synthetic data if available. Never reset the founder's profile or real corpus. If browser verification is unavailable, report that limitation and give exact manual steps rather than claiming end-to-end verification.

Keep the current 24-hour search metric. Document companion measurements for first result opened and seven-day search return, including when each cohort becomes mature. Before/after changes are observational, not proof of causal uplift. No new recurring job is requested.

Commit only this task's changes in focused local commits. Finish with commit IDs, a concise diagnosis separating facts from hypotheses, changed behavior, verification results, remaining limitations, and release/rollback notes. Include a short measurement note with queries or reproducible commands. Do not push, publish, deploy, send outreach, or change live infrastructure. The founder will approve release after review.
