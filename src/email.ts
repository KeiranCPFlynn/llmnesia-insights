import { Resend } from 'resend';
import type { AnalysisResult, MetricsSnapshot, Thread } from './types.js';

const TO = 'freelymoving@gmail.com';

function priorityOrder(p: string): number {
  return p === 'high' ? 0 : p === 'medium' ? 1 : 2;
}

function severityOrder(s: string): number {
  return s === 'critical' ? 0 : s === 'concern' ? 1 : s === 'watch' ? 2 : 3;
}

function severityBadge(s: string): string {
  const colors: Record<string, string> = {
    critical: '#dc2626',
    concern: '#d97706',
    watch: '#2563eb',
    info: '#6b7280',
  };
  const color = colors[s] ?? '#6b7280';
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${color};color:#fff;font-size:12px;font-weight:600;text-transform:uppercase;">${s}</span>`;
}

function metricsTable(m: MetricsSnapshot): string {
  const rows = [
    ['Installs', m.installs.total],
    ['Activated (24h)', `${m.activation.activated_within_24h} / ${m.activation.installs} (${pct(m.activation.rate)})`],
    ['W1 retention', `${m.retention.w1_rolling.returned} / ${m.retention.w1_rolling.active_prior_week} (${pct(m.retention.w1_rolling.rate)})`],
    ['W4 retention', `${m.retention.w4_rolling.returned} / ${m.retention.w4_rolling.active_4w_ago} (${pct(m.retention.w4_rolling.rate)})`],
    ['WAU', m.engagement.wau],
    ['Total searches', m.engagement.total_searches],
    ['Searches/WAU', m.engagement.searches_per_wau],
    ['Click rate', pct(m.search_quality.click_rate)],
    ['Zero-result rate', pct(m.search_quality.zero_result_rate)],
    ['Email capture rate', pct(m.email_capture.rate)],
  ];

  const trs = rows
    .map(
      ([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;white-space:nowrap;">${k}</td><td style="padding:4px 0;">${v}</td></tr>`,
    )
    .join('');

  return `<table style="border-collapse:collapse;font-size:14px;">${trs}</table>`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function platformTable(platforms: MetricsSnapshot['platforms']): string {
  const ps = Object.keys({ ...platforms.searches, ...platforms.clicks });
  const rows = ps
    .sort()
    .map(
      (p) =>
        `<tr><td style="padding:3px 12px 3px 0;text-transform:capitalize;">${p}</td><td style="padding:3px 8px;">${pct(platforms.searches[p] ?? 0)}</td><td style="padding:3px 0;">${pct(platforms.clicks[p] ?? 0)}</td></tr>`,
    )
    .join('');
  return `<table style="border-collapse:collapse;font-size:13px;"><thead><tr><th style="text-align:left;padding:3px 12px 3px 0;">Platform</th><th style="padding:3px 8px;">Searches</th><th style="padding:3px 0;">Clicks</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function section(title: string, body: string): string {
  return `<div style="margin:28px 0 0;"><h2 style="font-size:16px;font-weight:700;margin:0 0 12px;border-bottom:1px solid #e5e7eb;padding-bottom:6px;">${title}</h2>${body}</div>`;
}

export function buildEmailHtml(
  weekStart: string,
  analysis: AnalysisResult,
  metrics: MetricsSnapshot,
): string {
  const sortedActions = [...analysis.action_items].sort(
    (a, b) => priorityOrder(a.priority) - priorityOrder(b.priority),
  );
  const sortedFindings = [...analysis.findings].sort(
    (a, b) => severityOrder(a.severity) - severityOrder(b.severity),
  );

  const actionItems = sortedActions
    .map(
      (a) =>
        `<li style="margin:8px 0;"><strong>[${a.priority.toUpperCase()}]</strong> ${a.action}<br><span style="color:#6b7280;font-size:13px;">${a.rationale}</span></li>`,
    )
    .join('');

  const findings = sortedFindings
    .map(
      (f) =>
        `<li style="margin:10px 0;">${severityBadge(f.severity)} <strong>${f.metric}</strong><br>${f.observation}</li>`,
    )
    .join('');

  const openThreads = analysis.open_threads
    .map(
      (t: Thread) =>
        `<li style="margin:8px 0;"><strong>${t.thread}</strong> <span style="color:#9ca3af;font-size:12px;">(first flagged ${t.first_flagged})</span><br>${t.current_status}</li>`,
    )
    .join('');

  const resolvedThreads = analysis.resolved_threads
    .map((t) => `<li style="margin:6px 0;"><strong>${t.thread}</strong> — ${t.resolution}</li>`)
    .join('');

  const body = `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:680px;margin:0 auto;color:#111827;font-size:15px;line-height:1.6;">
  <div style="background:#111827;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:18px;font-weight:700;">LLMnesia weekly insights</h1>
    <p style="margin:4px 0 0;color:#9ca3af;font-size:13px;">Week of ${weekStart}</p>
  </div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">

    ${section('Summary', `<p style="margin:0;">${analysis.summary}</p>`)}

    ${section(
      'Action items',
      sortedActions.length > 0
        ? `<ul style="margin:0;padding-left:20px;">${actionItems}</ul>`
        : '<p style="color:#6b7280;">None this week.</p>',
    )}

    ${section(
      'Findings',
      sortedFindings.length > 0
        ? `<ul style="margin:0;padding-left:20px;">${findings}</ul>`
        : '<p style="color:#6b7280;">No significant findings.</p>',
    )}

    ${section(
      'Open threads',
      analysis.open_threads.length > 0
        ? `<ul style="margin:0;padding-left:20px;">${openThreads}</ul>`
        : '<p style="color:#6b7280;">No open threads.</p>',
    )}

    ${
      analysis.resolved_threads.length > 0
        ? section(
            'Resolved this week',
            `<ul style="margin:0;padding-left:20px;">${resolvedThreads}</ul>`,
          )
        : ''
    }

    ${section('Metrics snapshot', metricsTable(metrics) + '<br>' + platformTable(metrics.platforms))}

    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">
      Raw snapshot: <pre style="font-size:11px;overflow-x:auto;">${JSON.stringify(metrics, null, 2)}</pre>
    </div>
  </div>
</div>`;

  return body;
}

export async function sendEmail(
  weekStart: string,
  analysis: AnalysisResult,
  metrics: MetricsSnapshot,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is required');

  const from = process.env.RESEND_FROM_EMAIL ?? 'insights@yourdomain.com';
  const resend = new Resend(apiKey);

  const html = buildEmailHtml(weekStart, analysis, metrics);
  const subject = `LLMnesia weekly insights, week of ${weekStart}`;

  const { error } = await resend.emails.send({ from, to: TO, subject, html });

  if (error) throw new Error(`Resend failed: ${JSON.stringify(error)}`);
  console.log(`Email sent to ${TO}`);
}
