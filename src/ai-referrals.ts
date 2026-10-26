export interface ReferralRow {
  date: string;
  source: string;
  medium: string;
  landingPage: string;
  channel: string;
  host: string;
  sessions: number;
}

export const KNOWN_ASSISTANT_SOURCES = [
  'gemini', 'gemini.google.com', 'bard.google.com', 'chatgpt.com',
  'chat.openai.com', 'perplexity', 'perplexity.ai', 'claude.ai', 'copilot.microsoft.com',
  'copilot.com',
] as const;

export function mondayOf(date: Date): Date {
  const out = new Date(date);
  const day = out.getUTCDay();
  out.setUTCDate(out.getUTCDate() - (day === 0 ? 6 : day - 1));
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

export function isKnownAssistantSource(source: string): boolean {
  return (KNOWN_ASSISTANT_SOURCES as readonly string[]).includes(source.toLowerCase());
}

export function isProductionHost(host: string): boolean {
  return host === 'www.llmnesia.com' || host === 'llmnesia.com';
}

interface Bucket {
  sessions: number;
  sources: Record<string, number>;
  landing_pages: Record<string, number>;
  days: Record<string, number>;
  hosts: Record<string, number>;
  source_page_days: ReferralRow[];
}

function sortCounts(record: Record<string, number>) {
  return Object.fromEntries(Object.entries(record).sort(([a, an], [b, bn]) => bn - an || a.localeCompare(b)));
}

export function referralWeeks(rows: ReferralRow[]) {
  const buckets: Record<string, Bucket> = {};
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(row.sessions) || row.sessions < 0) {
      throw new Error('Invalid referral row');
    }
    const date = new Date(`${row.date}T00:00:00Z`);
    if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== row.date) throw new Error('Invalid referral date');
    const week = mondayOf(date).toISOString().slice(0, 10);
    const bucket = buckets[week] ??= { sessions: 0, sources: {}, landing_pages: {}, days: {}, hosts: {}, source_page_days: [] };
    bucket.sessions += row.sessions;
    for (const [record, key] of [
      [bucket.sources, `${row.source} / ${row.medium}`],
      [bucket.landing_pages, row.landingPage], [bucket.days, row.date], [bucket.hosts, row.host],
    ] as const) record[key] = (record[key] ?? 0) + row.sessions;
    bucket.source_page_days.push(row);
  }
  return Object.fromEntries(Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b)).map(([week, b]) => [week, {
    sessions: b.sessions,
    sources: sortCounts(b.sources),
    // Keep the familiar compact view, but retain every page and source/day row.
    landing_pages: Object.fromEntries(Object.entries(sortCounts(b.landing_pages)).slice(0, 15)),
    all_landing_pages: sortCounts(b.landing_pages),
    days: Object.fromEntries(Object.entries(b.days).sort(([a], [b]) => a.localeCompare(b))),
    hosts: sortCounts(b.hosts),
    source_page_days: b.source_page_days,
  }]));
}

export function buildReferralSeries(rows: ReferralRow[]) {
  const production = rows.filter(row => isProductionHost(row.host));
  const known = production.filter(row => isKnownAssistantSource(row.source));
  return {
    // Preserve the original channel and hostname population for comparability.
    weeks: referralWeeks(rows.filter(row => row.channel === 'AI Assistant')),
    known_source_supplement: {
      metric: 'Production-host sessions from an explicit known-assistant source, across all channel classifications',
      sources: KNOWN_ASSISTANT_SOURCES,
      weeks: referralWeeks(known),
      outside_ai_channel_weeks: referralWeeks(known.filter(row => row.channel !== 'AI Assistant')),
    },
    production_combined: {
      metric: 'Production-host sessions in AI Assistant OR from a known-assistant source (union, not sum)',
      weeks: referralWeeks(production.filter(row => row.channel === 'AI Assistant' || isKnownAssistantSource(row.source))),
    },
  };
}
