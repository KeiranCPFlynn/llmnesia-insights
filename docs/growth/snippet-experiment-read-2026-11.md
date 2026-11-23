# Search snippet experiment read, November 2026

Read on 2026-11-23 for the experiment defined in the site repo's
`docs/experiment-snippet-ctr-2026-10.md` (change commit `ae10fbc`).

## Deploy date

`ae10fbc` went live on **2026-10-20 at about 14:29 UTC** (21:29 local). Evidence:
GitHub's Vercel commit status for `ae10fbc` changed from pending (14:28:22 UTC) to
success (14:29:18 UTC), and the site's `main` branch auto-deploys production on push
(site `AGENTS.md`). Vercel's own deployment list could not confirm this: it only keeps
production deployments from 9 November onward, and the connector was refused (403).

## Windows

- **Baseline:** 21 September to 18 October 2026 (28 days).
- **After:** 21 October to 17 November 2026 (28 days, full days after the deploy;
  20 October is dropped because it was part-way live).
- Search Console, `dataState: 'final'`, request with `page` and `date` dimensions and
  no `query` dimension, property `sc-domain:llmnesia.com`. Final data runs to 21 November.
  Apex and www URLs are summed. Position is impression-weighted.

**Baseline figures differ from the experiment doc.** The doc's baseline came from
`gsc_rows`, which is query-level and undercounts (for example 40,413 impressions for
recover-deleted-chatgpt versus 109,943 here). Both baseline and after-window figures
below are page-level, so the comparison is like for like. The click rates are close
to the doc's (0.29% versus 0.3%).

## Results

| Pair | Page | Role | Baseline CTR | After CTR | Change | Position (base → after) |
|---|---|---|---:|---:|---:|---|
| A | recover-deleted-chatgpt-conversation | Changed | 0.293% (322 / 109,943) | 0.263% (291 / 110,683) | −10% | 4.4 → 4.5 |
| A | recover-deleted-claude-conversation | Control | 0.363% (199 / 54,891) | 0.347% (206 / 59,421) | −4% | 4.2 → 4.3 |
| B | does-chatgpt-keep-deleted-conversations | Changed | 0.409% (224 / 54,786) | 0.487% (262 / 53,780) | +19% | 6.5 → 6.3 |
| B | chatgpt-conversation-disappeared | Control | 0.439% (256 / 58,263) | 0.502% (261 / 51,970) | +14% | 5.3 → 5.0 |
| C | how-to-find-old-character-ai-conversations | Changed | 0.852% (443 / 51,982) | 0.891% (402 / 45,136) | +5% | 5.4 → 6.2 |
| C | google-ai-mode-history | Control | 0.469% (1,032 / 220,213) | 0.398% (582 / 146,254) | −15% | 5.8 → 6.0 |
| – | how-to-find-an-old-claude-code-conversation | Unpaired control | 0.175% (52 / 29,796) | 0.216% (72 / 33,355) | +23% | 7.1 → 6.4 |

## Read against the success rule

Success needs a changed page's CTR to rise at least 25% relative to its paired
control's change, on at least two of three pairs.

| Pair | Changed page vs its control | Position drift (changed / control) | Passes 25%? |
|---|---:|---|---|
| A | **−6%** | +0.0 / +0.1, clean | No |
| B | **+4%** | −0.2 / −0.3, clean | No |
| C | **+23%** | +0.8 / +0.1, under 1 but worse | No (below 25%, and see below) |

- **Pooled A and B** (C excluded, as the definition says): changed pages went from
  0.332% to 0.336% (+1%); controls from 0.402% to 0.419% (+4%). That is about −3%
  against controls, so no lift.
- **Pair C, judged alone:** +23% looks close, but it comes from the control
  collapsing, not from the changed page rising. `google-ai-mode-history` lost a third of
  its impressions (220,213 to 146,254) and 15% of its CTR, while the changed page's
  own CTR moved only +5%. About three quarters of the changed page's impressions
  are the navigational "old character ai" query, which a snippet cannot influence, and
  its position slipped 0.8. Treat C as noise, not a win.
- **Sample size:** pair A's change is about −10% on roughly 300 clicks per period
  (standard error about 8%), so none of these gaps is distinguishable from noise.
- **Weekly CTRs** move together for changed and control pages from the week of
  2 November (for example 0.29% to 0.22% on recover-deleted-chatgpt, 0.37% to 0.30%
  on recover-deleted-claude), so something site-wide or Google-side, not the snippet,
  explains most of the movement.
- **Reading a longer window** (21 October to 21 November, the latest final day)
  gives the same picture for all three pairs.

## Not covered

- Search Console does not show which snippet Google displayed. Google may rewrite
  titles and descriptions, so the new text may not have been shown for every query.
- The unpaired Claude Code page rose 23%, which is a reminder that unchanged pages
  swing by this much on their own.
- The rewritten recover-deleted-gemini-conversation page (excluded from the test)
  moved from 0.227% to 0.245%, which is no signal either.

## What it means

The new snippet style did not produce a measurable lift on any pair. It also did not
hurt: the only negative reading (pair A, −6% against control) is inside the noise.
Rolling the style out to the biggest pages on this evidence would be a guess, and
G2 (the four control pages) has nothing to build on yet.

DECISION: INCONCLUSIVE (pairs passed: none; A −6%, B +4%, C +23% from a collapsing control, so not counted)
