# Growth channel attribution read, 6 October 2026

Read-only analysis of which acquisition channel delivers installs that
activate and retain. Run at 2026-10-06 against existing data only. Aggregate
counts throughout; no identifiers, no credentials, no recipient lists.

Companion handoff: `docs/handoffs/GROWTH_CHANNEL_ATTRIBUTION_READ.md`.

## Method and source separation

Three independent sources, never merged into one funnel:

- **GA4, website property 533614466 (read-only Data API).** Sessions and
  `install_click` (the website's install CTA, which opens the store) by
  default channel group. Completed property-local weeks 21-27 September and
  28 September to 4 October 2026. Property dates are most likely ICT
  (Asia/Bangkok, UTC+7); PostHog below is UTC, a 7-hour skew that does not
  matter at weekly grain.
- **PostHog EU (read-only query API).** Completed installs
  (`extension_installed`, unique `anonymous_install_id`, internal builds
  excluded), activation within 24 hours (a `search_submitted` in the 24 hours
  after install), and week-one capture days (distinct UTC dates with a
  `conversation_captured` in days 0-6 after install). Monday-start UTC weeks.
- **Local outreach records** in `outreach/research-2026-09-23-next-100/`:
  send logs and quoted sent bodies.

GA4 `install_click` measures click intent on the website. PostHog
`extension_installed` measures a completed install. They are different events
in different systems and are reported separately.

The queries that produced every number below are local scripts (not
committed, same pattern as the 28 September validation note):
`.insights/growth-channel-attribution-2026-10-06.mjs`,
`.insights/ga4-channel-attribution-2026-10-06.mjs`,
`.insights/utm-verification-2026-10-06.mjs`.

## GA4: website traffic and install-click intent by channel

Sessions / users / new users, then `install_click` events / users.

| Channel | 21-27 Sep sessions | new users | install clicks | 28 Sep-4 Oct sessions | new users | install clicks |
| --- | --- | --- | --- | --- | --- | --- |
| Organic Search | 2349 | 1953 | 164 (138 u) | 2255 | 1850 | 161 (146 u) |
| Direct | 833 | 775 | 15 (13 u) | 1021 | 964 | 20 (17 u) |
| AI Assistant | 92 | 81 | 14 (8 u) | 72 | 57 | 15 (9 u) |
| Unassigned | 68 | 53 | 3 (3 u) | 39 | 29 | 1 (1 u) |
| Referral | 25 | 9 | 3 (3 u) | 19 | 11 | 4 (2 u) |
| Organic Shopping | 10 | 0 | 0 | 13 | 0 | 0 |
| Organic Social | 3 | 2 | 0 | 0 | 0 | 0 |
| Cross-network | 0 | 0 | 0 | 0 | 0 | 0 |

Click-per-session rates, both weeks: Organic Search about 7 percent, Direct
about 2 percent, AI Assistant 15 and 21 percent. AI Assistant volume is small
but intent-heavy.

AI Assistant composition: week 1 is gemini.google.com 33, gemini (ai-assistant
medium) 34, chatgpt.com 23, copilot.com 2. Week 2 is gemini.google.com 40,
gemini 10, chatgpt.com 14, claude.ai 5, perplexity.ai 3. Gemini dominates;
the source mix is broadening.

Top `install_click` pages: `/blog/google-ai-mode-history` 48 then 56 clicks,
`/` 41 then 53, `/mcp` 4 then 12.

Campaign parameters: no manual or utm campaign names exist in either week.
The only non-automatic campaign values are four internal Vault sessions
(`blog_vault_teaser`, `vault_paywall`, `vault_subscription_manage`).

Store detail page referrals into the website: chromewebstore.google.com sent
4 sessions in week 1 and 6 in week 2, negligible.

## PostHog EU: completed installs, activation, week-one capture

Install event schema, checked not assumed: every `extension_installed` event
in the last 45 days (1235 events) carries `source` with the constant value
`install`, `install_reason` with the constant `install`, and `$set_once`
containing only `$initial_browser`. There is no utm, referrer, campaign,
or MCP property anywhere on the event. PostHog cannot attribute installs
to a channel today.

Completed external installs by Monday-start UTC week: 165 (7-13 Sep),
161 (14-20 Sep), 218 (21-27 Sep), 238 (28 Sep-4 Oct).

| Cohort (Mon-Sun) | Installs | Activated 24h | Searched week 1 | Captured 1+ day week 1 | Captured 2+ days | Avg capture days |
| --- | --- | --- | --- | --- | --- | --- |
| 7-13 Sep | 165 | 67 (40.6%) | 71 (43.0%) | 121 (73.3%) | 64 (38.8%) | 2.18 |
| 14-20 Sep | 161 | 61 (37.9%) | 67 (41.6%) | 109 (67.7%) | 66 (41.0%) | 2.27 |
| 21-27 Sep | 218 | 64 (29.4%) | 73 (33.5%) | 143 (65.6%) | 75 (34.4%) | 1.88 |
| 28 Sep-4 Oct | 238 | 63 (26.5%) | immature | immature | immature | immature |

Week-one windows for the 28 September to 4 October cohort mature on 11
October; only its 24-hour activation is reported. The 24-hour activation rate
has fallen four cohort-weeks in a row (40.6 to 26.5 percent) while install
volume rose to its highest level; the capturing share of week one is drifting
down more gently (73 to 66 percent).

Website-side cross-check (PostHog `install_click`, website events, session
entry domain, last 14 days): www.google.com 266 of 373 (71 percent), direct
49 (13 percent), bing 22 (6 percent), gemini.google.com 15 (4 percent),
chatgpt.com 2, others single digits. This is the PostHog view of the same
clicks GA4 owns above, shown only as corroboration.

Residual observation: completed installs (218 and 238 per week) exceed
website install clicks (about 200 per week in both systems), so roughly 20 to
40 installs per week happen without a measured website click, consistent with
store discovery and word of mouth that neither tool can see.

## MCP finding

There is no measurable MCP-acquired cohort today, and the reason is
instrumentation, not methodology: the install event carries no MCP marker and
no acquisition source of any kind. No amount of further querying changes
that. The initiative "Measure MCP as a qualified-acquisition channel" needs a
marker decision.

What is measurable today is MCP engagement as an outcome, not acquisition:
`mcp_corpus_connected` carried install IDs for 72 distinct installs in the
last 45 days, at 8, 11, 16, 12 connected installs per week (weeks of 7, 14,
21, 28 September), with connect failures collapsing from 20 per week in early
September to 2. GA4 shows `/mcp` landing sessions of 6 and 7 per week and
`install_click` on `/mcp` of 4 then 12, too small to attribute installs
through, and there is no identifier shared between the website visit and the
install event to close that loop.

Marker decision required (a product/instrumentation change, out of scope
here): Chrome Web Store strips referrers, so the practical options are
stamping the install event with acquisition context the website can hand over
(first-party cookie or storage on llmnesia.com read by the extension at
install), and/or utm-tagged links everywhere LLMnesia controls a link. Until
one ships, MCP acquisition stays unmeasurable.

## Outreach tagged-link yield

The premise of tagged links does not hold. The 88 follow-ups (batches of 20,
20, 20 on 1 October and 28 on 6 October) and the 97 first-contact attempts
were sent with plain, untagged URLs. The lead CSV carries a
`suggested_utm_source_slug` per lead, but the draft builder's
`urlFor` function was a no-op (`const urlFor=(_x,base)=>base`), and the
quoted sent bodies show bare `https://www.llmnesia.com/` and
`https://www.llmnesia.com/mcp` links.

Verification, both systems: GA4 shows zero utm or manual campaign sessions in
either week, and PostHog shows zero events with any utm property (`$set`,
`$set_once`, or `$initial_utm_source`) since 20 September. The yield of the
88 links is therefore not small, it is structurally zero: no per-link visits
can exist in GA4 because no per-link tagging was ever sent.

Any outreach clicks that did happen are buried in Direct traffic, which rose
from 833 to 1021 sessions between the two weeks while the follow-up batches
went out; that movement is not attributable to outreach with the data that
exists.

Response reality from the 6 October inbox review: two human responders in 96
contacted prospects (one interested, one unsubscribe), about 2.1 percent, with
the positive rate about 1.0 percent. Expect small numbers from any future
outreach measurement as well.

## Ranked recommendation

1. **Next unit of effort: Organic Search and the blog playbook.** It is the
   only channel with both volume and install intent: about 2300 sessions per
   week converting at 7 percent to install clicks, 325 clicks across the two
   weeks, led by a single page (`/blog/google-ai-mode-history`, 48 then 56
   clicks) out of a long tail of recovery and comparison posts. More of the
   same content is the highest-confidence spend.
2. **Cheap secondary bet: AI Assistant visibility.** Gemini and friends send
   only 72 to 92 sessions per week but convert at 15 to 21 percent to install
   clicks, the best rate of any channel, and the source mix is broadening
   (claude.ai and perplexity.ai appeared in week 2). Formatting existing and
   new posts for AI citation costs little on top of item 1; do not make it a
   standalone workstream yet.
3. **Stop: the outreach mailout cadence.** Links were never tagged so the
   yield is unmeasurable, the response reality is 2 of 96, the copy promised
   a single follow-up and it is now spent. Keep only the warm replies
   already identified. If outreach is retried, first tag every link and
   reduce the ask, then measure before scaling.
4. **Direct: no effort.** It is mostly existing users returning (the site
   receives `extension | settings` self-referrals) plus opaque email-client
   noise; its click rate is 2 percent.
5. **The one instrumentation gap that blocks a complete ranking:** the
   install event carries no acquisition marker and store listings strip
   referrers, so install and activation rates per channel cannot be computed;
   the ranking above rests on GA4 click intent plus unattributed install and
   activation totals. The untagged outreach links are the same gap at the
   website layer and are trivially fixable in the send scripts. Deciding on
   and shipping the install marker (see MCP section) is the single change
   that would let the next read rank channels on activation instead of
   clicks.

## Limitations

- GA4 install clicks are intent on the website; PostHog installs are
  completions in the browser. They are reported side by side, never joined.
- Week-one figures for the 28 September to 4 October cohort are immature and
  excluded; the 24-hour activation rate for that cohort is final.
- The 24-hour activation decline is observational; version mix correlates
  with release date and is not adjusted here (version split in the 28
  September note).
- Outreach click-through cannot be separated from Direct traffic.
- Internal installs are excluded via the `is_internal` flag on any event in
  the window; the residual risk is unchanged from the 28 September note.
