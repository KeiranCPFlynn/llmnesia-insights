# Codex handoff: review the first-search invitation implementation

Scope: verification only. GLM implemented and locally verified the approved
28 September activation scope. Check the work, report a verdict with evidence,
and change nothing without flagging it first. Do not push, publish, deploy, or
touch live infrastructure; release stays with the founder.

## What to review

Two local commits, on main, not pushed:

- LLMnesia `cedaa56` "Arm the first-search invitation after an import lands"
  (5 files: new `extension/src/shared/search_invite.ts`, changes to
  `extension/src/background/import_finalizer.ts`,
  `extension/src/background/service_worker.ts`,
  `extension/src/content/bootstrap.ts`, plus
  `extension/tests/search_invite.test.ts`).
- llmnesia-insights `ee2dbd1` "Add activation funnel validation note for 28
  September 2026" (`docs/activation-funnel-validation-2026-09-28.md`).

The claims to check are in the commit message and section 4 of the note.

## Environment cautions

- The LLMnesia working tree carries another workstream's uncommitted changes
  (vault reset in `service_worker.ts` +16 lines, `options.ts`, `popup.ts`,
  others) and pre-existing stashes. `cedaa56` was staged selectively so the
  commit contains none of that work. Do not reset, stash, or "clean" the tree.
- One pre-existing test failure exists independent of this work:
  `tests/vault_paywall.test.ts` "states the active subscription explicitly"
  expects copy that the uncommitted `options.ts` edits removed. Do not attribute
  it to `cedaa56` and do not "fix" it as part of this review.
- No em dashes in anything user-facing (both repos' standing rule).

## Verification steps

1. Diff review: `git -C /Users/Kdog/Code-Projects/LLMnesia show cedaa56`.
   Confirm the staged service_worker diff contains no VaultReset code and that
   behavior matches the claims: arming rides the shared finalizer, claim is
   once per install, partial imports arm with `partial: true`, the popup CTA
   calls `openPalette()` without submitting a query, dismissal/use/searched all
   retire the state, and no new analytics event or property was added.
2. Unit and wiring tests: from `extension/`, run
   `npx vitest run tests/search_invite.test.ts` (expect 34 passing) and
   `npm run typecheck` (expect clean). Full suite `npm test` if desired:
   expect the single pre-existing paywall failure above, all else green.
3. Fresh-install behavior: either accept the browser demo recorded in the
   founder-facing report (isolated headless profile, dogfood build loaded via
   CDP `Extensions.loadUnpacked`; live claim without reload, once-ever across
   reloads, partial copy, done/used and done/dismissed states observed) or
   repeat it: launch Chrome with a NEW user-data-dir and
   `--enable-unsafe-extension-debugging`, load `extension/dogfood/` unpacked
   via CDP, open claude.ai, write the armed state
   (`llmnesia.activation.searchInvite.v1`,
   `{status:"armed",partial:false,count:42,armedAt:Date.now(),doneReason:null}`)
   from the service-worker context, and observe the popup, CTA, and reload
   behavior. Never touch the founder's real profile or corpus.
4. Analytics claims: the note's numbers came from read-only PostHog HogQL
   queries; reproduce any of them from the queries embedded in
   `docs/activation-funnel-validation-2026-09-28.md` (UTC, external installs,
   Monday-Saturday cohorts, 24h windows; the full generator exists locally at
   `.insights/funnel-validation-2026-09-28.mjs` in GLM's checkout and is
   intentionally not committed). Key claims worth re-checking: 141 vs 185
   external installs, 55 (39.0%) vs 57 (30.8%) searching in 24h, import
   completion flat, `search_ready_popup_shown` zero in both cohorts.

## Acceptance criteria map (from the approved handoff)

- Import completion while a content script is already running: storage
  onChanged listener in bootstrap triggers the claim on an open page.
- No eligible visible page: hidden tab or missing body skips without claiming;
  the next suitable page shows it.
- Suppression: already-searched users never arm and are retired at claim time;
  dismissal and CTA use mark done; repeated imports, reloads, tabs, and worker
  restarts cannot duplicate (armed -> shown transition plus in-flight guard).
- CTA: opens the palette only; no query submitted; opening is not counted as a
  search.
- Coordination: pending invitation suppresses the immediate backfill nudge and
  the first-run pill hint; later imports arm the nudge as before.
- Telemetry: reuses existing `search_ready_popup_shown/cta_clicked/dismissed`
  via `TRACK_ACTIVATION_EVENT`; no query or conversation content in any event;
  opt-out and internal tagging unchanged.
- Metric: the 24-hour `search_submitted` definition is unchanged; companion
  measurements (first result opened, seven-day return, maturity dates) are in
  the note.

## Report format

Return: verdict per area (commit diff, tests, browser behavior, analytics),
any discrepancies with file:line evidence, and anything you believe must change
before release. Note explicitly if you find the pre-existing paywall failure
reproducible without this branch's changes.
