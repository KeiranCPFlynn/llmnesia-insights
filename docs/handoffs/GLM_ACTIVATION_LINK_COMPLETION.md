# GLM handoff: finish activation and source-link fixes

## Goal and reasoning

Help newly installed users reach a real first search and open a useful result.
The invitation must appear when indexed conversations are available, including
when an importing tab becomes visible again. Source links must open the saved
conversation in the extension actually installed in the receiving profile,
without sending users to a browser error page.

These are completion fixes, not a new feature or another broad bug hunt.
Codex owns the diagnosis and acceptance review. Implement locally, verify,
commit focused changes, and return evidence for that review. Do not deploy,
push, publish, submit a store update, install dependencies, change live data,
or create infrastructure. Any release needs separate approval.

## Repositories and current state

- `/Users/Kdog/Code-Projects/LLMnesia`: first-search invitation `cedaa56`,
  source-link bridge `657ae90`, bridge regression/retry fix `3b2d170`.
- `/Users/Kdog/Code-Projects/llmnesia-site njs`: handoff discovery `725f9be`.
- `/Users/Kdog/Code-Projects/llmnesia-insights`: original design in
  `docs/handoffs/GLM_VIEWER_LINK_FIX.md`; funnel definitions corrected in
  `93b70ef`.

Read applicable AGENTS.md instructions and the original Viewer-link brief.
Inspect each working tree before editing. There is unrelated dirty work in all
three repositories. Preserve it. The companion's browser-neutral source-link
changes in `companion/src/mcp.ts` and `companion/test/mcp.smoke.test.ts` are
already uncommitted; review and finish them rather than overwriting them.
Coordinate if ownership overlaps. Never stage another session's changes.

Codex reran 34 invitation tests and 28 bridge tests on 1 October: all passed.
Website handoff tests passed but only exercise the parser, not discovery.
These passes do not establish browser behavior or activation uplift.

## 1. Finish the activation invitation

In `extension/src/content/bootstrap.ts`, `maybeShowSearchInvite()` skips hidden
tabs correctly, but the existing visibility/focus handlers do not retry it.
Call the eligibility path when the page becomes visible or focused, with safe
in-flight guarding. Preserve background once-per-install claiming across tabs.
Review failure paths so a transient pre-claim failure cannot permanently disable
the page's retries. Do not introduce repeated invitations after a successful
claim, dismissal, CTA use, or an existing search.

Partial-import copy currently says "The rest is still importing." Partial
imports can also be cancelled, throttled, or truncated. Replace this with
truthful wording, for example "N conversations are searchable so far." Do not
claim remaining work is actively running without verified active-run state.

Verify readiness against the actual indexing path. An import completion signal
alone is insufficient if keyword-index writes have not finished. The prompt
must only promise search for conversations that are locally indexed. Do not
wait for semantic embeddings if keyword search already works, and do not imply
the entire provider history is imported. The CTA opens search, never submits a
query or counts opening the palette as a search.

Add behavioral coverage for hidden-to-visible retry, competing claim attempts,
transient pre-claim failure, truthful partial copy, already-searched suppression,
and once-only dismissal/use. Prefer a focused testable seam over a broad
bootstrap refactor or source-string-only tests.

## 2. Finish website discovery and safe fallback

`app/open/viewer-handoff.js` still violates the original brief in two places:

- At the discovery deadline it automatically redirects to the unverified hint
  when nobody replies. This recreates `chrome-extension://invalid/` when the
  saved ID is absent. Remove this automatic fallback. Keep a useful page with
  retry, guidance to use the installed profile or update/enable LLMnesia, and a
  local copy/search fallback. Do not advise disabling browser protections.
- `chooseTarget()` and the discovery reply handler open the first responder
  immediately. Collect responses during the bounded discovery window. Honor a
  matching extensionId preference, use a sole responder when no preference
  matches, and show an explicit choice for multiple responders with no match.
  Display build labels and abbreviated IDs. Do not race installations.

Remove the primary direct Viewer anchor shown during discovery, since it also
points to an unverified ID and bypasses the bridge. Route open actions through
the selected responder. Keep legacy links supported through discovery, not an
automatic guess at a chrome-extension URL.

Validate message source, origin, version, request ID, and bounded fields. Track
the chosen responder consistently. Preserve fragment-only document identifiers
and `/open` analytics exclusion. Do not send document IDs or conversation
content to website APIs, logs, analytics, or external services. Retain the
extension's sender/origin/path checks and navigation derived from runtime.getURL.

Extract a small testable discovery controller if useful. Add behavioral tests
for stale hint plus sole responder, matching hint arriving after another build,
multiple responders and user choice, no responder with and without an old hint,
retry, malformed/unrelated messages, timeout and cleanup. Existing parser tests
alone do not cover these requirements.

## 3. Complete companion source-link changes

Review the existing uncommitted changes: new local-only `sourceUrl` values must
be browser-neutral `https://llmnesia.com/open#docId=...`. Keep original provider
URLs and legacy `viewerUrl` intact. Run the companion tests and commit these
focused changes only if safely isolated. The currently running MCP still
returns extensionId-bearing source links, so distinguish prepared code from
running/released behavior. Do not restart or publish a service as an implicit
release step.

## Acceptance and verification

Run focused extension tests, typecheck, companion tests, website behavioral and
parser tests, and the website build using installed tools. Rebuild dogfood/prod
extension outputs as required by its repository instructions. Separate baseline
failures from regressions and record exact commands and results.

Use an isolated existing browser test setup and synthetic conversation data:

1. Import a known conversation through a supported import path. Verify its
   keyword search returns it and opening the result displays the right content.
2. Let import finish with an eligible tab hidden, then show that tab. Verify the
   invitation appears once, its CTA opens search, and a real submitted search
   and result open use the existing distinct analytics events. No manual arming
   of invitation state or fake index stats counts as an end-to-end pass.
3. Click a real HTTPS handoff link containing a stale extension ID. Exercise the
   actual website, content script, and background handler together, and verify
   the known imported conversation appears. An unknown ID must reach the
   Viewer's not-found state.
4. With no compatible extension, both neutral and legacy-hint links must remain
   on a helpful website page, never navigate to a browser error page. Cover
   multi-build selection in automated behavior tests and in a browser if an
   existing safe setup permits it.

Do not reset the founder's profile, change its extension configuration, weaken
security, or install testing software. If real HTTPS/browser verification is
unavailable, finish the local checks and explicitly leave that gate unverified.
Do not substitute a manually corrected URL or injected acknowledgment for it.

## Delivery

Return a concise report with commit IDs per repo, files changed, test/build
results, browser evidence, and remaining gaps. Include a rollout checklist and
rollback plan, but do not execute rollout. Compatibility sequence remains:
bridge-capable extension, safe website discovery, then neutral MCP source links.

The success metrics remain 24-hour first `search_submitted` conversion and
first-result-open conversion among new external installs, with import completion
as a prerequisite/guardrail. Existing popup shown/CTA/dismissed events help
diagnose exposure; they are not successful searches. Do not claim measured
uplift from local tests or silently alter funnel definitions. Do not publish a
new Insights review, send outreach, or expand into unrelated product work.
