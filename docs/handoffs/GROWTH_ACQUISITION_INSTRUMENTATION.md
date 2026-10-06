# GLM handoff: acquisition and Vault instrumentation bundle

## Goal and reasoning

Three attribution findings block the founder's growth push, all confirmed by
`docs/GROWTH_CHANNEL_ATTRIBUTION_2026-10-06.md` in the insights repo:

1. The `extension_installed` event carries no acquisition context of any
   kind (verified: `source` is the constant "install", `install_reason` the
   constant "install", no utm, referrer, campaign, or MCP property in 1,235
   events over 45 days). Nothing downstream can be attributed, including the
   MCP acquisition initiative, until an install marker exists.
2. The Vault funnel reads 3 creations from 238 installs in a record week,
   with `vault_created` but no event marking when Vault is first offered, so
   the top of the funnel cannot be diagnosed.
3. The website purchase flow (`app/components/vault-purchase.js`) has no
   analytics wiring, so checkout start and purchase completion are invisible
   in GA4.

Also fixed here: the outreach draft builder's `urlFor` was a no-op, so the
97 first contacts and 88 follow-ups went out with untagged links and their
yield is structurally zero. This bundle ships the smallest instrumentation
that closes all four gaps, riding the next release.

## Repositories and current state

- `/Users/Kdog/Code-Projects/LLMnesia`: `extension/src/shared/analytics.ts`
  (event type union and capture gates), `extension/src/background/` (install
  and service worker), `extension/src/content/` (content scripts).
- `/Users/Kdog/Code-Projects/llmnesia-site njs`:
  `app/components/vault-purchase.js` (Supabase billing client, no analytics),
  `lib/analytics.js` and `app/components/site-behavior.js` (the central
  delegated tracking pattern to follow).
- `/Users/Kdog/Code-Projects/llmnesia-insights`:
  `outreach/research-2026-09-23-next-100/build-gmail-drafts.mjs` and
  `build-email-ready.mjs` contain the no-op `urlFor`; the lead CSVs carry a
  `suggested_utm_source_slug` per lead.

Preserve all uncommitted and untracked work in every repo; never stage
another session's changes.

## Task 1: install acquisition marker (extension plus website)

Design constraint: Chrome Web Store strips referrers, so the store cannot
hand over a source. Implement the first-party handoff instead:

- The website already receives utm parameters and referrers. Persist a
  compact, first-party acquisition context (source, medium or path, and
  timestamp, no identifiers, no PII) in localStorage on llmnesia.com.
- An extension content script scoped to llmnesia.com reads that value into
  `chrome.storage.local` at or before first run, and the
  `extension_installed` event carries it as an `acquisition_source`
  property (values like "organic", "direct", "ai_assistant", "outreach",
  plus the raw utm source when present). Absence of a stored context means
  "unknown", which is a valid value.
- Document the property, its privacy scope, and retention in the extension's
  privacy documentation, and add the event name to the analytics type union
  and any allowlists.
- MCP counts as an outcome event today (`mcp_corpus_connected`). Leave it as
  an outcome; the acquisition marker covers attribution.

## Task 2: Vault surface-viewed event (extension)

Find every surface that offers Vault to the user (popup section, settings,
post-setup moments) and add one event, `vault_surface_viewed`, with a
`surface` property, fired when the offer is actually rendered (not on every
popup open). It must be unsampled, in the conversions-preserved class. This
gives the funnel its missing top step: viewed, created, checkout opened.

## Task 3: website purchase events (site)

Following the existing central tracking conventions in `lib/analytics.js`,
fire two GA4 events from `vault-purchase.js`: checkout start (when the
billing flow opens) and purchase completion (on the verified entitled
return). No PII, no email values in event payloads. Add the events to
whatever conversion configuration the site documents, and extend the site's
static tests if they pin behavior.

## Task 4: fix the outreach link tagging (insights)

Replace the no-op `urlFor` in both draft builders so every generated link
carries per-lead utm parameters derived from `suggested_utm_source_slug`
(for example `?utm_source=outreach&utm_medium=email&utm_campaign=<batch>&utm_content=<slug>`).
Regenerate nothing and send nothing: this only affects future drafts. Add a
unit check that generated links contain the parameters.

## Boundaries

Local commits are authorized in all three repos. Do not push, deploy, or
submit a store update; the bundle rides the next approved release. Do not
install dependencies. No user identifiers, emails, or conversation content
in any new event property. Do not change existing event definitions; the
12 October and weekly reads depend on them.

## Verification and return

- Extension suite and typechecks pass; dogfood and prod unpacked rebuilds
  pass; a local run shows `extension_installed` carrying the marker after a
  website visit with utm parameters, and "unknown" without one.
- Site build and static checks pass; local browser run shows the two events
  firing with no PII and no production analytics sent from localhost.
- Insights builders produce tagged links in a dry run without sending mail.
- Report: the marker design as implemented, the surface list covered, the
  event names added, and release readiness for founder approval.
