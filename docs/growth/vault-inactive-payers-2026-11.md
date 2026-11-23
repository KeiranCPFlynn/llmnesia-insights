# Why paying users stop using Vault, November 2026

Read on 2026-11-23. Read-only aggregate counts from the LLMnesia Vault Supabase
project (SELECT only, no per-person rows, no names or emails) and PostHog.
Nothing was drafted or sent to customers.

## Counts confirmed

`docs/vault-paid-activity.sql` returns: **20 paying, 12 active in the last 14 days,
6 stored data then stopped, 2 never started.** That matches the 23 November plan.
The 8 inactive payers are the group below.

## What the 8 inactive payers look like

| Measure | Result |
|---|---|
| Plan | 5 monthly, 3 annual (inferred from the two price IDs and subscription period lengths: one runs about 12 months, the other renews monthly; it matches the £8 and £88 plans) |
| Joined | All 8 before 30 October. The 5 who joined on or after 30 October are all active |
| Subscription state | All 8 `active`, none set to cancel at period end |
| Next renewal | Monthly: all 5 renew within 7–30 days. Annual: all 3 are 90+ days out |
| Any record ever synced | 6 yes, 2 no (the 2 never started) |
| Last client activity | 3 last seen 14–30 days ago; 5 have no client activity row at all |
| Last client version seen | 3 on 0.4.21 (all 3 last seen 14–30 days ago); 5 none recorded |
| Client failure category | None recorded for any of the 8 |
| Newest record age | 2 within 14–30 days, 4 older than 30 days, 2 no records |

For comparison, the 12 active payers run versions 0.4.17 to 0.4.26, including
current ones, so a current version registers and syncs normally.

## Causes

| Cause | Payers | Evidence |
|---|---:|---|
| **Never connected** | 2 | Monthly. No records and no client activity ever. They paid and never set Vault up |
| **Stopped long ago** | 3 | 2 annual, 1 monthly. Records exist, but the newest is over 30 days old and there is no client activity row at all |
| **Old version, stopped quietly** | 2 | 1 annual, 1 monthly. On 0.4.21, last seen 14–30 days ago, sync completed, nothing pending, no failure recorded |
| **Sync possibly stuck** | 1 | Monthly. On 0.4.21, last seen 14–30 days ago, has records, but never completed a sync and has no failure recorded |

The two "old version" cases and the "stuck" case are all on 0.4.21, a release
from the week of 26 October. Four versions have shipped since (0.4.23, 0.4.24,
0.4.25 and the unreleased 0.4.26 candidate).

## PostHog: failed syncs in the last 30 days

12 installs recorded `vault_sync_failed` and 12 recorded `vault_sync_completed`
(the sets overlap). By the install's latest failure:

| Version | Installs failing | Recovered (completed after failing) | No completion after failing | Last error |
|---|---:|---:|---:|---|
| 0.4.21 | 2 | 0 | **2** | server error; network error (failures 22 and 26 days ago) |
| 0.4.23 | 2 | 2 | 0 | network |
| 0.4.24 | 1 | 1 | 0 | network, connection failed |
| 0.4.25 | 6 | 5 | **1** | connection failed (2 installs), storage mode unavailable (2), server error (1), not entitled (1) |
| 0.4.26 | 1 | 0 | **1** | server or client error, 3,120 events today |

- **Most failures recover**: 8 of 12 installs later completed a sync.
- The 4 that did not: two on 0.4.21, one on 0.4.25 with `not_entitled` (28
  events, 2 days ago) and one on 0.4.26 with 3,120 failure events today. 0.4.26 is
  not in the store, so that install is almost certainly a pre-release build
  and not a customer.
- The two stuck 0.4.21 installs fit the profile of the "old version" and "sync
  possibly stuck" payers above, but PostHog install IDs are not linked to
  Vault accounts, so I could not confirm they are the same people. Treat that
  as plausible, not proven.

## What this says

- Sync failures are **not** the main cause. At most 1 or 2 of the 8 could be
  failing, and the evidence for that is indirect. The Vault server recorded no
  failure category for any inactive payer.
- Most of the 8 never really used Vault (2), or stopped long ago (3), and 3
  more went quiet on 0.4.21 within the last month.
- The risk is concentrated in **5 monthly payers who renew in the next 7–30
  days**. The 3 annual payers are 90+ days from renewal.

## Recommended fix per cause

| Cause | Recommended fix |
|---|---|
| Never connected (2) | Add a clear first-run path after checkout: the success page and the extension both show one "Finish setting up Vault" step until the first sync completes, and record a `vault_setup_nudge_shown` event. Check what the purchaser sees after paying |
| Stopped long ago (3) | Add a one-time in-extension "Vault hasn't synced since [date]" message that offers sync now, and record when it is dismissed. These people have data in Vault already, so the aim is making its value visible again |
| Old version, stopped quietly (2) | Keep updating users off 0.4.21: show Vault sync status in the extension popup (last sync time, pending changes) so a stalled sync is visible, and check why an updated client would stop registering a compatibility row. Active payers on 0.4.23 to 0.4.26 register fine, so there is no sign of a version bug; the reason these two stopped is not known |
| Sync possibly stuck (1) | Reproduce a first sync on 0.4.21 with a test account. If it fails, ship a fix in the next release and make sure a failed first sync produces a visible message and a recorded failure category (the server recorded none) |

These map to the plan's **S7 (fix the causes in S3)**: the fixes above are small
and mostly about visibility, not sync reliability.

## For the founder to decide

- **Whether to contact any of the 8.** This report does not draft or send anything,
  and has no customer identities.
- The 5 monthly payers who renew within 30 days are the likeliest cancellations,
  so any contact would be most useful before those renewals.

## Limits

- Counts are tiny (8 people), so each group is one to three payers.
- "Active" uses the existing definition: any `vault_legacy_rpc_daily` row in 14
  days or any client heartbeat in 14 days. Someone could be using Vault on a
  client that does not report, and be counted as inactive.
- Monthly versus annual comes from the subscription period length, not a Stripe
  price lookup.
