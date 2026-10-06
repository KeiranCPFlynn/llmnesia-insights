# GLM handoff: convert the top article's impressions into installs

## Goal and reasoning

The site earns roughly 342,000 Google impressions a week at a 0.48 percent
click rate, and its top article (/blog/google-ai-mode-history, 415 views in
the completed week of 28 September to 4 October) ranks for queries that
convert almost nothing. The 23 September conversion audit
(`docs/conversion-audit-2026-09-23.md` in the site repo) concluded: keep the
deployed landing and purchase work, measure first, and only then change copy
or CTAs. The Vault funnel measurement handoff
(`GROWTH_VAULT_FUNNEL_MEASUREMENT.md`) supplies the baseline. This handoff is
the change that measurement unlocks: one targeted, honest install CTA on the
single highest-traffic article, with per-page attribution, observed for one
completed week.

## Prerequisites (do not start until both are true)

1. `GROWTH_VAULT_FUNNEL_MEASUREMENT.md` has landed and one completed week of
   baseline exists (the founder will confirm).
2. Founder approval to modify the site article.

## Repositories and current state

- `/Users/Kdog/Code-Projects/llmnesia-site njs`: install clicks are tracked
  centrally by a delegated handler (`app/components/site-behavior.js` and
  `lib/analytics.js`); `app/components/inline-install-cta.js` (272 lines) and
  `app/components/install-link.js` are the existing CTA building blocks. The
  reusable article CTA pattern exists in the high-intent articles' earlier
  work; inspect rather than reinvent.
- `/Users/Kdog/Code-Projects/LLMnesia`: read the Google AI Mode release scope
  note that landed with commit `34a1c04a` (docs handoffs, 2026-10-04) and the
  CHANGELOG. Critical honesty check: the Google AI Mode history import fix is
  in the `[Unreleased]` section and 0.4.13 is a local candidate, not a store
  release. The article's CTA must not promise any capability that is not in
  the live store version. If the AI Mode import is unreleased at the time of
  writing, the CTA must lead with what is live (searching and recovering
  existing conversations across platforms), never the unreleased import.

## Task

1. Confirm which article is the top organic page in the latest evidence pack
   (expected /blog/google-ai-mode-history; verify, do not assume).
2. Verify per-page install_click attribution works today: one GA4 read
   splitting install_click by page path for the last completed week. If the
   delegated tracking cannot attribute by page, report that as a blocker
   finding instead of guessing.
3. Add one install CTA to that article, reusing the existing CTA component
   and central click tracking. Copy must state what the live store build can
   do for a reader of that specific article, in plain language, with no
   unreleased-feature claims and no em dashes.
4. Record the experiment definition in the site repo's docs: the page, the
   variant, the metric (per-page install_click rate), the observation window
   (one completed week minimum), and the success threshold for rolling it to
   other articles.
5. Do not touch any other page, the pricing page, or the purchase flow.

## Boundaries

Local commits are authorized. Deploying the site requires separate founder
approval; do not push or deploy. Preserve all uncommitted work in the repo,
including `docs/conversion-audit-2026-09-23*` and `ops/support-automation/`.

## Verification and return

- Site build passes (`next build`) and static-export checks pass.
- The new CTA renders on the article and fires the central install_click
  path (verify by code inspection and a local run; do not send real
  production analytics from a local test).
- Report: the article chosen, the exact copy, the attribution check result,
  the experiment definition, and the deployment request for founder approval.
