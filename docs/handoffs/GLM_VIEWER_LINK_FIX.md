# Fix MCP source links opening the wrong browser extension

## Ownership and goal

Implement this approved design, then return the work to Codex for review. Codex owns the diagnosis and acceptance decision. Complete local implementation, tests, builds, and focused commits. Publishing, deployment, package release, and store submission need separate approval.

Goal: clicking a LLMnesia MCP source link opens the saved conversation through LLMnesia installed in the browser that receives the link. A missing or incompatible extension must produce helpful guidance instead of a browser error page.

Read applicable repository instructions and preserve other sessions' changes. Repositories:

- Extension and MCP: `/Users/Kdog/Code-Projects/LLMnesia`
- Public website: `/Users/Kdog/Code-Projects/llmnesia-site njs`

This task concerns source-link navigation. Do not mix in the activation-prompt work.

## Verified diagnosis

The failing MCP link used `extensionId=leekfgbdojiaabifbjbbgiiclannjdkf`, the public store ID. The founder's Brave profile actually runs the local extension as `bmpnhnhpcfchlepacelfcommjhaneeni`. Its Viewer successfully displays the requested chat.

Codex checked the failed Brave tab: `chrome-extension://invalid/`, `ERR_BLOCKED_BY_CLIENT`. Codex then opened the SAME `https://llmnesia.com/open#docId=...` link with the installed `bmp...` ID and watched it successfully redirect into the Viewer and display that conversation. The website redirect works with the correct ID. Do not diagnose this as Brave blocking all extension links.

`companion/src/mcp.ts` chooses an environment/configured extension ID or the store default. `companion/src/config.ts` reads `~/.llmnesia/config.json`; its current `viewerExtensionId` is the store ID. One machine-wide ID does not identify the extension/profile in whichever browser receives a link.

`app/open/viewer-handoff.js` currently waits 50ms and redirects directly to a constructed extension URL. `app/open/viewer-link.js` builds that URL. `extension/public/manifest.json` already makes `viewer.html` accessible from the two official website origins. `app/components/site-runtime.js` deliberately disables analytics on `/open` to protect the local identifier in the fragment. There is no reliable failure-rate evidence, so do not claim all users are affected or that store users have been tested.

## Required design

Use a small extension content script on the official handoff page to discover the installed extension in the CURRENT browser profile. Have the selected extension's background worker open its own Viewer using `chrome.runtime.getURL`. Reuse existing Viewer navigation helpers where practical. Do not solve this by hardcoding the founder's unpacked ID or modifying their global MCP/native-host configuration.

1. Limit the bridge to top-level HTTPS pages on `llmnesia.com` and `www.llmnesia.com`, with runtime pathname checks for exactly `/open` or `/open/`. Use the narrowest viable content-script matches. Do not add a general externally callable extension API or broaden Viewer access to arbitrary websites.
2. The website initiates versioned discovery after mounting; the content script replies with its own runtime ID and an appropriate extension/build label. Use request IDs and a bounded retry/timeout so listener startup order cannot lose the handshake. Validate message source, origin, type, and bounded fields on both sides. Treat page messages as untrusted commands, even on this allowed origin.
3. Treat an existing link's `extensionId` as a preference only. If it matches a responding installation, use that installation. Otherwise use a sole responder. If multiple installations respond without a matching preference, present a choice instead of racing them or choosing arbitrarily. A build/version label and abbreviated ID can disambiguate the choices. Discover only this profile; do not inspect other profiles or launch another browser.
4. Send the open request only to the selected responder. Its content script validates the document ID, then uses internal extension messaging. The background handler must validate the actual sender's extension ID, top-level tab, trusted origin and exact path. Do not trust a URL or tab ID supplied by the webpage. Derive the destination from the extension's own runtime URL, encode the document ID, and navigate only the requesting tab. Guard duplicate requests within that handoff attempt. Opening the Viewer must not edit conversations.
5. Do not use the conversation ID as a destination URL. Retain the existing length/control-character validation, and reject malformed or missing IDs. Keep the ID in the fragment and local messages. Do not send it to website APIs, analytics, logs, or third-party scripts. Preserve `/open`'s analytics exclusion. Do not expose conversation contents or existence to the website during discovery; the Viewer handles a missing local conversation after navigation.
6. Remove automatic navigation to an unverified extension ID. When no compatible responder appears, retain a useful website page explaining that the user should open the link in the profile containing LLMnesia or update/enable the extension. Provide retry and a local copy/search fallback. Do not ask users to disable Brave Shields or browser protections.
7. Keep existing MCP links containing `extensionId` working through this discovery protocol. New MCP `sourceUrl` values for local-only conversations should use the browser-neutral `/open#docId=...` format. Original provider URLs stay intact. Preserve the existing `viewerUrl` field for compatibility, but source links should not depend on it. Update MCP guidance and tests accordingly.

Prefer small, explicit modules over changes buried in the large bootstrap file. The ordinary AI-site capture script need not run on the handoff page.

## Verification that decides completion

Use installed tools only. Add behavioral tests for protocol discovery, stale ID with a sole valid responder, explicit matching ID, multiple responders, timeout/retry, malformed IDs, duplicate messages, and rejected origins/paths/senders. Tests that merely look for source-code strings are insufficient for the bridge.

Run the relevant extension and companion tests, typechecks, website handoff tests and production build. Rebuild the extension's dogfood/prod outputs as required by repository instructions, preserving concurrent work. Report baseline failures separately.

Demonstrate the complete flow in a real browser with synthetic data and an isolated profile: insert a known local conversation through a supported test/import path, click a real HTTPS handoff link whose extension ID is stale, and verify the correct conversation appears in the installed extension's Viewer. Also demonstrate no-extension behavior stays on a useful page, and that an unknown local document produces the Viewer's not-found state. Exercise the real content script, background messages, and website together. A manually corrected URL, injected acknowledgement, or manually forced state is not an end-to-end pass.

Test in Brave where an installed test environment permits it. Do not reset the founder's profile, alter its extension configuration, install software, or weaken browser security for testing. If an HTTPS test origin/browser setup is unavailable, complete code and automated verification, document the exact missing browser check, and leave that acceptance criterion unverified.

## Delivery and rollout notes

Commit focused changes in each affected repository. Return commit IDs, files changed, test/build results, observed browser behavior, remaining gaps, and a short rollback plan. Do not claim deployment or customer impact improvements from local tests.

Document the compatibility sequence for approval: ship an extension build containing the bridge; enable the website discovery flow with clear guidance for older builds; then publish the neutral MCP source-link format. Keep old links supported throughout. Do not push, deploy, publish packages, submit a store release, create cloud resources, or introduce recurring jobs in this task.
