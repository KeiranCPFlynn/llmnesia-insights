import { mondayOf } from './ai-referrals.js';

const DAY = 86_400_000;
export function isoDate(date: Date): string { return date.toISOString().slice(0, 10); }
function date(value: string): Date {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.valueOf()) || isoDate(parsed) !== value) {
    throw new Error('Expected a calendar date in YYYY-MM-DD format');
  }
  return parsed;
}
export function shift(value: string, days: number): string { return isoDate(new Date(+date(value) + days * DAY)); }

export function outcomeWindows(weekStart: string, now = new Date()) {
  const start = date(weekStart);
  if (+mondayOf(start) !== +start || +start + 7 * DAY > +now) throw new Error('Expected a completed Monday-to-Sunday week');
  // Whole UTC installation days only. Every included install must have its
  // entire observation window, even the last install at 23:59:59 on that day.
  const matureEnd = (days: number) => isoDate(new Date(+date(isoDate(now)) - (days + 1) * DAY));
  const activationEnd = [shift(weekStart, 6), matureEnd(1)].sort()[0];
  const retentionWeek = isoDate(mondayOf(new Date(+date(isoDate(now)) - 7 * DAY)));
  const retentionStart = +date(shift(retentionWeek, 6)) <= +date(matureEnd(7))
    ? retentionWeek : shift(retentionWeek, -7);
  const retention = [retentionStart, shift(weekStart, -7)].sort()[0];
  return {
    cohort_timezone: 'UTC',
    acquisition_timezone: 'Each GA4 property calendar, recorded in response metadata',
    acquisition: { current: {start:weekStart,end:shift(weekStart,6)}, previous:{start:shift(weekStart,-7),end:shift(weekStart,-1)} },
    activation: { current:{start:weekStart,end:activationEnd}, previous:{start:shift(weekStart,-7),end:shift(activationEnd,-7)}, omitted_install_dates: Array.from({length:7},(_,i)=>shift(weekStart,i)).filter(d=>d>activationEnd) },
    retention: { current:{start:retention,end:shift(retention,6)}, previous:{start:shift(retention,-7),end:shift(retention,-1)} },
  };
}

export function outcomeQuery(start: string, end: string) {
  date(start); date(end);
  if (end < start) throw new Error('Cohort end precedes start');
  const until = shift(end, 8);
  return `WITH installs AS (
    SELECT properties.anonymous_install_id AS iid, min(timestamp) AS installed,
      count() AS install_events
    FROM events WHERE event = 'extension_installed'
      AND timestamp >= toDateTime('${start} 00:00:00', 'UTC')
      AND timestamp < toDateTime('${shift(end, 1)} 00:00:00', 'UTC')
      AND properties.anonymous_install_id IS NOT NULL AND properties.anonymous_install_id != ''
    GROUP BY iid
  ), per_install AS (
    SELECT i.iid, i.install_events,
      countIf(toString(e.props.is_internal) = 'true') AS internal_n,
      countIf(e.event = 'backfill_first_completed' AND e.ts < i.installed + INTERVAL 24 HOUR) AS imported,
      countIf(e.event = 'conversation_captured' AND e.ts < i.installed + INTERVAL 24 HOUR) AS captured,
      countIf(e.event = 'search_submitted' AND e.ts < i.installed + INTERVAL 24 HOUR) AS searched,
      countIf(e.event = 'search_submitted' AND e.ts < i.installed + INTERVAL 24 HOUR
        AND toFloat(e.props.result_count) > 0) AS positive_search,
      countIf(e.event = 'search_submitted' AND e.ts < i.installed + INTERVAL 24 HOUR
        AND e.props.result_count IS NOT NULL) AS search_result_coverage,
      countIf(e.event = 'result_opened' AND e.ts < i.installed + INTERVAL 24 HOUR
        AND toString(e.props.from_search) = 'true') AS search_result_opened,
      countIf(e.event = 'result_opened' AND e.ts < i.installed + INTERVAL 24 HOUR
        AND (e.props.from_search IS NULL OR toString(e.props.from_search) NOT IN ('true', 'false'))) AS unknown_open_origin,
      countIf(e.event = 'search_submitted' AND e.ts >= i.installed + INTERVAL 24 HOUR) AS returned,
      countIf(e.event = 'search_ready_popup_shown' AND e.ts < i.installed + INTERVAL 24 HOUR) AS invitation,
      countIf(e.event = 'search_ready_popup_cta_clicked' AND e.ts < i.installed + INTERVAL 24 HOUR) AS invitation_clicked
    FROM installs i LEFT JOIN (
      SELECT properties.anonymous_install_id AS iid, timestamp AS ts, event, properties AS props
      FROM events WHERE timestamp >= toDateTime('${start} 00:00:00', 'UTC')
        AND timestamp < toDateTime('${until} 00:00:00', 'UTC')
        AND properties.anonymous_install_id IS NOT NULL AND properties.anonymous_install_id != ''
    ) e ON i.iid = e.iid
    WHERE e.ts >= i.installed AND e.ts < i.installed + INTERVAL 7 DAY
    GROUP BY i.iid, i.install_events
  ) SELECT count(), countIf(searched > 0), countIf(positive_search > 0),
    countIf(search_result_opened > 0), countIf(imported > 0),
    countIf(imported > 0 OR captured > 0), countIf(invitation > 0),
    countIf(invitation_clicked > 0), countIf(searched > 0 AND returned > 0),
    countIf(search_result_coverage > 0), countIf(install_events > 1), countIf(unknown_open_origin > 0)
    FROM per_install WHERE internal_n = 0`;
}

export function outcomeCounts(row: unknown[] = [], matureDays: 1 | 7 = 1) {
  const values = row.map(Number);
  if (values.length !== 12 || values.some(n => !Number.isSafeInteger(n) || n < 0)) throw new Error('Invalid outcome counts');
  const [installs, searched, positive, opened, imported, content, invited, clicked, returned, coverage, duplicates, unknownOrigin] = values;
  if (values.slice(1).some(n => n > installs) || positive > searched || coverage > searched || returned > searched) throw new Error('Inconsistent outcome counts');
  const rate = (n: number, d: number) => d >= 30 ? Number((n/d).toFixed(4)) : null;
  return {
    external_installs:installs, intentional_search_24h:searched, search_with_results_24h:positive,
    opened_search_result_24h:opened, import_completed_24h:imported,
    content_available_proxy_24h:content, invitation_shown_24h:invited, invitation_clicked_24h:clicked,
    search_result_count_coverage_installs:coverage, duplicate_install_event_ids:duplicates,
    search_result_count_missing_installs:searched-coverage,
    result_open_origin_unknown_installs:unknownOrigin,
    intentional_search_rate_24h:rate(searched,installs), search_with_results_rate_24h:coverage === searched ? rate(positive,installs) : null,
    opened_search_result_rate_24h:unknownOrigin === 0 ? rate(opened,installs) : null,
    returned_after_first_day: matureDays === 7 ? returned : null,
    return_rate_among_first_day_searchers: matureDays === 7 ? rate(returned,searched) : null,
    rates_suppressed_below:30,
  };
}
