# Growth plan, 23 November 2026

Source: the 16–22 November Insights review, the August strategy-ledger
baseline, and Google Search Console / GA4 reads taken on 23 November. Each task
below is self-contained so it can be handed to a cheaper model. Run tasks only
when the founder hands them to you.

## Where we are

| Stage | Week of 16 Nov | Read |
|---|---|---|
| Google impressions | ~274,000 | People see us |
| Google click rate | ~0.44%, average position ~6 | Very few click |
| Website visits | 2,898 | |
| Install-button clicks | 157 (5% of visits) | Homepage ~40%, guides ~6–8% |
| Installs (all browsers) | 270 | |
| Used it within 24 hours | 52 (19%; 36% in August) | **Biggest leak** |
| Weekly active users | 474 (234 in August) | Growing |
| Came back next week | 38% (30% in August) | Good |
| Paid Vault subscribers | 20, +2 in the week, 3 of 3 renewals paid | Small, stable |
| Paying users active in 14 days | 12 of 20 | 6 stopped, 2 never started |

Correction to the 23 November chat report: guides already show an install box
after the intro (`InlineInstallCta`, placed by `renderMdxWithCta` in the site's
`lib/content.js`, with per-page `ctaHeadline` and `ctaButtonLabel` in each
article's frontmatter). The job is better copy, not a new box.

## Rules for every task

- Repositories: insights `/Users/Kdog/Code-Projects/llmnesia-insights`, site
  `/Users/Kdog/Code-Projects/llmnesia-site njs`, extension
  `/Users/Kdog/Code-Projects/LLMnesia`. Read the repository's `CLAUDE.md` /
  `AGENTS.md` first.
- Never push, deploy, publish, submit a store release, or email anyone. Local
  commits only. Stage only files your task created or changed: other sessions
  have uncommitted work in these checkouts, so never reset, stash or commit it.
- Reads of PostHog, GA4, Search Console, Stripe and Supabase are allowed.
  Supabase is read-only (`SELECT` only) and results must be aggregate counts.
  No customer names or emails in any file.
- This Mac is shared. Run one data or test job at a time, prefix heavy
  commands with `nice -n 15`, and stop any server you start.
- Credentials are in the insights repository's `.env`. Run insights scripts
  from `/Users/Kdog/Code-Projects/llmnesia-insights` so they use the real
  database (`data/insights.db`). Never print secret values.
- Google data: the newest 1–2 days are incomplete. Use `dataState: 'final'` or
  stop the day before Search Console's `firstIncompleteDate`
  (`getDailySiteTotals` in `src/gsc.ts`). Page totals must come from a request
  without the `query` dimension; `gsc_rows` is query-level and undercounts.
- Finish each task with a short report at the stated path: what you found,
  numbers with their date ranges, what you changed, and what the founder must
  decide. Then stop.

## Phase 1: start now

### S1. Read the search snippet experiment (Sonnet)

- **Why:** three guide titles and descriptions were rewritten on 20 October to
  win more Google clicks. The four-week read was due around 18 November and
  decides whether to roll the new style out to the biggest pages.
- **Definition:** site repo `docs/experiment-snippet-ctr-2026-10.md` (pairs,
  baseline, read method, success rule). Change commit `ae10fbc`.
- **Steps:**
  1. Find the production deploy date of `ae10fbc` (Vercel deployments for the
     site project, read-only, or the earliest production deployment that
     contains it). If you cannot establish it, ask the founder and stop.
  2. Read Search Console per page, final data only, for the four weeks after
     deployment and the baseline (21 September to 18 October). Use the same
     URL merging as the baseline (apex and www).
  3. Apply the read method in the definition: changed CTR versus paired
     control CTR, position drift under about 1, pair C judged alone.
- **Output:** `docs/growth/snippet-experiment-read-2026-11.md` in the insights
  repo, ending with one line: `DECISION: ROLL OUT`, `DECISION: INCONCLUSIVE`
  or `DECISION: REVERT`, plus which pairs passed.
- **Do not** edit any site page.

### S2. Find where new installs stall (Sonnet)

- **Why:** only 19% of installs use LLMnesia within 24 hours, down from 36% in
  August, and the import and search fixes shipped in 0.4.24/0.4.25 did not
  move the weekly rate.
- **Steps:**
  1. Run `scripts/activation-diagnosis.mjs` in the insights repo (it already
     splits install cohorts by `install_version`) for the weeks starting
     2026-10-26, 2026-11-02, 2026-11-09 and 2026-11-16. Read its existing
     outputs and the November 3 notes in `docs/activation-recommendations-2026-11-03.md`
     first.
  2. For each version cohort (0.4.23, 0.4.24, 0.4.25, 0.4.26 once it has a
     full 24-hour-mature cohort), report the share of installs reaching each
     step within 24 hours: import started, import completed, first search,
     first search with results, first result opened. Split by the platform of
     the first import, Character.AI separately.
  3. Name the single step that loses the most installs and the evidence for
     why (error events, zero-result searches, no import attempted).
- **Output:** `docs/growth/activation-breakdown-2026-11.md` with the table,
  the biggest drop-off, and up to three specific product changes ranked by
  expected effect. No code changes.

### S3. Why paying users stop using Vault (Sonnet)

- **Why:** 8 of 20 paying subscribers have not used Vault in 14 days (6 stored
  data and stopped, 2 never started). They are the likeliest cancellations.
- **Steps:**
  1. Run the insights repo's `docs/vault-paid-activity.sql` read-only through
     the Supabase MCP (project "LLMnesia Vault") to confirm the counts.
  2. Extend it read-only, still aggregate counts only, to show for the 8
     inactive payers: last client version seen, whether any record ever
     synced, days since last activity, monthly versus annual, and whether
     they joined before or after 30 October.
  3. In PostHog, count `vault_sync_failed` installs in the last 30 days with
     no later `vault_sync_completed`, by extension version.
  4. Group the inactive payers into causes: sync failing, old version, never
     connected, simply stopped.
- **Output:** `docs/growth/vault-inactive-payers-2026-11.md` with counts per
  cause and one recommended fix per cause. Contacting customers is the
  founder's decision; do not draft or send messages.

### G1. Rewrite low-click guide titles and descriptions (GLM 5.3 Flash)

- **Why:** these guides get thousands of Google impressions a week but almost
  nobody clicks. Better titles and descriptions are the cheapest way to more
  visitors.
- **Repository:** site. Work on a new local branch `growth/snippets-wave1`.
- **Pages** (`content/blog/<slug>.mdx`; four weeks to 21 November, final data):

  | Slug | Impressions | Click rate | Position |
  |---|---:|---:|---:|
  | recover-deleted-gemini-conversation | 30,614 | 0.24% | 7.0 |
  | search-gemini-conversation-history | 27,253 | 0.18% | 7.1 |
  | google-ai-studio-conversation-history | 23,977 | 0.19% | 6.2 |
  | recover-deleted-grok-conversation | 22,030 | 0.20% | 6.9 |
  | why-cant-i-find-my-old-ai-conversations | 15,798 | 0.18% | 6.5 |
  | find-old-chatgpt-conversations | 13,803 | 0.22% | 6.1 |
  | why-ai-chatbots-dont-remember-conversations | 12,948 | 0.25% | 5.3 |
  | grok-conversation-history-limits | 12,917 | 0.19% | 6.1 |
  | gemini-conversation-history-limits | 12,377 | 0.19% | 5.6 |

- **Never touch** the experiment pages: recover-deleted-chatgpt-conversation,
  recover-deleted-claude-conversation, does-chatgpt-keep-deleted-conversations,
  chatgpt-conversation-disappeared, how-to-find-old-character-ai-conversations,
  google-ai-mode-history, how-to-find-an-old-claude-code-conversation.
  Skip any page in the table whose `title` or `description` changed after
  2026-10-25 (`git log -L` on those lines) and say so in the report.
- **Rules:**
  1. Edit only the `title` and `description` frontmatter fields. Do not change
     body text, CTAs, URLs or `updatedDate`.
  2. The layout appends ` | LLMnesia`, so keep the title to about 48
     characters (about 60 with the suffix). Keep the description to 155
     characters.
  3. Lead with the direct answer to what the searcher asked (for example "Grok
     has no trash folder, so deleted chats are gone. Here is what you can
     still check."), then the benefit of reading on.
  4. Every claim must already be in the article body. Never imply LLMnesia can
     recover chats it never saved.
  5. Follow the examples in the site's `docs/experiment-snippet-ctr-2026-10.md`
     ("Snippets" section).
- **Check:** run the site's existing tests or build command if one exists
  (`npm test` or `npm run build`, with `nice -n 15`), and fix anything you
  broke.
- **Output:** one local commit on the branch, and
  `docs/snippet-wave1-2026-11.md` in the site repo listing each page's old and
  new title and description with character counts. The founder deploys; the
  measurement clock starts on the deploy date.

## Phase 1 results (23 November)

- **S1:** `DECISION: INCONCLUSIVE`. No pair lifted. **G2 is cancelled**; do not
  roll the snippet style out to the control pages.
- **S2:** the biggest leak is installs that never start an import (48%; 3% of
  them ever search). Edge installs jumped to 110 and 76 a week from about 23,
  and 84% of them never start an import. Completers who don't search are the
  second leak (34% search). S4 should build S2's recommendation 1, a prompt to
  start an import on the first visit to a supported chat site, after checking
  where the Edge installs come from.
- **S3:** sync failures are not the main cause. 2 payers never set Vault up,
  3 stopped long ago, 3 went quiet on 0.4.21. 5 monthly payers renew within
  30 days. S7 should build the "Finish setting up Vault" step and a "Vault
  hasn't synced since…" message, and check the sync retry loop (969 failure
  events from 5 installs on 0.4.25 in three days).
- **G1:** 7 pages rewritten (2 skipped as recently changed). Deploy from the
  site branch `growth/snippets-wave1-clean`, never `growth/snippets-wave1`: the
  latter was cut from a stale local `main` and carries four held Pro-pricing
  commits.
- **Correction:** 0.4.26 is live (663 installs on 22 November). The S2 and S3
  reports say otherwise; their correction notes explain.

## Phase 2 briefs (approved by the founder on 23 November)

Both tasks are in the extension repository. Rules for both:

- Fetch, then create your own git worktree and branch from
  `refs/remotes/origin/main` (GitHub's main). Do not use local `main` (it has
  someone's unpushed work) or the local branch confusingly named `origin/main`.
  Never switch branches in `/Users/Kdog/Code-Projects/LLMnesia` itself.
- Read the repository's `CLAUDE.md`, `AGENTS.md` and `CONTEXT.md` first and
  follow their test and build instructions.
- No version bump, no store package, no release, no push. Add a user-facing
  line under `CHANGELOG.md` > `[Unreleased]`.
- Telemetry: fixed labels only. Never send chat titles, content, queries,
  emails or account identifiers.
- No Supabase or server writes; reads only, aggregate counts only.
- Run tests with `nice -n 15` and one worker where the runner allows it.
- Finish with a report at `docs/growth/<task>-2026-11.md` in your branch:
  what you found, what you changed, test results, what is not verified, and
  what the founder must decide.

### S4. Prompt installs to start their first import (Sonnet)

1. **Read-only first: where did the Edge installs come from?** Since 9
   November, Edge installs rose from about 23 to 110 and 76 a week, and 84%
   never start an import. Check PostHog `extension_installed` on Edge by week
   for any source, referrer, locale or store property; any Edge store listing
   change in `releases/` or `docs/` around 9 November; and whether the welcome
   page or pin detection behaves differently on Edge in code (Edge installs
   are always recorded as "not pinned"). Report what you can establish and
   what you cannot. If the welcome page is broken on Edge, fix that first.
2. **Build the prompt.** On a visit to a supported chat site whose importer
   exists, if this install has never started an import, show a small,
   dismissible in-page prompt such as "Save your <platform> chats so you can
   search them later", with one button that starts that platform's existing
   import flow. Show it at most once per platform and at most three times in
   total, never after any import has started, and respect existing capture and
   privacy settings. Record `import_prompt_shown`, `import_prompt_clicked` and
   `import_prompt_dismissed` with the platform label only.
3. Tests for the show/suppress rules, and a local unpacked build that loads.
   Do not change the welcome page beyond an Edge fix from step 1.
4. Out of scope for now: pre-filling the first search after an import (S2
   recommendation 2). Note it in your report as the next step.

### S7. Fix Vault setup gaps and the sync retry loop (Sonnet)

1. **Retry loop first (read-only, then fix).** In the three days to 23
   November, 5 installs on 0.4.25 logged 969 `vault_sync_failed` events and
   one 0.4.26 install logged many more. Find the failure reasons (PostHog
   `error_name` or similar), find the retry and telemetry code, and confirm
   whether retries back off and whether failure telemetry is de-duplicated.
   If not, add capped exponential backoff and send at most one failure event
   per reason per hour, with tests.
2. **"Finish setting up Vault".** For an entitled account whose first sync has
   never completed, show one persistent step in the popup or settings until it
   does, with a button that starts setup. Record `vault_setup_nudge_shown` and
   `vault_setup_nudge_clicked`.
3. **"Vault hasn't synced since <date>".** For an entitled account whose last
   successful sync is over 7 days old, show a one-time message with "Sync now".
   Record shown, clicked and dismissed.
4. Reproduce a first sync on 0.4.21-era code paths only if it is cheap with a
   test account; otherwise note it as not verified. Do not contact customers.

## Phase 2: after Phase 1 reports and founder decisions

| Task | Model | Starts when | What it does |
|---|---|---|---|
| G2. Roll out the winning snippet style | GLM 5.3 Flash | S1 says `DECISION: ROLL OUT` | Rewrite the four control pages in the winning style, same rules as G1, branch `growth/snippets-wave2`. |
| G3. Sharper install-box copy on top guides | GLM 5.3 Flash | S2 is done | Rewrite `ctaHeadline` and `ctaButtonLabel` for the five guides with the most visits and the lowest install-click rate (S2's appendix, or a GA4 `install_click` by `pagePath` read). Copy must match what the extension does today. |
| S4. First-five-minutes onboarding | Sonnet | S2 is done and the founder picks a fix | Build the chosen onboarding fix in the extension on a branch, with tests. No release. |
| S5. Show Vault to active free users | Sonnet | Founder approves the trigger and wording | Add a Vault prompt at a natural moment (for example after the 50th saved chat or on first Ask use), measured with a new event. No release. |
| S6. Email capture after first good search | Sonnet | Founder approves | Optional email capture after a first search that opens a result, with a privacy line. No release. |
| S7. Fix the causes in S3 | Sonnet | S3 is done | Fix the sync or setup problem S3 finds. No release. |

## What the founder decides

1. Deploy G1's snippet branch (and G2 later) to the site.
2. Which onboarding fix to build after S2.
3. Where and how Vault is offered to free users (S5).
4. Whether to add email capture (S6).
5. Whether to contact inactive payers after S3.
6. When to cut an extension store release containing S4–S7.

## Already done on 23 November

- 16–22 November Insights review published, with corrected Google figures.
- Weekly search totals now compare complete days only (insights `b8d0615`).
- Local dashboard opens without a password at `http://localhost:3000` (`npm run dev`).
