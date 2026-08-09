import type {
  DeltaDirection,
  EvidenceDelta,
  MetricDelta,
  MetricsSnapshot,
} from './types.js';

/**
 * Compute a structured diff between the current and prior week's MetricsSnapshot.
 * This is the evidence the Ledger Editor LLM reasons from instead of mentally
 * diffing two raw JSON blobs.
 *
 * `prior` can be null (first ever run, no prior data to compare against) —
 * the delta will report every metric as new with `prior: 0`.
 */
export function computeEvidenceDelta(
  current: MetricsSnapshot,
  prior: MetricsSnapshot | null,
): EvidenceDelta {
  const notable: EvidenceDelta['notable_changes'] = [];

  function delta(
    label: string,
    currentVal: number,
    priorVal: number,
    opts?: { threshold?: number; isRate?: boolean },
  ): MetricDelta {
    const change = currentVal - priorVal;
    const threshold = opts?.threshold ?? (opts?.isRate ? 0.02 : 1);
    const direction: DeltaDirection =
      Math.abs(change) < threshold ? 'flat' : change > 0 ? 'up' : 'down';
    const pct_change =
      priorVal !== 0 ? Math.round((change / Math.abs(priorVal)) * 1000) / 1000 : null;

    // Flag notable changes: non-flat + meaningful magnitude.
    if (direction !== 'flat') {
      const pctStr =
        pct_change !== null
          ? ` (${pct_change > 0 ? '+' : ''}${Math.round(pct_change * 100)}%)`
          : '';
      if (opts?.isRate) {
        const pts = Math.round(change * 100);
        notable.push({
          metric: label,
          what_changed: `${direction === 'up' ? 'rose' : 'fell'} ${Math.abs(pts)} percentage points`,
          magnitude: `${(priorVal * 100).toFixed(1)}% → ${(currentVal * 100).toFixed(1)}%${pctStr}`,
        });
      } else {
        notable.push({
          metric: label,
          what_changed: `${direction === 'up' ? 'increased' : 'decreased'} by ${Math.abs(change)}`,
          magnitude: `${priorVal} → ${currentVal}${pctStr}`,
        });
      }
    }

    return { current: currentVal, prior: priorVal, change, pct_change, direction };
  }

  // --- Core product metrics ---
  const p = prior;
  const installs = delta(
    'Installs',
    current.installs?.total ?? 0,
    p?.installs?.total ?? 0,
  );
  const activation_rate = delta(
    'Activation rate',
    current.activation?.rate ?? 0,
    p?.activation?.rate ?? 0,
    { isRate: true },
  );
  const retention_w1 = delta(
    'W1 retention',
    current.retention?.w1_rolling?.rate ?? 0,
    p?.retention?.w1_rolling?.rate ?? 0,
    { isRate: true },
  );
  const retention_w4 = delta(
    'W4 retention',
    current.retention?.w4_rolling?.rate ?? 0,
    p?.retention?.w4_rolling?.rate ?? 0,
    { isRate: true },
  );
  const wau = delta(
    'WAU',
    current.engagement?.wau ?? 0,
    p?.engagement?.wau ?? 0,
  );
  const searches_per_wau = delta(
    'Searches per WAU',
    current.engagement?.searches_per_wau ?? 0,
    p?.engagement?.searches_per_wau ?? 0,
    { threshold: 0.5 },
  );
  const click_rate = delta(
    'Search click rate',
    current.search_quality?.click_rate ?? 0,
    p?.search_quality?.click_rate ?? 0,
    { isRate: true },
  );
  const zero_result_rate = delta(
    'Zero-result rate',
    current.search_quality?.zero_result_rate ?? 0,
    p?.search_quality?.zero_result_rate ?? 0,
    { isRate: true },
  );
  const email_capture_rate = delta(
    'Email capture rate',
    current.email_capture?.rate ?? 0,
    p?.email_capture?.rate ?? 0,
    { isRate: true },
  );

  // --- GA4 / acquisition metrics ---
  const curWeb = current.ga4?.website;
  const priorWeb = p?.ga4?.website;
  const website_sessions = delta(
    'Website sessions',
    curWeb?.sessions ?? 0,
    priorWeb?.sessions ?? 0,
  );
  const curExt = current.ga4?.extension;
  const priorExt = p?.ga4?.extension;
  const store_installs = delta(
    'Store installs (GA4)',
    curExt?.store_installs?.events ?? 0,
    priorExt?.store_installs?.events ?? 0,
  );

  // --- Search performance (optional, may be absent) ---
  const curSearch = current.search_performance;
  const priorSearch = p?.search_performance;
  const search_performance: EvidenceDelta['search_performance'] = {
    google:
      curSearch?.google
        ? {
            impressions: delta(
              'Google impressions',
              curSearch.google.impressions,
              priorSearch?.google?.impressions ?? 0,
            ),
            clicks: delta(
              'Google clicks',
              curSearch.google.clicks,
              priorSearch?.google?.clicks ?? 0,
            ),
          }
        : null,
    bing:
      curSearch?.bing
        ? {
            impressions: delta(
              'Bing impressions',
              curSearch.bing.impressions,
              priorSearch?.bing?.impressions ?? 0,
            ),
            clicks: delta(
              'Bing clicks',
              curSearch.bing.clicks,
              priorSearch?.bing?.clicks ?? 0,
            ),
          }
        : null,
  };

  // Sort notable changes by magnitude (biggest pct_change first).
  notable.sort((a, b) => {
    const parsePct = (s: string) => {
      const m = s.match(/\(([-+]?\d+)%\)/);
      return m ? Math.abs(parseInt(m[1], 10)) : 0;
    };
    return parsePct(b.magnitude) - parsePct(a.magnitude);
  });

  return {
    week_start: current.week_start,
    week_end: current.week_end,
    prior_week_start: p?.week_start ?? null,
    ...(current.partial ? { partial: current.partial } : {}),
    installs,
    activation_rate,
    retention_w1,
    retention_w4,
    wau,
    searches_per_wau,
    click_rate,
    zero_result_rate,
    email_capture_rate,
    website_sessions,
    store_installs,
    search_performance,
    notable_changes: notable.slice(0, 10),
  };
}
