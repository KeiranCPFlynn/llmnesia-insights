# Platform mapping and by-platform search quality, 6 October 2026

Read-only PostHog analysis resolving the Strategy Ledger question first
asked 9 August 2026: after a shared platform-name mapping is applied to
search and result-open events, are click-rate and zero-result gaps
materially different by AI platform, or are apparent gaps primarily taxonomy
noise? Companion handoff: the published 28 September to 4 October review,
action item 3. Reproduce with `.insights/platform-mapping-2026-10-06.mjs`
(schema, values, tables steps). Run at 2026-10-06 against the completed week
28 September to 4 October (UTC), with the value inventory re-checked across
21 September to 4 October.

## The mapping

The raw events already share one canonical vocabulary. Verified on every
event in 21 September to 4 October:

- `search_submitted` records impressions as boolean flags `shown_<platform>`
  (17 keys: chatgpt, claude, gemini, grok, character_ai, google_ai_mode,
  perplexity, deepseek, claude_code, codex, qwen, mistral, kimi, zcode,
  copilot, zai, ai_studio).
- `result_opened` records `platform_source` with exactly the same 17 names
  plus `meta_ai`, which has no impression flag. Meta AI results can open
  (3 overlay opens in the week) without their surface ever being counted as
  shown. That is the only true label gap found.

The canonical mapping is therefore trivial: `shown_<p>` on searches and
`platform_source = <p>` on opens refer to the same platform name `<p>`, with
`meta_ai` recorded as opens-only (impressions unmeasured, 3 opens in the
week, 0.5 percent of opens).

## Where the historical "mismatched labels" came from

The events are consistent; the reports were not. The dashboard's click-side
platform shares include every `result_opened`, while the search side counts
only search-surface impressions. The week's 608 opens split by the `surface`
property into overlay (458, search overlay results), popup (93, popup search
panel), and popup_recents (57, recent-list opens that involve no submitted
search at all). Mixing the 150 popup-family opens into per-platform click
rates against search impressions is what produced the apparent platform
mismatches (for example claude_code showing clicks with almost no search
impressions). The published metric definition already says popup_recents is
separate; the popup surface must be excluded from search click rates too.

## By-platform tables, completed week 28 September to 4 October

Zero-result checks: 1,063 searches, 85 with `result_count = 0`, and exactly
85 `zero_results_submitted` events. The two definitions agree perfectly, so
the zero-result metric needs no platform dimension: a zero result means the
local index returned nothing, which is platform-agnostic.

Search-surface (overlay) click rate by platform, impressions from
`shown_<p>`, opens from overlay-only `result_opened`:

| Platform | Searches showing | Overlay opens | Click rate |
| --- | ---: | ---: | ---: |
| character_ai | 117 | 58 | 49.6% |
| kimi | 17 | 7 | 41.2% |
| perplexity | 93 | 31 | 33.3% |
| grok | 134 | 42 | 31.3% |
| qwen | 27 | 8 | 29.6% |
| zai | 14 | 4 | 28.6% |
| chatgpt | 441 | 102 | 23.1% |
| claude | 417 | 94 | 22.5% |
| deepseek | 49 | 11 | 22.4% |
| mistral | 25 | 5 | 20.0% |
| ai_studio | 5 | 1 | 20.0% |
| gemini | 356 | 71 | 19.9% |
| zcode | 16 | 3 | 18.8% |
| google_ai_mode | 111 | 12 | 10.8% |
| codex | 35 | 3 | 8.6% |
| copilot | 15 | 1 | 6.7% |
| claude_code | 43 | 2 | 4.7% |

Cells under roughly 30 impressions (kimi, qwen, zai, mistral, zcode, copilot,
ai_studio) are directional only.

## Verdict on the ledger question

Both halves of the question now have answers:

1. **Taxonomy noise:** real but located. The labels themselves were never
   the problem; mixing popup and popup_recents opens into search click rates
   was. With surfaces separated, the mapping is a clean 1:1 plus the small
   meta_ai impression gap. Applying this split changes the headline click
   rate for the week from 51.8 percent (all opens) to 43.1 percent
   (search-surface opens over searches).
2. **Material by-platform gaps:** yes, the spread is far wider than noise.
   Character AI results convert impressions to opens at roughly double the
   ChatGPT and Claude rate (49.6 versus about 23 percent, both on
   100-plus-impression cells). Google AI Mode is the notable underperformer
   on a meaningful cell: 111 searches showed its results and only 10.8
   percent of those searches opened one, despite the platform being the
   site's top content draw. The coding-assistant surfaces (claude_code,
   codex, copilot) sit at the bottom but on small cells.

## Recommendations recorded for the next review

1. Resolve the ledger question as answered: apply the canonical mapping
   (1:1 names), exclude popup and popup_recents surfaces from search click
   rates, and report meta_ai as opens-only until impressions are added.
2. Watch Google AI Mode's low click rate on the next completed weeks. If it
   persists, the result formatting or ranking for that platform is the fix
   target, and it aligns with the site's strongest organic draw.
3. Treat the character_ai high-water mark as the quality benchmark when
   judging other platforms' rates.
4. Optionally add `shown_meta_ai` impression capture to close the one label
   gap; three opens a week makes this low priority.

## Limitations

- One completed week; per-platform cells are small outside the top five
  platforms, and rates under 30 impressions are directional.
- Opens measure interest in shown results, not satisfaction after opening.
- The observational split cannot rule out user-mix differences (the same
  user tends to search on the platforms they use), but that does not affect
  the mapping resolution.
