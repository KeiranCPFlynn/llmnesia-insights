# GLM handoff: make the Vault funnel visible in Insights

## Goal and reasoning

The founder's priority is more app users and more subscribers. The extension
already emits the complete Vault funnel (see `extension/src/shared/analytics.ts`
in the LLMnesia repo: `vault_waitlist_joined`, `vault_created`,
`vault_checkout_opened`, `vault_phone_qr_shown`, `vault_unlocked`,
`vault_locked`, `vault_signed_out`, `vault_sync_completed`, `vault_sync_failed`,
`vault_initial_upload_completed`, `vault_restore_completed`), and the website
has a live purchase flow, but the Insights evidence pack contains zero Vault
metrics. Nobody can say what share of users sees the offer or where they drop.
This handoff makes the funnel measurable so the next leak-fix decision is
evidence-based. Measurement only: no product, pricing, or billing changes.

## Repositories and current state

- `/Users/Kdog/Code-Projects/llmnesia-insights`: primary repo. The data layer
  moved to local SQLite (commits `e365057`, `d304677`); collectors live in
  `src/posthog.ts` (collectMetrics) and `src/ga4.ts` (collectGA4Metrics), the
  pipeline in `src/evidence.ts`, deltas in `src/evidence-delta.ts`, types in
  `src/types.ts`, tests alongside (`posthog.test.ts`, `evidence-delta.test.ts`).
- `/Users/Kdog/Code-Projects/LLMnesia`: read-only reference for event names in
  `extension/src/shared/analytics.ts` and the sampling policy in
  `docs/POSTHOG_USAGE_REDUCTION.md` (Vault/conversion events are preserved and
  unsampled; only update captures and ingestion-lane diagnostics sample at 10
  percent).
- `/Users/Kdog/Code-Projects/llmnesia-site njs`: read-only inspection of
  `app/components/vault-purchase.js` and `lib/vault-billing-client.js` to
  determine whether any purchase-completion event is measured at all. The
  component uses the Supabase billing client directly; GA4 conversions today
  are install_click, email_signup, and contact_submit.

Preserve all uncommitted and untracked work in every repo, including the
untracked `app/outreach-review/` and `components/OutreachReview.tsx` here.
There may be overlapping sessions; never stage another session's changes.

## Task

1. Inspect the site purchase flow and record (in the final report, not as
   site code changes) whether checkout open and purchase completion produce
   any analytics event today. If they do not, stop at the report: adding site
   tracking is a separate founder-approved change.
2. In `llmnesia-insights`, extend the PostHog collection so each completed
   week's evidence includes a `vault_funnel` section with unique-user counts
   for, at minimum: `vault_created`, `vault_checkout_opened`,
   `vault_unlocked`, `vault_sync_completed`, `vault_restore_completed`, and
   `vault_waitlist_joined`. Keep definitions consistent with the existing
   metric style in `metric_definitions` and document each new metric there.
3. Wire the new section through `src/types.ts`, `src/evidence.ts`, and the
   delta computation so the pack reports current and prior values with
   direction, following the existing pattern.
4. Update `README.md` and/or `USING_INSIGHTS.md` where metrics are described.
5. Extend or add tests mirroring `posthog.test.ts` coverage. Do not install
   new dependencies.

## Boundaries

Local commits are authorized. Do not push, deploy, publish, or change any
live configuration. Do not modify the site repo's code. Do not edit review
or ledger state directly; the next weekly review consumes the new pack
section. Never present PostHog and GA4 figures as the same quantity.

## Verification and return

- `npm test` passes in `llmnesia-insights`.
- `npm run insights:prepare -- --completed-week` produces the pack with a
  populated `vault_funnel` section (real counts; empty is acceptable only if
  the events genuinely returned zero rows, and the report must say which).
- Report: event-to-count table for the last completed week, the site
  purchase-event finding, and any event names present in the extension code
  but absent from PostHog results.
