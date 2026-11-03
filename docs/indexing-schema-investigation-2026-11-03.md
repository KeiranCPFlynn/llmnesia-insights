# Indexing and schema investigation, 3 November 2026

This follow-up covers only item 4 from the email review. The user selected APIs and code only. No browser, publishing, indexing submission, sitemap removal, firewall change or site-source edit was performed.

## Findings

### Two specific pages are discovered but not indexed

Google's URL Inspection API reports **Discovered - currently not indexed** for:

- `https://www.llmnesia.com/use-cases/researchers`
- `https://www.llmnesia.com/use-cases/writers`

Neither result records a crawl time or a fetch/robots rejection. They are not evidence of HTTP 401 or robots blocking. Both are in the 252-URL sitemap, have incoming internal links in the generated HTML, emit valid Article JSON-LD and have the expected self-canonical. They are not orphan pages.

The other four use-case pages, developers, students, founders and consultants, are indexed and report successful fetches with robots allowed and matching canonicals. This argues against a shared routing or Article-template defect, although it does not establish why Google has not crawled the two other pages.

Final October page-only Search Analytics returned:

| Use-case page | Clicks | Impressions |
| --- | ---: | ---: |
| students | 2 | 289 |
| developers | 1 | 104 |
| consultants | 0 | 21 |
| founders | 0 | 16 |
| researchers | No returned row | No returned row |
| writers | No returned row | No returned row |

Do not convert an absent row into a claimed exact measurement. The indexed pages' combined observed traffic is small. This is a bounded content/index-selection investigation, not evidence of a broad current traffic outage.

Next useful content decision: review whether the researcher and writer landing pages offer distinct value beyond the existing researcher/academic/writer blog articles. Distinctiveness is a hypothesis to assess, not a proven cause. Do not add generic links, rewrite titles, delete pages or redirect them solely to force indexing. Google's index selection cannot be guaranteed by a schema change.

### No broad public-page crawl block was found

Earlier API checks confirmed the homepage, MCP page and three priority blog guides are indexed, crawlable and canonicalised to `https://www.llmnesia.com`. This follow-up also confirms the comparison page `/compare/llmnesia-vs-chatgpt-history` and category page `/blog/category/platform-guides` are indexed and crawlable.

The apex homepage `https://llmnesia.com/` is explicitly **Page with redirect**, with `https://www.llmnesia.com/` as Google's canonical. This matches the site's deliberate permanent apex-to-www redirect. It is not a defect to remove. The July canonical consolidation and October static-profile www-link repair already address known conflicting host signals.

The account and goodbye URLs are unknown to Google in the inspected snapshot; local metadata intentionally sets noindex. The Vault root is indexed in Google's October 18 snapshot, so it cannot be cited as proof that the old 401 alert concerned a private Vault page.

Search Console lists both www and older apex sitemap submissions. Both last downloads succeeded with **zero errors and zero warnings**. The www sitemap was downloaded November 2 and reports 252 submitted URLs, matching the local generated sitemap. The API's legacy indexed count must not be used as a site-wide index count: direct inspections establish that submitted pages are indexed.

The actual URLs from the October 25 401 and October 26 robots alerts remain unenumerated. The supported URL Inspection API inspects specified URLs; it does not list every URL in those exclusion categories. No browser access or additional Ahrefs credential was requested after the user's API-only choice. Do not claim those exact historical alerts are resolved or change security settings from their subject lines.

### Article markup is present across the article templates

A read-only HTML-parser audit of the existing local static export covered **260 HTML files**, including **216 content pages**:

- All **191 blog posts and six use-case pages** emit valid Article JSON-LD.
- All **19 comparison pages** emit WebPage JSON-LD deliberately.
- No JSON parse errors were found in any JSON-LD script.
- No unexpected noindex or canonical mismatch was found across the content pages.
- Twelve additional blog/category/comparison/use-case index pages lack Article markup, which is appropriate for collection pages.

The local schema factory, JSON-LD renderer, three content-route templates and robots source exactly match the verified production deployment's source commit `8e756bf0984976f56423a82a13e82b57e157295f`. This strengthens the source diagnosis; the generated export was not independently established as the exact deployed artifact.

Ahrefs' October 27 email says 30 pages lack Article schema but does not include their URLs. There are 31 current comparison/collection pages without Article markup, so classification of non-article pages is a plausible explanation. The count alone does not identify the flagged 30, and no exact match is claimed. Changing every WebPage or collection page into an Article would be unjustified.

Google's Article guidance has no universally required properties; Article markup is not itself a prerequisite for ordinary indexing. [Google Article documentation](https://developers.google.com/search/docs/appearance/structured-data/article).

### A separate software-app rich-result mismatch is reproducible

The local export contains **199 SoftwareApplication nodes**, all without `aggregateRating` or `review`. Every blog route adds this promotional app node alongside its Article, Breadcrumb and FAQ nodes. The same production schema factory omits ratings/reviews. The pre-October-13 source has 190 blogs and already emits the same app markup, making this a strong candidate for the older Ahrefs report's 198 rich-result validation warnings. The exact Ahrefs error rows are still needed to confirm that attribution.

Google requires a rating or review for a **software-app rich result**. Missing one does not make the JSON malformed or prohibit ordinary indexing. [Google software-app rich-result requirements](https://developers.google.com/search/docs/appearance/structured-data/software-app).

The simplest optional cleanup is to remove the redundant SoftwareApplication node from blog guides while retaining their Article, Breadcrumb, FAQ and applicable HowTo markup. Product pages can keep factual software descriptions, with rich-result eligibility explicitly unclaimed until genuine visible review evidence exists. Do not invent ratings or add an unaudited store score. This cleanup can reduce irrelevant validation noise, but is not a demonstrated fix for the two non-indexed landing pages or the 30-page Article alert.

## Recommendation

1. Investigate the two named non-indexed use-case pages' distinct usefulness before expanding technical SEO work.
2. Treat the repeated app rich-result warning as optional markup cleanup, not an indexing emergency.
3. Preserve working www canonicalisation, crawl rules and valid Article templates.
4. Keep the exact 30 Article-alert URLs and old 401/robots exclusion rows explicitly unverified until those report rows are available. No unsupported bulk fix is prepared against guessed URLs.

No confirmed application defect requiring a source patch was established. No code or metadata was changed merely to silence a crawler warning.

## Evidence

- Private URL inspections and sitemap statuses: `.insights/indexing-only-2026-11-03.json`.
- Initial indexed priority-page evidence: `.insights/email-followup-2026-11-03.json`.
- Static HTML schema/canonical inventory: `.insights/local-schema-audit-2026-11-03.json`.
- Final October use-case search rows: `.insights/use-case-search-2026-11-03.json`.
- [Ahrefs October 27 alert](https://mail.google.com/mail/u/0/#all/1a17c05b2811ebbe), [October 13 validation warning](https://mail.google.com/mail/u/0/#all/1a133f2f90e73d61), [Google 401 alert](https://mail.google.com/mail/u/0/#all/1a174ff628a2d63b), [Google robots alert](https://mail.google.com/mail/u/0/#all/1a177e35b1c998c9).
- [URL Inspection API scope](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect): observations describe Google's indexed version rather than a live test.
