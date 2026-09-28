# Activation funnel validation, 28 September 2026

Read-only PostHog validation of the new-install activation funnel, run against
the completed Monday-Saturday install cohorts 14-19 September and 21-26
September 2026. Aggregate results only. Companion to the first-search
invitation implementation in the LLMnesia extension.

## Method

- Source: PostHog EU query API, read-only HogQL. Run at 2026-09-28T08:35Z.
- Timezone: UTC throughout (PostHog `timestamp` is UTC).
- Unit: unique installs keyed on `anonymous_install_id` (install time = first
  `extension_installed` event). Events joined per install with a 24-hour
  observation window from install time.
- Maturity: installs through 2026-09-26 23:59:59 UTC have fully elapsed 24-hour
  windows at run time. Search/result events for those installs were collected
  through 2026-09-28 (install date + 2 days) so nothing was truncated.
- Internal exclusion: an install is excluded if its `extension_installed` event
  carries `is_internal=true`, or if any of its events in the window does
  (internal builds stamp every event). The existing 24-hour activation
  definition (a `search_submitted` within 24h of install) is unchanged.
- Reproduce: run the queries below through
  `POST /api/projects/$POSTHOG_PROJECT_ID/query/` with a personal API key, or
  adapt `.insights/funnel-validation-2026-09-28.mjs` (local, not committed),
  which produced every number in this note.

## Data quality

- Missing install IDs: 0 of 387 `extension_installed` events in 14-27 September
  lack `anonymous_install_id`; 0 of 142k+ milestone events lack it either.
- Duplicate install events: none. Every install ID in both cohorts has exactly
  one `extension_installed` event (144 prior, 189 current).
- Internal installs: 5 of 727 unique IDs flagged internal in the prior window
  (3 on the install event, 2 only on later events); 9 of 831 in the current
  window (5 and 4). All are excluded from the denominators below. Residual
  unknown-internal risk is limited to installs that never emitted a flagged
  event; the flag is stamped on unpacked/dev loads and internal builds, so that
  population should be empty in store traffic.
- Search event emission is consistent across versions: of external installs
  that searched within 24h, every version cohort fired `search_submitted`
  (the intentional-search event). One 0.4.3 install in the prior week fired
  only the legacy keystroke-level `search_performed`. The activation metric is
  therefore comparable across the versions in these cohorts.

## Funnel, external installs, 24-hour windows

| Step | 14-19 Sep | 21-26 Sep |
| --- | --- | --- |
| Installs (unique, external) | 141 | 185 |
| First open (`extension_first_open`) | 138 (97.9%) | 182 (98.4%) |
| Import completed (`backfill_first_completed`) | 67 (47.5%) | 90 (48.6%) |
| Any searchable content (import done or first capture) | 95 (67.4%) | 126 (68.1%) |
| First intentional search (`search_submitted`) | 55 (39.0%) | 57 (30.8%) |
| Result opened (`result_opened`) | 56 (39.7%) | 61 (33.0%) |

Elapsed time, searching installs: median install-to-search 3.5 vs 3.3 minutes
(mean 36 vs 41); median searchable-to-search 3.5 vs 2.5 minutes. Searchers move
fast; the median searcher searches within minutes of install.

Ordered transitions:

| Transition | 14-19 Sep | 21-26 Sep |
| --- | --- | --- |
| Searched AND had searchable content | 48/55 | 50/57 |
| Searched AFTER content was available | 40/55 | 42/57 |
| Searched with no searchable content in 24h | 7/55 | 7/57 |
| Searched AND opened a result | 36/55 | 43/57 |

Read: import completion and searchable-content availability held steady week
over week (47.5% to 48.6% and 67.4% to 68.1%), while the share of installs
searching within 24h fell (39.0% to 30.8%). The decline sits entirely in
"searched given content was available" (55/95 = 57.9% down to 57/126 = 45.2%),
not upstream of it.

By version (current cohort, >= 20 installs): 0.4.4 29/67 (43.3%) searched,
0.4.5 12/46 (26.1%), 0.4.6 7/20 (35.0%), 0.4.7 9/48 (18.8%). Import completion
is flat across those versions (46-54%) and so is first capture, so the version
correlation in the handoff is not explained by a lower import-completion rate.
By browser (current): Edge 12/30 (40.0%) vs Chrome 38/137 (27.7%).

Prompt surfaces in the same windows: `backfill_search_nudge_shown` reached 74/141
(prior) and 85/185 (current) installs; `search_ready_popup_shown` fired 0 times
in both cohorts, consistent with the code finding that nothing arms it.

## Limitations

- "Searchable content available" is proxied by `backfill_first_completed`
  (import completion) and `conversation_captured` (first capture). There is no
  dedicated index-ready event, and import completion does not prove indexing or
  embedding had finished, so "searchable" is an upper bound.
- `conversation_captured` is passive capture, not intentional activation; the
  overlap of search with capture does not order them. The "searched AFTER
  content was available" row compares timestamps of the two events and is the
  best available ordering, not a proven sequence.
- `result_opened` can fire from the popup recents list without a submitted
  search, so "searched AND opened" is overlap, not strict linkage of an open to
  a submitted search. Result linkage to a specific query is not recorded and
  was not invented here.
- Version correlates with release date and audience; the per-version search
  rates do not establish a version regression.

## Companion measurements

- First result opened: keep measuring `result_opened` within 24h of install
  (counts above), with the recents caveat recorded. A stricter "result opened
  after the install's first submitted search" can be computed from the same
  per-install timestamps as overlap ordering, same caveat.
- Seven-day search return: installs with a `search_submitted` in days 0-7
  after install (window = install_ts .. install_ts + 7 days). A cohort is
  fully mature when every install has had the full window, which happens 7
  days after its last install date: the 14-19 September cohort has been fully
  7-day mature since 27 September, and the 21-26 September cohort becomes
  fully mature for any run dated 4 October or later.
- The existing 24-hour activation definition is unchanged by the first-search
  invitation work; these are companions, not replacements. Before/after
  comparisons of the invitation's effect are observational and cannot prove
  causal uplift on their own.

## Key queries

Install quality (per cohort; swap the dates):

```sql
SELECT
  coalesce(nullIf(properties.extension_version, ''), '(unknown)') AS version,
  count() AS install_events,
  uniq(nullIf(properties.anonymous_install_id, '')) AS unique_install_ids,
  countIf(properties.anonymous_install_id IS NULL OR properties.anonymous_install_id = '') AS install_events_missing_id,
  countIf(toString(properties.is_internal) = 'true') AS install_events_internal
FROM events
WHERE event = 'extension_installed'
  AND toDate(timestamp) >= toDate('2026-09-21')
  AND toDate(timestamp) <= toDate('2026-09-26')
GROUP BY version
ORDER BY install_events DESC
```

Per-install funnel core (milestone events joined by install ID, 24h windows;
`minIf` returns epoch-zero rather than NULL when nothing matches, so every
timestamp must be guarded by a matching `countIf` before use):

```sql
WITH installs AS (
  SELECT properties.anonymous_install_id AS install_id,
         min(timestamp) AS install_ts
  FROM events
  WHERE event = 'extension_installed'
    AND toDate(timestamp) >= toDate('2026-09-21')
    AND toDate(timestamp) <= toDate('2026-09-26')
    AND properties.anonymous_install_id IS NOT NULL
    AND properties.anonymous_install_id != ''
    AND toString(properties.is_internal) != 'true'
  GROUP BY install_id
),
internal_ids AS (
  SELECT DISTINCT properties.anonymous_install_id AS install_id
  FROM events
  WHERE toDate(timestamp) >= toDate('2026-09-21')
    AND toDate(timestamp) <= toDate('2026-09-28')
    AND toString(properties.is_internal) = 'true'
    AND properties.anonymous_install_id IS NOT NULL
    AND properties.anonymous_install_id != ''
),
milestone_raw AS (
  SELECT i.install_id AS install_id, i.install_ts AS install_ts,
    countIf(e.event = 'backfill_first_completed' AND e.ts <= i.install_ts + INTERVAL 24 HOUR) AS backfill_n,
    countIf(e.event = 'conversation_captured' AND e.ts <= i.install_ts + INTERVAL 24 HOUR) AS capture_n,
    countIf(e.event = 'search_submitted' AND e.ts <= i.install_ts + INTERVAL 24 HOUR) AS search_n,
    countIf(e.event = 'result_opened' AND e.ts <= i.install_ts + INTERVAL 24 HOUR) AS opened_n,
    minIf(e.ts, e.event = 'search_submitted' AND e.ts <= i.install_ts + INTERVAL 24 HOUR) AS search_raw,
    minIf(e.ts, e.event = 'backfill_first_completed' AND e.ts <= i.install_ts + INTERVAL 24 HOUR) AS backfill_raw,
    minIf(e.ts, e.event = 'conversation_captured' AND e.ts <= i.install_ts + INTERVAL 24 HOUR) AS capture_raw
  FROM installs AS i
  LEFT JOIN (
    SELECT properties.anonymous_install_id AS iid, event, timestamp AS ts
    FROM events
    WHERE event IN ('backfill_first_completed', 'conversation_captured', 'search_submitted', 'result_opened')
      AND toDate(timestamp) >= toDate('2026-09-21')
      AND toDate(timestamp) <= toDate('2026-09-28')
      AND properties.anonymous_install_id IS NOT NULL
      AND properties.anonymous_install_id != ''
  ) AS e ON i.install_id = e.iid
  WHERE i.install_id NOT IN (SELECT install_id FROM internal_ids)
  GROUP BY i.install_id, i.install_ts
)
SELECT count() AS installs,
  countIf(backfill_n > 0 OR capture_n > 0) AS n_searchable,
  countIf(search_n > 0) AS n_searched,
  countIf(opened_n > 0) AS n_opened,
  countIf(search_n > 0 AND (backfill_n > 0 OR capture_n > 0)) AS n_search_and_searchable
FROM (
  SELECT *,
    if(search_n > 0, search_raw, NULL) AS search_ts,
    if(backfill_n > 0, backfill_raw, NULL) AS backfill_ts,
    if(capture_n > 0, capture_raw, NULL) AS capture_ts,
    if(backfill_n > 0, 1, 0) AS has_backfill,
    if(capture_n > 0, 1, 0) AS has_capture
  FROM milestone_raw
)
```

(The full script adds `extension_first_open`, `first_search_completed`, the
nudge and ready-popup events, browser/version breakdowns, and the median
elapsed-time columns shown above.)
