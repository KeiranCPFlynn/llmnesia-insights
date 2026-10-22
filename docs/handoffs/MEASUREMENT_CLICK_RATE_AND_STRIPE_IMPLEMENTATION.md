# Search click rate and weekly Stripe payments implementation

## Integration update, 22 October 2026

The measurement branch is integrated into local `main`, together with the
Stripe dashboard's founder-test-account exclusions. Invoice access now works
against the existing live restricted key; the earlier 403 below is historical.
The completed-week evidence was refreshed and the review republished through
the validator. The original review's pricing, billing and hypothesis corrections
were retained through the publisher's safe replay.

The Data page and copied digest now use intentional submitted searches and
the corrected search-origin rate, with recents and unknown origins separate.
The report and Data page show historical paid coverage and renewals separately
from current subscription state. Search charts leave gaps for legacy rate
definitions and unavailable coverage instead of drawing a false comparison.

Verification: 69 tests pass, TypeScript and the production build pass, and an
authenticated local HTTP check confirms the refreshed report and payment
summary render. The original database and review draft were backed up locally
before evidence collection. No new dependency or cloud resource was required.

Chrome release and live checkout attribution are verified; the review now
tracks experiments awaiting results instead of recommending completed releases.
The only publishing decision is the old Vercel connection: the prepared
`git.deploymentEnabled: false` change allows a GitHub backup without deploying
this local SQLite application. It requires owner approval before pushing.

## Original implementation record

Implementation date: 20 October 2026 (Asia/Bangkok).
Branch: `codex/measurement-click-rate-payments`.
Base commit: `4615dfb` from the Insights repository's existing dashboard branch.
The primary checkout's uncommitted work was preserved. Nothing was pushed or published.

## Verification outcome and remaining access requirement

The code and fixture checks pass. Live historical payments verification is blocked:
the existing `STRIPE_READ_ONLY_KEY` returns HTTP 403 for `/v1/invoices`.
The pack builds successfully and explicitly reports `payments.status = unavailable`.
The separate existing Stripe dashboard collector remains available.

Enable read access to Invoices on the existing restricted key in Backbeat ltd,
or update the existing Insights `.env` with an appropriately restricted read-only
key. Keep the credential out of chat and version control. Rerun the scratch
verification after that change. No Stripe account permissions were changed by
this task. The attempted account-name lookup also returned 403; the account
identity comes from the supplied handoff rather than a successful account lookup.
The handoff's expected 16 paid subscriptions (10 monthly, 6 annual) and renewal
figures have **not** been verified and are not inserted as fallback data.

## Corrected search measurement

`clicks` now counts only `result_opened.from_search = true`.
`recent_opens` combines explicit non-search overlay opens and `popup_recents`.
Other opens lacking a usable origin go into `origin_unknown_opens`.
The primary rate divides clicks by searches from extension 0.4.18+ only, including
later minor and major versions. Missing denominator coverage produces `null`.
The versioned definition is `from_search_v1`. Comparisons against the previous
unclassified definition are withheld, with a visible explanation in the delta.
The legacy all-surface numerator and rate remain under their existing explicit names.

The live pack for 12 to 18 October reports:

| Measure | Value |
| --- | ---: |
| Searches, all versions | 1,064 |
| Searches, extension 0.4.18+ | 163 |
| Search-origin opens | 68 |
| Corrected search click rate | 41.72% |
| Overlay recents opens | 183 |
| Popup recents opens | 118 |
| Combined recents opens | 301 |
| Origin unknown opens | 1,955 |
| Legacy all-surface opens | 2,324 |
| Legacy all-surface rate | 218.42% |

The three open buckets reconcile: 68 + 301 + 1,955 = 2,324.
These are refreshed figures, not a republication of the prior review.

## Weekly payments section

The new collector uses plain `fetch` with GET requests, a pinned Stripe API
version, a timeout, full cursor pagination, and invoice-line pagination.
Configured founder customer IDs are excluded before calculating any metric.
Only aggregated measurements and the exclusion configuration are retained,
not provider payloads or customer contact details.

The section reports paid recurring coverage at week end, monthly and annual
plans, discounted coverage, first positive paid invoices per subscription,
renewals due and settled by the cutoff, cancellation requests, currently
scheduled period-end cancellations, and GBP collected less successful refunds.
The evidence collector persists the section and its freshness independently.
Missing keys, access failures, malformed responses, mode mismatches and
incomplete pagination produce an unavailable section rather than zero totals.
Payment deltas require matching mode, timezone and customer exclusions;
revenue additionally requires matching tax basis.

Historical balance is reconstructed from paid recurring invoice coverage at
the cutoff, excluding subscriptions already ended. It does not relabel today's
subscription state as historical. Plan and discount describe the covering invoice.
Free trials are excluded; a zero-cost renewal can retain coverage for a
subscription that previously paid. This is a paid-coverage measure, not a full
replay of every historical Stripe status transition.

Cancellation requests use `canceled_at`, which can be cleared if a request is
resumed. Scheduled cancellations are separately timestamped current observations,
scoped to subscriptions created before the reporting cutoff. These limitations
are included in the pack. The collector does not claim a historical churn rate.

Revenue covers captured GBP charges created in the week, less successful GBP
refunds created in the week, including refunds of older payments. Tax is removed
when it can be identified consistently for every included transaction; otherwise
all revenue figures explicitly include tax. Partial refund tax is allocated
proportionally from the original invoice. Amounts are GBP major units, before
fees, disputes and payouts. Other currencies are not converted or added to GBP.

## Checks

- `npm test -- --test-concurrency=1`: 65 tests pass, with fixture responses only.
- `npx --no-install tsc --noEmit --incremental false`: passes.
- `git diff --check`: passes.
- Historical preparation completed with live read-only analytics and a consistent
  SQLite backup, never the real Insights database as the write target:

```sh
INSIGHTS_DB_PATH=/private/tmp/llmnesia-insights-measurement-20261020/verification-insights.db \
  npm run insights:prepare -- --week-start 2026-10-12 --refresh-evidence --dry-run
```

The generated pack is in the task checkout's `.insights/evidence-pack.json`.
The dry run left the original database and past reviews unchanged. Generated
packs, database copies and credentials are not committed. No dependencies were
installed and no cloud resources were created.

References for the pinned response fields:
[Stripe invoices](https://docs.stripe.com/api/invoices/object?api-version=2025-02-24.acacia)
and [Stripe subscriptions](https://docs.stripe.com/api/subscriptions/object).
