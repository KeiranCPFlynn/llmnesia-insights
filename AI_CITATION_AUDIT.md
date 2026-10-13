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
