# Growth changes implemented locally, 13 October 2026

## Delivered

### First useful search

LLMnesia commit `aa0ca8ea`: first-search guidance in the search overlay.

- Before the first completed search, offer up to three local suggestions from
  at most five recent indexed web conversations, including a one-chat corpus.
- Verify the entire proposed phrase against the real keyword search and require
  a match to its originating conversation. Probes bypass the intentional-search
  analytics handler and do not start semantic processing.
- Suggestions are optional. Opening the palette does not submit one. A user
  click submits through the existing search path. Empty imports, failed probes,
  generic titles and coding-session directory names do not produce invented
  examples. Stored filters suppress suggestions rather than hiding their match.
- Late responses after closing or completing a search are ignored. Ordinary
  search remains usable if the suggestion service fails.
- Add `search_ready_palette_opened` after the invitation actually opens the
  palette. Keep it passive, not a successful search or activation event.
- Overlay `result_opened` adds a boolean `from_search` only when the displayed
  results correspond to the current nonempty query. Recents and pending query
  edits do not qualify. Other surfaces without this field remain unknown, not
  implicitly false. This is not a cross-surface query-ID attribution system.
- Diagnostic telemetry contains no suggestion text, query, title, document ID
  or URL. The original `search_submitted` activation definition is unchanged.

### Gemini acquisition guides

Site commit `5537717`: corrected search, old-conversations, history-limits and
deleted-conversation guides, with focused content regression checks.

- Document native Search without unsupported title-only claims.
- Correct the claim that My Activity is a separate recovery copy after deletion.
- Explain accessible historical import, partial coverage and keyword readiness.
- Remove universal history, instant-search and guaranteed-recovery promises.
- Use current Google export instructions: chat activity under My Activity and
  Gemini Apps, distinct from the Gems-only Gemini selection.
- Keep canonical URLs, original publication dates and keyword metadata. Set
  truthful per-page install copy and link to current primary sources.

### Referral reporting

Insights commit `f2e143f`, plus the accompanying audit-protocol documentation:

- Preserve the original GA4 AI Assistant channel series.
- Add separately labelled production-host known-source and combined-union
  series, including Gemini visits classified outside the AI channel.
- Retain full page and source/day details alongside the top-15 summary.
- Record property timezone, GA4 metadata, as-of timestamp and prior-run context.
- Reject incomplete returned row sets rather than silently analysing a truncated
  report. Dated citation audit snapshots are not modified.

## Verification and remaining release gates

- Insights: all 54 repository tests passed, including five new aggregation tests.
- Live report validation: two bounded read-only six-week queries succeeded.
  The sample completed week had 56 AI-channel sessions and 58 in the separately
  labelled production combined union. Same-window prior-run detection worked.
- Website: four-guide metadata/fact/link checks passed. Full Next build,
  223 content-route export checks and all homepage/core localization checks passed.
- Extension: 97 focused tests passed in both the shared checkout and a clean
  detached checkout of `aa0ca8ea`. The clean checkout's typecheck passed.
  Its exact-commit production build passed too, without the shared tree's
  unrelated database edits.
- Full extension regression suite on the clean commit: 234 files and all
  2,779 tests passed (`npm run test --workspace=extension -- --maxWorkers=4`).
- The shared checkout's typecheck reported two transaction-type errors in another
  session's uncommitted `extension/src/background/db.ts`. Those edits were
  preserved. The isolated check establishes that they are not introduced by
  this activation commit; it does not fix or approve that separate work.
- Initial local dogfood and prod-composition outputs rebuilt successfully. Their build
  metadata is explicitly dirty because the canonical checkout includes that
  other session's edits. They are not clean store-release packages. Do not
  publish those outputs as if they contain only this task.
- Browser fixture: generated synthetic chat saved through the real local
  database/index write path, focused overlay opened, verified suggestion
  appeared, a real user click returned the keyword match, and opening it
  displayed the correct synthetic transcript with `from_search: true`.
  The fixture used stubbed extension messaging, no production analytics, no
  real account or founder corpus. Screenshot: `/private/tmp/llmnesia-first-search-proof.jpg`.
  Its disposable synthetic record was removed after verification. Temporary
  fixture tabs and the localhost server were closed.
- At the initial checkpoint, the installed-extension fresh-install/import/invitation flow was
  unverified. Browser tooling denied access to the extension
  management page; no alternate surface or security workaround was used.
  The local fixture is not a substitute for that release gate.

No push, deployment, store submission, email, site publication or recurring job
was performed. These changes have no measured activation uplift yet.

## Next release and measurement

1. Installed Brave Test 2 UI canary is now complete, as recorded below.
   Actual diagnostic event delivery remains unverified: dogfood suppresses
   internal telemetry by default. Verify delivery with the supported bounded
   internal diagnostics opt-in before treating the new measurement as proven.
2. Resolve or isolate the unrelated shared-checkout work before packaging.
   Obtain explicit approval before extension/store release or website deployment.
   Inspect outgoing commit history so another session's commits are not bundled.
3. After release, compare mature external-install cohorts using unchanged
   24-hour first-search conversion, searches returning results and qualified
   result opens. Track invitation click-to-palette and palette-to-search gaps,
   import coverage and zero-only searchers. Release comparisons are observational,
   not a randomized causal estimate.
4. Continue citation sampling separately from referral traffic and Bing results.
   Content corrections are justified by accuracy, not a promise of citation gains.

Rollback preparation: revert the focused commit in the affected repository and
rebuild/test before any approved redeployment. No rollout was executed here.

## Follow-up testing requested by Keiran

Added `extension/tests/first_search_import_flow.test.ts` to exercise the real
backup importer, database/index, import finalizer, invitation state and suggestion
verification together against disposable synthetic IndexedDB data. The native
corpus-sync scheduling call is stubbed; there is no account, Vault or network
test data.

Three new integration cases passed: keyword search succeeds before the finalizer
arms readiness; a hidden claimant retries when visible and claims only once;
empty, partial and duplicate imports preserve truthful invitation behavior. The
suggested query returns the expected saved synthetic transcript. Together with
the invitation-claimer, suggestion, overlay and analytics tests, all 60 focused
checks passed. This supplements, not replaces, the prior 2,779-test run.

At the integration-test checkpoint, the installed-profile test was blocked on an isolated browser setup.
Repository records establish that Chrome Testing 1 has been used with the
founder's real Vault (`docs/vault-r2/VR-12-runbook.md`), so its name is not evidence
that its data is disposable. Neither it nor K2 was used for this test. The browser
tool's existing prohibition on extension-management navigation was respected.
No profile reset, extension-management workaround, installation, live restore,
real-corpus scan or production analytics event was performed.

Required setup for continuing the installed UI check: a fresh empty testing
profile with the local LLMnesia build loaded. Keiran only needs to provide that
setup; the remaining import/invitation/search/open checks are still the agent's
responsibility, not a request for Keiran to run the test himself.

## Installed Brave Test 2 canary completed

On 13 October 2026, Keiran prepared Brave's Test 2 profile with the dogfood
extension loaded. Before import, the actual Options UI showed zero conversations,
messages and tokens, with no local AI helper connected. No founder corpus or
Vault account was used.

Dogfood build metadata: version `0.4.17`, clean commit
`35376fea61f1d3f7b4c05a48534674ab3d271f32`, built at
`2026-10-13T08:29:46.596Z`. This supersedes the earlier dirty-build note for
the current dogfood output. Runtime extension ID:
`bmpnhnhpcfchlepacelfcommjhaneeni`.

Observed through native Brave UI, with no messaging stubs or manual readiness
state injection:

- Kept a logged-out Gemini tab hidden while importing one generated backup chat
  through Options > Import backup. Import reported 1/1 successful, two messages,
  and 17 index tokens before returning to Gemini. This was a backup-import test,
  not a real Gemini historical backfill test.
- Revealing Gemini showed the readiness invitation with one indexed conversation.
  Try now opened the search overlay and focused its empty input. Opening the
  overlay did not submit a search.
- The first-search row offered `sourdough starter`, derived from the saved title.
  Clicking it populated the input and returned the matching indexed conversation.
- Opening that result displayed both saved messages in the extension Viewer,
  including verification code `TEST2-CANARY-20261013`.
- Reopening the overlay after the completed search showed recents and no
  first-search suggestion row. The invitation did not reappear.
- Removed only the generated conversation through its normal Delete control.
  Options > Refresh then confirmed zero conversations, messages and tokens.
  The generated backup remains available locally for restoration. Closed only
  agent-created Viewer, Gemini and Options tabs; user-created tabs were preserved.

Local screenshots:
`/private/tmp/llmnesia-test2-suggestion.png`,
`/private/tmp/llmnesia-test2-search-result.png`,
`/private/tmp/llmnesia-test2-transcript.png`.

Actual PostHog delivery was not verified. Internal dogfood telemetry is disabled
by default, and no diagnostics opt-in or production analytics event was forced.
The UI canary does not establish complete historical import, semantic-index
readiness, cross-platform import coverage or measured customer activation uplift.

Separate observations for follow-up: fresh-profile Options displayed Vault
temporarily unavailable (no Vault sign-in or sync test was attempted). After
deleting the canary, the already-open overlay briefly retained its old one-chat
count although the result was gone; refreshed Options confirmed the empty index.
Neither observation blocked the tested first-search path. No code was changed
for these separate issues during this test.
