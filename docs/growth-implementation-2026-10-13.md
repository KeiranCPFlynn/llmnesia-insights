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

1. Installed Brave Test 2 UI canary and actual diagnostic event delivery are
   complete, as recorded below. The delayed-result-open duplicate is fixed in
   local commit `b1f61e65`, with the final installed/PostHog recheck now passed.
   Keep internal diagnostics out of customer-cohort analysis explicitly.
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

## Continued verification: corrected build and real analytics delivery

Later on 13 October, the registered outputs had been replaced by another
session's corrected clean build, commit
`5969e67742cf459894e3d7fa5f7eb44c90d2b6b1`, version `0.4.17`.
Dogfood build time: `2026-10-13T09:20:51.182Z`; prod build time:
`2026-10-13T09:21:02.956Z`. `npm run check:installs --workspace=extension`
passed for both outputs, including baked Vault configuration and provenance.

The earlier Vault-unavailable observation was a local packaging defect, not
evidence of a backend outage. The old temporary-checkout build lacked the
root environment configuration. Reloaded only Test 2's extension, reopened
Options, and observed the normal Set up Vault state and email sign-in form.
No email code was requested, no account was signed in, and no sync or restore
was started. MCP remained a separate, unconnected feature.
Screenshot: `/private/tmp/llmnesia-test2-vault-ready.png`.

Enabled the documented ten-minute internal diagnostics opt-in in Test 2 only.
Removed only the two first-use flags created by the earlier synthetic test
(`firstSearchCompleted` and `searchInvite.v1`) to repeat first use on the same
otherwise-empty profile. This was not a profile reset. Readiness was armed by
the real backup-import finalizer again, not manually injected. Repeated the
import, hidden-to-visible invitation, suggestion click, result search and saved
transcript open on the corrected build. Both saved messages and the canary code
were present. Screenshot: `/private/tmp/llmnesia-test2-current-transcript.png`.

Two small read-only PostHog queries for only the synthetic Test 2 anonymous
install verified server receipt. Project: `132419`, timezone Asia/Bangkok.
The property verification response was fresh as of
`2026-10-13T11:11:51.374647Z`.

| Event | Local time, 13 October | Verified properties |
| --- | --- | --- |
| search_ready_popup_shown | 18:08:45.775 | internal, passive |
| search_ready_popup_cta_clicked | 18:08:52.799 | internal, intentional |
| search_ready_palette_opened | 18:08:52.955 | internal, passive, overlay |
| search_suggestion_shown | 18:08:53.227 | internal, passive, first_search_overlay, count 1 |
| search_suggestion_clicked | 18:09:11.562 | internal, intentional, first_search_overlay, index 0 |
| first_search_completed | 18:09:12.153 | internal, intentional |
| search_submitted | 18:09:12.156 | internal, intentional, result count 1 |
| search_submitted | 18:09:28.790 | duplicate on delayed result open, result count 1 |
| result_opened | 18:09:28.849 | internal, intentional, overlay, from_search true |

The six inspected palette/suggestion/search/result payloads contained no canary
query, title, transcript text or document identifier, and no forbidden raw-text
property keys. All test events carried `is_internal: true`. This marking enables
exclusion; it does not automatically filter every report. The legacy queries in
`src/posthog.ts` do not currently apply an internal-install exclusion, so raw
event totals must not be described as customer-only. Use explicitly external
cohorts when assessing uplift.

### Confirmed measurement defect, not fixed during testing

One deliberate query emitted `search_submitted` twice, 16.634 seconds apart.
The result-open fallback in `service_worker.ts` calls `maybeFireSearchSubmitted`
again. Its shared suppression rule suppresses an identical query only within
15 seconds, so reading results for longer and then opening one counts the same
search again. Existing tests cover a quick result open, not a delayed one.

This can inflate search frequency and search-impression denominators. It does
not duplicate unique activated installs for the same cohort and time window.
The newly added `from_search` result attribution arrived correctly, but that is
not proof that the older submission-counting logic is accurate.

Recommended focused fix: distinguish a result-open fallback from a fresh query
submission and remember whether that result-producing search already emitted
its submission. Preserve genuine new searches, typing-motion suppression and
early opens before the debounce. Test delayed and repeated opens, changed
queries, empty recents and worker restarts. Do not merely increase the timeout
or suppress every same-text search forever. No fix, push or release was made
as part of this test-only continuation.

Cleanup verified: deleted only the generated chat, refreshed Options to zero
conversations/messages/tokens, removed the diagnostic opt-in and observed
`diagnosticsDisabled: true`, then reloaded Test 2's extension to stop the active
diagnostic session. Closed temporary Gemini and Viewer tabs. Extension reload
closes extension-owned pages, so the original Welcome page was reopened. The
user's Extensions tab and main Brave profile were not modified.

## Duplicate-search bug fixed locally

After Keiran requested the fix, extension commit `b1f61e65` added bounded
local search-submission receipts. Each successful nonempty query gets a random
receipt carried with its displayed results in the overlay and toolbar popup.
Both query settlement and early result opening use the same receipt. Delayed
or repeated result opens cannot submit that search a second time. Concurrent
opens await an in-flight submission so event ordering is preserved.

Receipts survive service-worker restarts in session storage. The bounded ledger
holds at most 256 receipt IDs and handled booleans, never query text, titles or
document IDs. Unknown/evicted receipts and recents cannot invent submissions.
Storage failures fall back to memory and do not break search. A genuinely new
request, even with identical query text, still follows the existing 15-second
typing-motion rules. No receipt ID is added to analytics.

Verification:

- All 70 focused analytics, receipt, suppression and overlay tests passed.
- Eight new receipt cases cover the observed 16.634-second duplicate, repeated
  opens, early opens, in-flight ordering, worker restarts, independent searches,
  suppressed typing fragments, bounded storage and unavailable storage.
- An additional overlay regression verifies that the response receipt reaches
  the result-open message and is withheld for pending query edits and recents.
- Type checking passed in the shared checkout and clean exact-commit worktree.
- Full clean-commit extension suite: 236 files, all 2,794 tests passed.
  Log: `/private/tmp/llmnesia-search-receipts-full-tests.log`.
- Dogfood and prod were rebuilt through the sanctioned unpacked-build scripts
  from a clean registered worktree at the primary checkout's exact HEAD, using
  the required local root environment configuration. Both build-info files
  identify clean commit `b1f61e6593e039bb94ab1e10940cb15fb15ce4df` and version
  `0.4.17`. Both install checks passed, including baked Vault configuration.
  Unrelated uncommitted database and prototype work was not bundled.

The first attempt at the final browser recheck was blocked because the tool
reported the main Gmail window. Keiran clarified that Test 2 was already
selected. Resetting the computer-use connection and reacquiring Brave returned
the correct Test 2 window. The earlier request for Keiran to switch windows was
unnecessary; stale tool targeting was the issue, not his browser selection.

## Final installed/PostHog regression passed

On 13 October 2026, reloaded clean dogfood commit `b1f61e65` in Brave Test 2
with a documented ten-minute internal diagnostics opt-in. Confirmed zero chats,
messages and tokens before importing the same generated backup through the
real Options UI. It imported one conversation and both messages. Vault showed
the normal Set up Vault state. No sign-in or real historical backfill was used.

Opened the real Gemini page, invoked the installed search palette, entered
`sourdough starter` once and verified the correct result. Left it open beyond
the former 15-second duplicate window, then opened the saved transcript. It
displayed both synthetic messages and the expected canary code.

A bounded, uncached PostHog query for only the Test 2 anonymous install, with
an explicit UTC lower bound, returned exactly these two relevant events:

| Event | Asia/Bangkok time, 13 October | Verified properties |
| --- | --- | --- |
| search_submitted | 18:54:26.370 | internal, intentional, overlay, result count 1 |
| result_opened | 18:55:20.363 | internal, intentional, overlay, from_search true |

The result open occurred **53.993 seconds after submission**, with no second
submission event. Fresh query as-of: `2026-10-13T11:56:41.267369Z`.
Neither inspected payload contained canary text, raw-query/title/document/URL
properties, or the new local receipt ID. This verifies the formerly failing
delayed-open case in the actual installed extension and at the ingestion server.
Worker restart, repeated-open and early-open variants remain covered by the
automated regression suite, not asserted as separate live tests.

Screenshot: `/private/tmp/llmnesia-test2-fixed-delayed-open.png`.

Cleanup completed: deleted only the generated chat through the UI, refreshed
Options to zero conversations/messages/tokens, removed the diagnostic setting,
observed `diagnosticsDisabled: true`, and reloaded the extension to stop its
active session. Closed temporary Viewer/Gemini/Options pages and restored the
Welcome page. The generated local backup remains available for restoration.
No email, account mutation, push, store release or production deployment was
performed. This completes verification of the duplicate-counting fix; it is
not evidence of measured customer activation uplift.

## Site guide push and production deployment completed

Keiran explicitly approved pushing the site changes first. On 13 October 2026,
isolated the four-guide change and its regression script on top of the fetched
site `origin/main`, excluding the separate local workflow-document commit and
uncommitted changelog/support work. Pushed only site commit
`b7cdd6b81b6448a66354a87cc1b81a3c855902d8` to `origin/main` in
`KeiranCPFlynn/llmnesia-site-njs`. This is the published equivalent of the earlier
local guide commit `5537717`.

The four-guide regression check passed. The clean worktree's default Turbopack
build rejected the installed-dependency symlink outside its inferred filesystem
root. Reused the installed Next CLI's supported webpack production build, which
passed, then ran the normal exported-language, 223-content-route, homepage and
core-localization checks successfully. No dependency was installed or changed.
The temporary build checkout was removed afterward.

The push triggered the existing Vercel integration. Its status changed from
pending to success, with description "Deployment has completed":
https://vercel.com/keiranflynns-projects/llmnesia-site-njs/HV4Mv32hGYtTVNFCGxqh1qeLVvFM

Fetched all four production URLs and confirmed HTTP 200, the new copy and
the `2026-10-13` update date:

- https://www.llmnesia.com/blog/search-gemini-conversation-history
- https://www.llmnesia.com/blog/how-to-find-old-gemini-conversations
- https://www.llmnesia.com/blog/gemini-conversation-history-limits
- https://www.llmnesia.com/blog/recover-deleted-gemini-conversation

The primary site checkout's unrelated edits were preserved. No extension commit
was pushed, and no extension store release or Insights deployment was performed.
