# GLM handoff: close the two measured leaks in the first-search invitation

## Goal and reasoning

The first-search invitation shipped in 0.4.10 (2 October, commit `cf6ca8a`)
and its first mature-window read
(`docs/activation-verdict-early-read-2026-10-06.md` in the insights repo)
found the mechanism works but leaks at both of its stages, on small but real
cells:

- **L1, reach:** of 47 post-release installs with searchable content within
  24 hours, only 21 (44.7 percent) saw `search_ready_popup_shown`.
- **L2, follow-through:** of the 21 shown, 11 clicked the CTA, and only 4 of
  those 11 submitted a search within 24 hours. 6 dismissed it.

Both stages lose roughly half their cell. This handoff fixes the mechanism so
the 12 October definitive read and every week after it measures a repaired
funnel. It also diagnoses a new concern the same read surfaced: import
completion fell from 48.6 to 36.8 percent and the drop appears in both fix
and pre-fix version groups, so it is not explained by the invitation.

## Repositories and current state

- `/Users/Kdog/Code-Projects/LLMnesia`: invitation code is
  `extension/src/content/search_invite_claim.ts` (claim seam),
  `extension/src/content/bootstrap.ts` (arming, visibility and focus
  retries), `extension/src/shared/search_invite.ts`, and the import
  finalizer readiness path. The popup stage events are
  `search_ready_popup_shown`, `search_ready_popup_cta_clicked`,
  `search_ready_popup_dismissed`. Read
  `docs/handoffs/GLM_ACTIVATION_LINK_COMPLETION.md` for the original
  constraints (once-per-install claim, no repeats after dismissal, CTA use,
  or an existing search; truthful partial copy).
- `/Users/Kdog/Code-Projects/llmnesia-insights`: the early-read note and
  `docs/activation-funnel-validation-2026-09-28.md` hold every number cited
  here. Read both before coding.

Preserve all uncommitted and untracked work in every repo; there may be
overlapping sessions. Never stage another session's changes.

## Task 1: diagnose and repair reach (L1)

From code, enumerate every path that ends 24 hours with searchable content
but no shown popup. Candidate paths to check, in order of likelihood:

1. Content arriving through first capture rather than import completion:
   verify the arming path covers the first-capture finalizer exactly as it
   covers import completion.
2. Arming after the tab was closed or never visible again: verify the
   visibility and focus retries cover the profile's next opened LLM surface,
   not only the original tab.
3. Claim races between tabs and transient pre-claim failures permanently
   muting a profile.
4. Installs whose content completes while the browser is closing.

Fix what the code shows is broken. Do not widen the invitation beyond the
agreed triggers: still once per install, still suppressed after dismissal,
CTA use, or an existing search. Where a repair changes behavior, add
behavioral tests mirroring the existing claim-flow suite.

## Task 2: diagnose and repair follow-through (L2)

Trace the CTA click path end to end and identify why 7 of 11 clickers never
submitted a search: does the palette open with results already shown, an
empty state, a focus fight, or a state where typing is required but not
invited? Make the post-click state make the obvious next action obvious
(prefilled context or visible results where the data supports it), with the
smallest change that plausibly lifts click-to-search. Add tests for the
click-through state. Do not auto-submit searches: the CTA opens search, it
never submits a query.

## Task 3: diagnose the import-completion drop (do not change behavior yet)

Compare what `backfill_first_completed` measures in 0.4.11 and 0.4.12 against
0.4.9 (the 0.4.11 changelog touches import completion semantics). Determine
from code whether the drop is a measurement-semantics artifact (event fires
under stricter conditions) or a behavior regression. Report the conclusion;
only change code if it is a bug, not to move the metric.

## Boundaries

Local commits are authorized. Do not push, deploy, or submit any store
update; release needs separate founder approval. Do not install
dependencies. Do not change analytics event names or the sampling policy.
The popup must never repeat after claim, dismissal, CTA use, or an existing
search.

## Verification and return

- Extension suite, typechecks, and dogfood plus prod unpacked rebuilds pass.
- Report: root cause and fix for L1, root cause and fix for L2, the import
  completion verdict, and the release-readiness state. The 12 October
  insights read measures the result; do not claim uplift from local testing.
