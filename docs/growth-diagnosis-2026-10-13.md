# Growth diagnosis and next action, 13 October 2026

## Decision

Prioritize the transition from imported history to a useful first search.
The previous invitation and source-link work has shipped. Do not repeat that
handoff or treat another popup exposure as successful activation.

In parallel, correct the three Gemini guides identified below, with a factual
review of the recovery guide. Do not start a broad SEO rewrite, mass redirects,
new outreach, or a new paid acquisition campaign on this evidence.

This is a read-only diagnosis and a prepared implementation brief. No product
code, site content, live settings, or deployment was changed by this check.

## Activation evidence

Live read-only PostHog queries, project 132419 (the repository's configured
project), run 13 October. There is no governed activation definition in the
project catalog. These are ad-hoc reproductions of the existing install-keyed
24-hour definition, not new canonical metrics.

| External install cohort (UTC) | 28 Sep to 4 Oct | 5 to 11 Oct |
| --- | ---: | ---: |
| Installs | 232 | 260 |
| Import completed in 24h | 90 (38.8%) | 106 (40.8%) |
| Import completion or capture proxy | 150 (64.7%) | 181 (69.6%) |
| Submitted a search in 24h | 60 (25.9%) | 59 (22.7%) |
| At least one search returned results | 46 (19.8%) | 47 (18.1%) |
| Searchers with only zero-result submissions | 14 | 12 |
| Opened a result in 24h, including recents | 59 (25.4%) | 74 (28.5%) |
| Searched and opened a result, overlap only | 37 | 40 |
| First-search invitation shown | 44 | 89 |
| Invitation CTA clicked | 17 | 44 |
| Import completed, never searched in 24h | 49 | 61 |
| Invitation CTA clicked, never searched in 24h | 10 | 26 |

The invitation is now exposed and clicked. More installs and more invitation
clicks have not produced more first-day searchers in these cohorts. This is
observational, with changing versions and audiences, not proof of a regression
or a causal estimate of the invitation's effect.

Of the 61 latest installs that imported but never searched, 52 saw the
invitation and nine did not. More invitation exposure alone is unlikely to be
the main remaining lever. The current CTA removes the invitation and opens
the search palette; it does not execute a query. That distinction is correct
and must remain intact.

Twelve of 59 searchers only recorded zero-result searches. Six installs
recorded zero-result events with the new coarse metadata showing an empty
index. These sets can overlap with other diagnostics. This does not prove
they received an incorrect readiness invitation. Inspect the sequence before
claiming an indexing defect.

Method and limitations:

- Unit is `anonymous_install_id`, not PostHog person identity. First install
  event in the cohort starts an elapsed 24-hour window. All windows are mature.
- Exclude installs with `is_internal=true` on any event in that window. There
  were no duplicate install IDs within either cohort and no missing IDs among
  the 515 installation events checked. Analytics opt-outs are not represented.
- Cohort boundaries are explicit UTC timestamps. The PostHog project timezone
  is Asia/Bangkok, so unqualified date buckets must not be treated as UTC.
- Import completion or capture is only a content-availability proxy. It does
  not establish that every imported conversation was indexed and searchable.
- `result_opened` can be a recents click. Overlap with search does not prove
  that an opened conversation was a result of that search. There is no query
  linkage in this calculation.
- All 321 prior and 373 current submitted searches in these external cohorts
  had `result_count`; positive and zero-only classifications are not based on
  silently treating missing counts as zero.
- New zero-result diagnostics are incomplete historically: all 51 prior
  zero-result events lack cause/index metadata; 23 latest events also lack it.
  Do not infer a changing cause distribution from unequal instrumentation.

## Release verification

- The invitation retry commit `cf6ca8a` is contained in the locally known
  `origin/main` history. Live telemetry includes invitation exposures and CTA
  clicks in new installation cohorts.
- The public Chrome Web Store lists 0.4.17, updated 12 October. The public
  changelog lists source-link discovery in 0.4.10 (2 October), and releases
  through 0.4.16. The changelog being one release behind is separate from
  activation, not evidence that the older fix is unreleased.
- The running LLMnesia MCP now returns a browser-neutral `sourceUrl` without
  `extensionId`. Its formerly pending service switch is no longer pending.
- This check did not rerun a synthetic browser activation flow or establish
  universal runtime correctness for every installation.

Sources:

- [Chrome Web Store](https://chromewebstore.google.com/detail/llmnesia-search-all-your/leekfgbdojiaabifbjbbgiiclannjdkf)
- [Public changelog](https://www.llmnesia.com/changelog)
- [Previous implementation chat](https://llmnesia.com/open#docId=zcode%3Asess_ec298367-ba30-4e58-9351-65c7a8e8ff76)

## Acquisition evidence

Fresh GA4 query, 28 September to 11 October, website property configured in
this repository. GA4 uses Asia/Bangkok dates. It returned 120 rows, without
sampling metadata or data-loss-from-other-row warnings. All matched traffic
was on `www.llmnesia.com`.

| Referral measure | 28 Sep to 4 Oct | 5 to 11 Oct |
| --- | ---: | ---: |
| GA4 AI Assistant channel | 72 | 56 |
| Gemini sources, including Unassigned | 67 | 33 |
| Gemini within AI Assistant | 50 | 32 |
| ChatGPT | 14 | 6 |
| Perplexity | 3 | 12 |
| Claude | 5 | 6 |
| Matched sources plus AI channel, including Unassigned | 89 | 57 |

The latest completed week is still restating: the 12 October audit recorded
53 AI-channel sessions; the fresh query records 56. Preserve the original
audit as an as-of snapshot rather than silently replacing it.

The narrow AI channel filter misses `gemini / (not set) / Unassigned`:
17 sessions previously and one currently. This reporting gap does NOT explain
away the decline; including it makes the measured fall larger. Keep the
official GA4 channel series and an explicit supplementary known-source series
separate. Do not reclassify historical traffic silently.

Largest Gemini landing losses, combining `gemini` and `gemini.google.com`
across the observed channel classifications:

| Landing page | Prior | Current |
| --- | ---: | ---: |
| `/blog/how-to-find-old-gemini-conversations` | 10 | 3 |
| `/blog/search-gemini-conversation-history` | 8 | 1 |
| `/blog/gemini-conversation-history-limits` | 7 | 1 |
| `/blog/recover-deleted-gemini-conversation` | 11 | 5 |

ChatGPT's homepage referrals held at five. Its eight-session net loss is
concentrated in `(not set)` (three), the product explainer (two), and several
one-session landings, partly offset by a new one-session landing. That is
too small and dispersed to diagnose a specific technical cause or justify a
sitewide rewrite.

Bounded live HTTP checks returned 200, self-referencing canonicals, and no
observed robots prohibition for the three primary Gemini guides, the product
explainer, and `/compare`. `robots.txt` allows crawling. `/open` intentionally
has `noindex, nofollow`. These checks rule out an obvious current fetch or
indexability failure on sampled pages, not intermittent failures, crawler-
specific filtering, search-index state, or historical outages.

These are referral clicks, not citation counts. The audit's single Gemini
sample and inaccessible assistant surfaces cannot establish why citations or
click-through changed. Bing remains a separate series; the audit's latest
matched-weekday result was improving, with weekend data incomplete.

## Concrete implementation brief

### 1. Improve the first useful search, not popup volume

Goal: increase the fraction of new external installs that deliberately submit
a search returning a useful indexed conversation, then open it.

First reproduce the invitation CTA in a supported fresh-install flow with
real imported synthetic data. Confirm the palette opens, input receives focus,
the index is usable, and the user can submit and open the known conversation.
Investigate the 26 CTA-click/no-search pattern without assuming every such
user experienced a bug. Use anonymous aggregate sequences, not private query
text or customer conversation contents.

If the flow works, make the initial palette help the user choose a query from
their genuinely indexed history. Reuse existing local suggestions if suitable.
Any sample must be locally derived from saved/indexed data, labelled clearly,
optional, and user-triggered. Never promise that unseen or unimported history
is searchable. Do not auto-submit a query or count palette opening as search.
If there is no indexed content, show an honest import/capture next step.

Add bounded, privacy-safe instrumentation only where needed to distinguish
CTA click from palette successfully displayed, submitted search, positive
result count, and result opened after that search. No raw query, title, URL,
conversation ID, or transcript should leave the device. Preserve the existing
activation numerator and report new diagnostics separately.

Acceptance: real import writes the keyword index before a readiness promise;
CTA visibly opens focused usable search; deliberate known-term search returns
the synthetic chat and opens it; empty/partial imports have truthful states;
once-per-install invitation behavior is preserved. Verify event delivery in
an authorized bounded diagnostic setup. Do not claim uplift from tests.

### 2. Correct the Gemini acquisition pages

Goal: make declining pages accurate, useful to readers, and straightforward
for assistants to cite, with an honest path to a first usable search.

Start with the search, old-conversations, and history-limits guides. Review
the recovery guide for the same errors, without expanding into all content.

- Explain Google's currently documented native search steps. Google documents
  chat search but does not establish a title-only scope in the cited help
  page. Do not state unsupported title-only/no-search claims as fact.
- Remove universal assurances that every old chat still exists. Explain
  deletion, activity settings, temporary chats, and account differences using
  current primary sources.
- Reconcile the old-conversations guide's claim that pre-install history cannot
  be indexed with actual supported Gemini import behavior. Verify the importer
  before describing availability or completeness. Distinguish browsed capture,
  imported historical chats, keyword indexing, and asynchronous embeddings.
- Remove copy promising instant search of every chat ever created. Search
  covers saved/indexed conversations, not inaccessible or deleted history.
- Keep each page's specific intent and stable URL. Link to an accurate setup
  guide and related pages where useful. Do not mass-redirect or stuff keywords.
- Fact-check Takeout completeness rather than promising a full transcript of
  every chat without evidence. Show the product's actual limitations too.

These defects justify correction on accuracy and conversion grounds. They are
not proven causes of the weekly referral loss or guaranteed citation recovery.

Primary references:

- [Google: find and manage chats](https://support.google.com/gemini/answer/13666746?co=GENIE.Platform%3DDesktop&hl=en)
- [Google: Gemini privacy and activity retention](https://support.google.com/gemini/answer/13594961?hl=en)

The custom per-install joins follow PostHog's supported
[HogQL query model](https://posthog.com/docs/product-analytics/hogql).
Use [the project's SQL editor](https://eu.posthog.com/project/132419/sql) to
reproduce the saved query; this link is not a saved insight or dashboard.

### 3. Make the weekly diagnosis reproducible

Preserve `audit:ai-referrals`' existing GA4-channel definition. Add a separately
labelled known-assistant-source supplement, and retain full source-by-page
and date breakdowns in the evidence so top-15 truncation does not hide losses.
Include timezone, as-of date, sampling/freshness metadata, and explicit
provisional/restated comparisons. Do not replace assistant citations with
search rankings or referral totals.

## Boundaries and evaluation

Implementation is a prepared next step, not already delivered. Keep local
changes focused, verify and commit them, and request specific release approval
before pushing, deploying, or submitting an extension build. No new resources,
dependencies, paid experiments, outreach, or recurring work are needed here.

Compare mature external-install cohorts using the unchanged 24-hour search
definition, positive-result searches, and appropriately qualified result opens.
Track import availability and zero-only searchers as guardrails. Interpret
release comparisons as observational unless a valid controlled design is
separately approved. Citation and traffic recovery remain separate outcomes.

Local raw aggregate GA4/access evidence and diagnostic scripts are under
`.insights/growth-diagnosis-2026-10-13.*` and
`.insights/growth-access-2026-10-13.*` (ignored, not published). The PostHog
query used for the headline table is saved alongside them for reproduction.
