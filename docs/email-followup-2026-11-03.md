# Email investigation follow-up, 3 November 2026

Scope: check progress on items 3–9 from the email review and continue independent investigation. Vault sync and ChatGPT extraction remain owned by their separate chats. No site publication, infrastructure changes, customer-data changes, email sends, software installation or new recurring activity occurred in this follow-up.

## Updated disposition

| Original item | Current disposition | Next concrete action |
| --- | --- | --- |
| 3. Character.AI import failures | Substantial recovery and credential repairs already implemented locally; complete recovery is not established | Measure the next public release separately from existing 0.4.23 telemetry; retain the private recovery limitation |
| 4. Indexing and schema | Five priority URLs pass Google's indexed inspection; exact historical exclusions and Ahrefs flagged URLs remain unidentified | Review those exact report URLs before changing crawl rules or schema templates |
| 5. Email authentication | Current sending route has positive delivery evidence, including Yahoo | Close the earlier authentication incident as recovered for the observed route; investigate any new actual bounce |
| 6. Search growth and conversion | Fresh page evidence collected; existing interventions are under weekly observation | Preserve current titles, prioritise product activation, and distinguish mobile captures from delivered install emails |
| 7. Supabase grants | No current missing-grant outage found in public Vault metadata | Keep explicit per-role grants in new migration review; no live permission change justified |
| 8. Vercel storage | Earlier work addressed traffic; deployment-storage headroom remains unverified | Review the saved 33-deployment inventory and obtain current storage bytes before approving deletion |
| 9. MCP distribution | Directory approval confirmed by email; no attributed directory sessions in the queried period | Verify the rendered listing when its challenge is accessible, without creating another public repository |

## 3. Character.AI: existing work materially changes the interpretation

The chat titled **Fix Character.AI import failures** reports Test 6 saved **776 of 791 chats**, compared with around 380 in an earlier run. Its latest completed investigation added a read-only check after an HTTP 412 restore response, without repeating the unarchive request. It reports 91 tests, TypeScript, build and browser verification passing. The private test still had 15 unexplained failures, so this is not evidence of complete recovery.

The 412 handling is present in the current main source at `extension/src/content/backfill_runner.ts`. Today's **Run Insights review** also fixed Character.AI credential parsing: JSON-string credentials and whitespace-trimmed raw credentials now work. Its documented final combined source passed 303 focused tests and TypeScript checking, and both local unpacked builds were rebuilt and verified. See [activation recommendations](activation-recommendations-2026-11-03.md).

The original large HTTP 403 event total must not be presented as an equivalent number of failed imports. The newer importer continues past refused chats to save readable ones, while older versions stopped sooner. Local fixes are not a Chrome Web Store release, and existing public-version telemetry cannot evaluate unshipped code.

Preserve the current recovery work. Do not create another private test, ask Rue to repeat tests, or claim the 15 chats are recovered without new evidence. No customer chats were accessed or modified in this follow-up.

## 4. Indexing: direct Google evidence lowers the immediate risk

Using the existing GSC OAuth account and property `sc-domain:llmnesia.com`, the URL Inspection API returned the following indexed observations:

| URL | Last crawl, UTC | Result |
| --- | --- | --- |
| `/` | 2 November, 22:42 | Submitted and indexed; successful fetch; robots allowed; canonical matches |
| `/blog/google-ai-mode-history` | 1 November, 19:43 | Same; rich-result verdict PASS |
| `/blog/how-to-export-character-ai-conversation-history` | 29 October, 04:10 | Same; rich-result verdict PASS |
| `/blog/how-to-find-old-character-ai-conversations` | 31 October, 05:22 | Same; rich-result verdict PASS |
| `/mcp` | 1 November, 05:36 | Submitted and indexed; successful fetch; robots allowed; canonical matches |

The API reports Google's indexed version, not a live fetch. The three article results list valid Breadcrumbs; this does not prove every schema type is eligible for a rich result or resolve Ahrefs' exact findings. [Google API definition](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect).

Local blog routes already emit Article schema. Comparison routes intentionally emit WebPage schema. Do not change every comparison into Article merely because a crawler labels it an article. The current robots source allows crawling.

The earlier **Reduce Vercel deployment storage** chat records approved live Bot Protection in Challenge mode, with AI Bots set to Allow. That explains the security checkpoint observed by our direct automated site fetches. It does not prove Googlebot is blocked. No attempt was made to bypass the challenge or change protection.

Remaining evidence needed: the actual URLs behind the October 25 HTTP 401 and October 26 robots exclusions, and the 30 URLs Ahrefs classified as missing Article schema. The URL Inspection API does not supply an inventory of all excluded URLs. Browser access is disabled in Work settings, so the dashboard reports could not be inspected in this chat. The existing read-only APIs were used to verify priority pages instead.

[Google warning](https://mail.google.com/mail/u/0/#all/1a174ff628a2d63b), [Ahrefs crawl](https://mail.google.com/mail/u/0/#all/1a17c05b2811ebbe).

## 5. Email: positive current provider evidence

The designated Keychain credential was used in process memory for GET requests only. Resend lists `llmnesia.com` as **verified**. In the latest 100-record provider page, 88 LLMnesia sends were dated October 30 onward: **87 had last_event=delivered and one remained sent**. Three Yahoo-addressed messages were delivered, including the two October 30 resends and a November 3 message. No recipient addresses, bodies or credentials are included here.

A fresh Gmail bounce search found no delivery-failure notices newer than the known October 30 failures. The separate outreach chat also records current sender-domain checks and submission of its exact approved drafts. Provider delivery is stronger evidence than Gmail Sent, but does not prove inbox placement, opens, or that every future route authenticates correctly.

The earlier Yahoo authentication and Resend domain-verification incident has current evidence of recovery for this sending route. No DNS change, new test email, resend or subscription change is needed for this audit. Do not automatically retry the one sent-only record.

Provider status interpretation follows [Resend's sent-email API](https://resend.com/docs/api-reference/emails/list-emails).

## 6. Search: use current measurements and preserve existing interventions

Fresh GSC page-only API queries returned these final calendar-month totals:

| Page | September clicks | October clicks | September impressions | October impressions |
| --- | ---: | ---: | ---: | ---: |
| AI Mode history | 634 | 906 | 125,210 | 222,254 |
| Character.AI export | 73 | 249 | 5,785 | 20,147 |
| Find old Character.AI conversations | 368 | 511 | 36,622 | 64,295 |

The API's September AI Mode total differs from the baseline implied by the email's +228 growing-page figure. Preserve each source's values rather than mixing the email delta with current API totals. Month lengths differ and aggregate position/query mix can shift. These are global GSC figures, not Ahrefs' estimated US keyword volumes.

October GA4 production-host observations:

| Page | Desktop page-view users | Desktop install-click users | Mobile page-view users | Mobile capture users |
| --- | ---: | ---: | ---: | ---: |
| AI Mode history | 652 | 153 | 528 | 16 |
| Character.AI export | 149 | 33 | 138 | 9 |
| Find old Character.AI conversations | 132 | 30 | 439 | 11 |

These are per-event user counts on each path, not ordered funnels, attributable installs, purchases, or summed unique people. GA4 reports no sampling and no other-row loss for this query. Its timezone is Asia/Bangkok.

Code inspection confirms `mobile_email_capture` is recorded after a successful lead save and carries a separate `emailed` boolean. A saved capture is not proof an email was sent. Existing page CTAs already offer a computer-install email route, so simply adding another CTA would duplicate existing functionality.

The November 2 audit and today's activation investigation already recommend keeping October 26 content interventions under observation for several completed weeks. Recent acquisition/activation weakened despite month-level growth; the Character.AI query `old character ai` also lost position and impressions in matched weekly windows. Preserve current titles and measure shipped product recovery before making another short-interval content intervention.

See [weekly growth outcomes](growth-outcome-audit.md) and the dated private evidence under `.insights/citation-audits/`.

## 7. Supabase: inspect effective access, do not broaden it

Project `tkgvwpaxycliwqsrufxe` was confirmed as **LLMnesia Vault**, ACTIVE_HEALTHY. Read-only catalog queries inspected effective grants, RLS, relevant policies, default ACLs and migration history. They did not read Vault payloads or customer records.

All **17 public tables have RLS enabled** and service-role SELECT/INSERT/UPDATE privileges. Entitlements have authenticated SELECT with an owner policy. Authenticated direct writes to records remain disallowed; transport writes use existing RPCs. Anonymous SELECT privilege on records does not by itself grant rows: the current policies grant reads to authenticated owners and the dedicated read-only role, not anon.

The project's observed default ACLs still include broad legacy defaults. Do not assume the email's rollout date means those defaults have already been removed on this project, and do not modify them as part of an email audit. Newer service-only Vault migrations already include explicit grants and revokes. Historical initial records/counter creation relies on defaults for service access; any fresh-schema recreation must review explicit grants for those consumers rather than replaying assumptions about legacy project defaults.

No current missing-grant outage was established and no live grants, policies, migrations, projects or roles were changed. Fresh schema recreation was not tested, and the healthy current database is not proof a reset would be safe. The practical action is to require explicit grants in any future table-creation/recreation patch. [Supabase announcement](https://github.com/orgs/supabase/discussions/45329).

## 8. Vercel: distinguish traffic savings from storage

The prior chat completed caching/favicon changes and bot challenges. Those can reduce request-related usage; they do not establish that the October 27 **Deployment Storage** warning was resolved.

Read-only API inventory confirmed the expected account (`keirancpflynn`, `freelymoving@gmail.com`) and existing team. It returned **74 deployments total**, including **33 site deployments**, all READY, with site creation dates from October 20 to October 30. Thirty-two site deployments identify main; one has no branch field. The newest site deployment is `dpl_4ZMmxHz1RqxCrqktMo8TZ4cDEQFN`, commit `8e756bf0984976f56423a82a13e82b57e157295f`, the 0.4.23 changelog publication.

Local site `public/` totals **138,399,605 bytes**. Six Character.AI test ZIPs contribute **124,825,063 bytes**, about 90% of the static asset tree. This is source asset size, not Vercel's deduplicated stored/billed usage. Do not multiply it by deployment count or claim a specific storage saving.

The documented billing charges API returned HTTP 404 `costs_not_found`. Deployment records did not expose current storage bytes. The dashboard could not be inspected because browser access is disabled. Therefore current GB used and headroom remain unverified; no later storage-warning email was found, but absence of an email is not proof of headroom.

Concrete cleanup proposal for a future approval: confirm dashboard storage and retention exceptions, preserve current production plus useful rollback deployments and the active Test 6 download, then review superseded deployments and older private test ZIPs with their owning recovery chat. Inventory alone does not authorise deletion. The saved private inventory includes IDs and commit messages for all 33 site deployments. Nothing was deleted, aliased, deployed, upgraded or reconfigured.

[Vercel retention policy](https://vercel.com/changelog/hobby-projects-now-retain-fewer-deployments-to-free-up-storage), [documented usage API](https://vercel.com/changelog/access-billing-usage-cost-data-api).

## 9. MCP: approval exists; further impact is not established

The earlier **Update LLMnesia MCP registry entry** chat submitted MCPServers.org and deliberately held a separate public-repository proposal. The approval email confirms that submission became live on October 29. Do not create a duplicate repository or treat the generic awesome-list reminder as a new obligation.

The approved listing URL returned HTTP 403 with a JavaScript/cookie challenge. No challenge was bypassed, so rendered listing accuracy remains unverified. Current package setup documentation and official registry metadata remain the comparison source; registry metadata identifies `com.llmnesia/mcp`, version 0.2.16.

A production-host GA4 query for session sources containing mcpservers, glama, pulsemcp, mcp.tc or mcp.so over October 1 to November 2 returned no attributed rows. This does not establish zero visits or prove directory quality, since referrals may be stripped or classified differently. No paid placement or new submission is justified from this evidence.

[Approval email](https://mail.google.com/mail/u/0/#all/1a1855c39f4449ba), [listing](https://mcpservers.org/servers/www-npmjs-com-package-llmnesia-mcp).

## Evidence and reproduction

- Private GSC inspection/page totals and directory referral results: `.insights/email-followup-2026-11-03.json`.
- One-off read-only collection source: `.insights/email-followup-2026-11-03.mjs`.
- Private deployment inventory: `.insights/vercel-site-inventory-2026-11-03.json`.
- Supabase results came from catalog-only connector queries against the confirmed project; Resend results from two GET requests with the designated existing credential.
- No build or regression suite was required for this evidence-only document. No existing reports were rewritten and no other session's code was changed.
