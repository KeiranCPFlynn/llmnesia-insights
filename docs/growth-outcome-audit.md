# Growth outcome audit

Run `npm run audit:growth-outcomes` for the latest completed week, or use
`npm run audit:growth-outcomes -- --week-start=2026-10-19` for a historical
week. `--output=path.json` selects a JSON evidence file and a matching Markdown
report. The command uses existing GA4 and PostHog credentials, makes read-only
queries and exits nonzero if a required source is unavailable. It does not
publish an Insights review, change analytics settings or create a job.

Use it alongside `npm run audit:ai-referrals`. The original AI Assistant
channel remains comparable; source coverage version 2 includes the observed
bare Perplexity source in the production supplement and union. The two
overlapping series must not be added. Dated older snapshots remain unchanged.

## What is measured

- Production website sessions and install-button events, with source labels.
  Events may repeat and are not confirmed installs.
- Chrome Web Store install events and users from the existing OAuth property.
- Unique external extension installation cohorts, joined within the existing
  PostHog project by anonymous installation ID. Internal flags on any observed
  event in the seven-day observation range exclude that install. Missing IDs
  and duplicate install events are reported separately.
- Intentional searches within 24 hours, plus the distinct subset with a
  positive result count. This keeps the existing activation definition and
  adds evidence that search actually returned a result.
- Search-origin result opens, with unknown origin exposed. The rate is
  unavailable when origin is missing, so older instrumentation cannot look
  like zero engagement. The telemetry does not link an open to one query.
- Search return 24 to 168 hours after install among first-day searchers,
  using an older, fully mature installation cohort.

PostHog installation cohorts use UTC. On a Monday, Sunday installs are omitted
from the 24-hour comparison and the previous cohort uses the same weekdays.
The last whole installation week with seven completed observation days is
used for return. Historical reruns never select a return cohort newer than
the week preceding the requested reporting week. GA4 calendars remain those
of the separate properties and are recorded in response metadata.

Rates are suppressed when their denominator is below 30. Positive-result
search rates are also withheld when searchers have missing result counts.
A submitted search
with a positive result count is not proof that the result was useful. Capture
or import completion is only a content-availability proxy, not proof that
keyword or semantic indexing completed. Website, store and extension
populations are not joined, so a source cannot be credited with activation
without additional attribution evidence.

## Validation and interpretation

The 26 October implementation was checked with the focused referral,
cohort-boundary, rate-suppression and PostHog tests, the full Insights test
suite, TypeScript, and successful read-only queries against all three
existing analytics connections. It exposed mixed string/boolean origin
properties, which the new query normalizes before comparison.

Keep business changes and acquisition changes separate in the weekly
explanation. More successful searches alongside fewer installs indicates an
acquisition constraint and an improving measured activation rate, not proof
that an individual product change caused uplift. A single completed week is
an observation, not a causal experiment. Site intervention baselines and
publication boundaries are recorded in the website repository's
`docs/growth-discovery-followup-2026-10-26.md`.
