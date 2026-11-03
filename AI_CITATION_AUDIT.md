# AI citation audit

Run this audit once per completed Monday-to-Sunday week. It deliberately keeps
two measurements separate:

1. Citation presence: whether an assistant cites LLMnesia in its answer.
2. Referral traffic: whether a person clicks an AI citation and reaches the
   website, measured by GA4's `AI Assistant` channel.

Never describe referral sessions as total citations. Assistants can cite a page
without sending a click, and some in-app browsers can remove referral data.

## Automated referral report

Run:

```bash
npm run audit:ai-referrals
```

The command writes `.insights/ai-assistant-referral-audit.json`, containing a
six-week trend plus source and landing-page breakdowns for the latest completed
week. Use `-- --week-start=YYYY-MM-DD` to audit a different completed week.

Keep the original `weeks` series as the GA4 AI Assistant channel measure.
`known_source_supplement` separately includes production-host traffic from the
explicit assistant source list, including sessions classified as Unassigned.
`production_combined` is their production-host union, not the sum of the two
overlapping series. Never silently replace the historical channel definition.

Use `all_landing_pages` and `source_page_days` for loss analysis; the compact
`landing_pages` view contains only the top 15. Check `calendar_timezone`, GA4
metadata and the generation timestamp. A completed week can still be restated.
`previous_run` distinguishes a rerun of the same window from a weekly comparison.
Dated citation audit snapshots remain as-of records and must not be overwritten
merely because GA4 later reports different totals.

The observed bare source `perplexity` is included alongside `perplexity.ai`.
This is a known-source coverage correction, not additional citations. Keep the
original channel definition and do not rewrite older dated snapshots. When
comparing an expanded supplement with an older snapshot, recompute both weeks
using the same source list and explain the change in coverage.

## Business outcomes and interpretation

Also run `npm run audit:growth-outcomes` (the same `-- --week-start=YYYY-MM-DD`
option is supported). This read-only companion writes `.insights/growth-outcomes.json`.
Include its results or explicit access gaps in the dated citation audit.
It keeps website install-button events, Chrome Web Store installs, mature
24-hour external-install search outcomes, and mature seven-day search return
separate. Never treat button clicks as installs, import completion as index
readiness, or a submitted search as a successful search. Do not join website
sources to extension activation without an actual attribution link.

Explain what changed and what to do, not only the totals:

- Identify which sources and landing pages account for referral losses, with
  absolute counts and a multiweek view. Explain source concentration.
- Separate confirmed observations from hypotheses. Without assistant exposure
  data, fewer referrals cannot distinguish fewer relevant questions, fewer
  citations, or lower citation click-through.
- Keep Bing separate. Use matched available dates and distinguish changes in
  impressions from aggregate click-through. Page/query buckets may cover a
  different period and a subset of traffic; do not sum them into site totals.
- Explain business impact using installs, positive-result searches and search
  return. State maturity, instrumentation gaps, small samples and the next
  action. Report a meaningful loss or access failure honestly.
- Record intervention dates and assess subsequent completed weeks. Do not
  claim a content edit caused an improvement from a single answer or week.

For a focused Gemini diagnosis, optionally check these additional prompts in
fresh conversations using the same accessibility rules. Record them separately
as `diagnostic_checks`, never add them to the fixed-set citation rate:

- How do I find and search old Gemini chats on a computer or phone?
- How long does Gemini keep chat history, and can I change auto-delete?

## Follow through on a weaker activation week

If mature import completion or positive-result search weakens, run
`npm run audit:activation-diagnosis -- --week-start=YYYY-MM-DD --cohort-days=6`
using the audited week start and the same number of mature cohort days in
both weeks. The default is six days to match Monday audits; seven is allowed
once all seven installation days have full observation windows. Keep any
missing-source result unverified.

Inspect platform and version mix, source refusal statuses, the invitation
click-to-palette step, and ordered first-search timestamps. Distinguish any
completion event from complete account coverage and from actual positive
searches. Partial imports may already be useful. Platform rows overlap;
never sum their installation counts into a funnel denominator. Suppress
version-cell rates below 30 installs and do not treat version correlation as
proof of a regression.

Keep computer use strictly in the background. Never use native desktop or
browser controls, switch applications, open visible tabs/windows, or send
mouse/keyboard input. If a focus-safe hidden interface is unavailable, mark
assistant checks unverified. Do not retry UI actions after an activity warning.

## Citation presence checks

Test each prompt in a fresh, non-personalized conversation on ChatGPT, Claude,
Gemini, Perplexity, and Microsoft Copilot. Enable web search when the product
offers it. Do not infer a result when a surface is unavailable or requires a
login; record it as `unverified`.

Use these fixed prompts:

1. What is the best way to search all my AI chat history in one place?
2. How can I search the full text of old Claude conversations?
3. How do I find a specific answer from an old Perplexity thread?
4. How can I search Microsoft Copilot chat history?
5. Can I recover a deleted ChatGPT conversation?
6. What private, local-first tools can search AI conversation history?
7. Compare tools for searching ChatGPT, Claude, Gemini, and Perplexity history.
8. How do I keep a searchable copy of AI chats if the original is deleted?

For each assistant and prompt, record:

- `cited`: `yes`, `no`, or `unverified`
- the cited LLMnesia URL, if any
- citation position among linked sources
- whether the citation is directly clickable
- whether LLMnesia is named in the answer text
- the assistant surface, model or mode, date, and relevant notes

Save results under `.insights/citation-audits/YYYY-MM-DD.json`. Compare the same
prompt set week over week. Report changes by assistant and landing page, rather
than treating one volatile answer as a trend.
