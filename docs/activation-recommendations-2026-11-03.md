# Activation recommendations carried out, 3 November 2026

## Findings and decisions

The first-search invitation opens correctly. Every external install with a recorded invitation click also recorded the palette opening: 46/46 in the previous cohort and 58/58 in the current cohort. The bigger clicked group did not yield more searches: 29 versus 28 clickers searched at all, and 27 versus 23 had a positive-result search. These are within-day overlaps, not query-level attribution. The ordered first-search-after-first-click counts were 26 and 27, respectively.

Character.AI access refusals are a real import problem, but they do not explain the overall search decline. Among users who started a Character.AI import, successful-result searches increased from 14/28 to 17/27. Among the other installs, they fell from 45/173 to 28/173. The platform groups here are mutually exclusive by whether a Character.AI import was started; ordinary per-platform tables overlap and must not be summed.

The Character.AI group with any first-completed import event fell from 14/28 to 3/27. Its platform-specific first-completed events fell from 14 to two. HTTP 403 affected 21 installs in the current cohort versus two previously. Do not interpret the large increase in raw error-event counts as an equally large incidence increase: a newer import continues past refused chats to save later readable ones, while earlier behavior stopped sooner. A partial import can still support useful search. Existing refusal and retry safeguards should be preserved; the client cannot manufacture a transcript the provider refuses to return.

Claude's platform-specific completion reach also fell, from 29/34 starters to 21/30. Eleven current 0.4.21 installs reported a failed discovery page with HTTP 403. ChatGPT completion reach was roughly stable (18/45 starters to 16/43), with missing sign-in on eight current installs. None of the current cohort's recorded extraction-error rows established malformed ChatGPT JSON as the cause of this weekly decline. Separate ChatGPT parsing repairs already being completed in the main checkout were preserved.

Most new installs were 0.4.21 in the current cohort, versus 0.4.18 and 0.4.19 previously. Version, release date, provider conditions and audience are confounded, so the version table does not prove a release regression.

## Product repair

A synthetic regression reproduced a repairable recovery gap: a user searches, gets no matches, then clears the query. The palette did not restore its verified suggestions, and the first-search milestone prevented the ordinary suggestion request from helping again.

The repair requests a bounded set of keyword-verified suggestions after that cleared miss, even when the ordinary first-search milestone is already set. It does not submit a query automatically, alter activation definitions, invent sample chats, read a real corpus for testing, or bypass organisation scope. Suggestions remain hidden when filters could conceal their verified result. Delayed responses are discarded after close or a scope change. The ordinary first-search behavior after a successful search is retained.

Recovery chip impressions and clicks use the existing events with a fixed `source=zero_result_recovery` label. Queries, titles and conversation content are not sent. After a future release, compare how many of those installs then submit a positive-result search, keeping it distinct from invitation clicks and from confirmed useful-result opens.

## Search recommendation

The Character.AI page lost much of its visibility for the ambiguous query `old character ai`: reported impressions fell from 6,530 to 2,762, clicks from 32 to nine, and average position worsened from 4.94 to 7.86 across the matched weekday windows. That query can mean the old Character.AI website rather than finding a past chat. This is consistent with a query/position change, not proof the new snippet caused the loss. Keep the published 26 October intervention under observation instead of changing its title again after one week. Query breakdowns exclude anonymized queries and are not site totals.

## Measurement and reproducibility

- Cohorts: external installs 19–24 October versus 26–31 October, with 24 hours after each install, UTC. Anonymous installation IDs stay server-side; only aggregates were retrieved.
- Repeat with `npm run audit:activation-diagnosis -- --week-start=2026-10-26 --cohort-days=6`. Optional `--query=ordered` limits the run to one table; `--output=path.json` chooses the private evidence file.
- Source evidence lives under `.insights/activation-diagnosis-2026-11-03.json` and `.insights/character-search-2026-11-03.json`, not in Git.
- The weekly protocol now calls for this drill-down when activation or import completion weakens. It requires background-only access and distinguishes source refusals, stage losses and observation from causation.
- Keep the existing weekly follow-up cadence. No additional recurring job, outreach, release, site publication, cloud resource or paid service was created.

## Verification

The new cleared-miss regression failed on the original code and passed after the repair. All 64 focused synthetic tests passed, covering palette interactions, genuine local keyword indexing, partial/empty imports, scope restrictions, filters and delayed responses. Extension TypeScript checking passed. All UI tests use generated fixtures and mocks; no native browser, desktop focus, real local index or Vault corpus was used.
