import type {
  ContextSource,
  EvidenceDelta,
  GitDigest,
  LedgerEntry,
  McpDigest,
  StrategyLedgerState,
} from '../src/types.js';

const CONFIDENCE: Record<string, string> = {
  high: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200',
  medium: 'border-amber-500/35 bg-amber-500/10 text-amber-200',
  low: 'border-neutral-600 bg-neutral-800 text-neutral-300',
};

function date(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value));
}

/** The durable strategy state, with the operating detail hidden until needed. */
export function LedgerOverview({
  ledger,
  evidence,
  entries,
  contextSources,
}: {
  ledger: StrategyLedgerState | null;
  evidence: EvidenceDelta | null;
  entries: LedgerEntry[];
  contextSources: ContextSource[];
}) {
  if (!ledger) {
    return (
      <section id="strategy-ledger" className="scroll-mt-36 mb-8 rounded-xl border border-dashed border-neutral-700 bg-neutral-900/50 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-300">Current direction</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-400">
          No published agent strategy yet. Open this repository in Codex or Claude Code and say <strong>Run the Insights review.</strong>
        </p>
      </section>
    );
  }

  const gitSources = contextSources.filter((source) => source.source_type === 'git');
  const mcpSources = contextSources.filter((source) => source.source_type === 'mcp');
  const gitCommits = gitSources.reduce((total, source) => {
    const digest = source.digest as Partial<GitDigest>;
    return total + (typeof digest.commits === 'number' ? digest.commits : 0);
  }, 0);
  const conversationCount = mcpSources.reduce((total, source) => {
    const digest = source.digest as Partial<McpDigest>;
    return total + (typeof digest.conversations === 'number' ? digest.conversations : 0);
  }, 0);
  const gitStatus = gitSources.length
    ? `${gitSources.length} repo${gitSources.length === 1 ? '' : 's'}${gitCommits ? ` · ${gitCommits} commit${gitCommits === 1 ? '' : 's'}` : ''}`
    : 'No Git provenance was saved for this review';
  const mcpStatus = mcpSources.length
    ? `${conversationCount} relevant conversation${conversationCount === 1 ? '' : 's'}`
    : 'No LLMnesia conversation provenance was saved for this review';

  return (
    <section id="strategy-ledger" className="scroll-mt-36 mb-8 rounded-xl border border-violet-400/20 bg-[linear-gradient(135deg,rgba(23,23,23,0.92),rgba(76,29,149,0.13))] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.22)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-300">2 · Current direction · Ledger v{ledger.version}</div>
          <h2 className="mt-2 max-w-4xl text-xl font-semibold leading-relaxed text-neutral-50">{ledger.north_star}</h2>
        </div>
        <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs font-medium text-violet-200">{ledger.stage}</span>
      </div>

      {ledger.stage_triggers.length > 0 && (
        <p className="mt-3 text-sm text-neutral-400">Next-stage triggers: {ledger.stage_triggers.join(' · ')}</p>
      )}

      {evidence?.notable_changes.length ? (
        <div className="mt-5 rounded-lg border border-white/[0.07] bg-black/15 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Evidence this week</div>
          <ul className="mt-2 space-y-1.5 text-sm text-neutral-300">
            {evidence.notable_changes.slice(0, 4).map((change) => (
              <li key={change.metric}><span className="font-medium text-neutral-100">{change.metric}:</span> {change.what_changed} <span className="text-neutral-500">({change.magnitude})</span></li>
            ))}
          </ul>
          {evidence.partial && (
            <p className="mt-3 text-xs leading-relaxed text-neutral-500">
              This is week-to-date. Incomplete totals are not ranked against a completed seven-day week.
            </p>
          )}
        </div>
      ) : null}

      <details className="mt-5 border-t border-white/[0.07] pt-4">
        <summary className="cursor-pointer text-sm font-medium text-neutral-300">What informed this review?</summary>
        <ul className="mt-3 space-y-2 text-sm text-neutral-400">
          <li><span className="font-medium text-neutral-200">Analytics:</span> PostHog, GA4, and available search evidence</li>
          <li><span className="font-medium text-neutral-200">Git:</span> {gitStatus}</li>
          <li><span className="font-medium text-neutral-200">Conversations:</span> {mcpStatus}</li>
        </ul>
      </details>

      <details className="mt-5 border-t border-white/[0.07] pt-4">
        <summary className="cursor-pointer text-sm font-medium text-neutral-300">See strategy details: hypotheses, initiatives, and questions</summary>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Active hypotheses</h3>
            {ledger.active_hypotheses.length ? (
              <ul className="mt-2 space-y-2">
                {ledger.active_hypotheses.map((hypothesis) => (
                  <li key={hypothesis.id} className="rounded-lg border border-neutral-800 bg-neutral-950/35 p-3">
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${CONFIDENCE[hypothesis.confidence]}`}>{hypothesis.confidence}</span>
                      <span className="text-xs capitalize text-neutral-500">{hypothesis.bet_type}</span>
                    </div>
                    <p className="mt-2 text-sm text-neutral-200">{hypothesis.claim}</p>
                    <p className="mt-1 text-xs text-neutral-500">Falsified when: {hypothesis.falsification}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-neutral-500">No validated hypotheses yet.</p>}
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Initiatives & questions</h3>
            <ul className="mt-2 space-y-2">
              {ledger.active_initiatives.map((initiative) => (
                <li key={initiative.id} className="rounded-lg border border-neutral-800 bg-neutral-950/35 p-3 text-sm text-neutral-200">
                  <span className="mr-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-200">{initiative.status}</span>{initiative.title}
                </li>
              ))}
              {ledger.open_questions.map((question) => (
                <li key={question.id} className="rounded-lg border border-neutral-800 bg-neutral-950/35 p-3 text-sm text-neutral-300">? {question.question}</li>
              ))}
              {!ledger.active_initiatives.length && !ledger.open_questions.length && <li className="text-sm text-neutral-500">No active initiatives or open questions.</li>}
            </ul>
          </div>
        </div>
      </details>

      {entries.length > 0 && (
        <details className="mt-5 border-t border-white/[0.07] pt-4">
          <summary className="cursor-pointer text-sm font-medium text-neutral-300">Ledger history ({entries.length} recent changes)</summary>
          <ul className="mt-3 space-y-2 text-sm text-neutral-400">
            {entries.slice(0, 8).map((entry) => (
              <li key={entry.id ?? `${entry.week_start}-${entry.target}`}><span className="text-neutral-500">{date(entry.created_at ?? entry.week_start)}</span> · {entry.operation} {entry.target ?? entry.entry_type}{entry.evidence ? ` — ${entry.evidence}` : ''}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
