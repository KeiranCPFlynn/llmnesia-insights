# Website purchase measurement, 22 October 2026

The remaining website instrumentation is prepared locally in the site repo on
`codex/vault-purchase-measurement`. It records `vault_checkout_started` after a
checkout URL is returned and `vault_purchase_completed` after a same-tab,
account-matched success return is confirmed entitled. The original plan and
allowlisted `payoff` source survive the Stripe round trip in session storage.
The events contain no account or checkout identifiers, email addresses or
payment data. Cancellation, repeated checks and reloads do not count another
completion. Blocked tracking does not block checkout.

This Insights change adds the two events to the existing `vault_funnel` query
as separate `website_checkout_started` and `website_purchase_completed` counts.
They are independent unique PostHog identities for the reporting week, not a
joined conversion cohort. Historical snapshots may omit the fields; delta
comparisons are withheld unless both snapshots contain them. Existing
extension funnel fields retain their definitions. The review prompt and pack
definitions explicitly reserve paid counts and revenue for the existing
Stripe `payments` evidence.

Verification: all 69 Insights tests, TypeScript and the production build pass.
The site has nine passing analytics tests, passing existing release/sign-in
and localization checks, and a passing production build/static export. An
isolated Chrome test used synthetic state and stubbed collectors: exactly one
start/completion pair per provider across navigation; no events on localhost.
No dependency was installed and no production event was manufactured.

The read-only Stripe check found one non-founder subscription created since
20 October and no `checkout_source=payoff` metadata on it. The existing
restricted key denied Checkout Session listing and account-name reads with
HTTP 403. No permissions were changed and no alternate credential was tried.
This check does not establish a real payoff-attributed purchase.

Publication is still gated by the owner's explicit approval under AGENTS.md.
Site `main` pushes deploy to the existing llmnesia.com Vercel project. After
approval, integrate and publish only the site change, verify the live assets,
and configure `vault_purchase_completed` as the GA4 completion key event in
property `533614466`. Checkout start remains an ordinary funnel event. No
billing, schema or permission change is needed. Source attribution is already
deployed in the checkout function and Stripe metadata.

Integrate this Insights change into local `main` for the next normal review;
do not deploy the SQLite dashboard or change its Vercel connection. The existing
review and database were not refreshed or modified by this task. A future real
payoff purchase can confirm payment attribution read-only through subscription
metadata; do not create a charge merely to close this item.
