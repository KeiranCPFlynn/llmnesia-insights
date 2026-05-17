import { NextResponse } from 'next/server';
import { getHistoryBefore, getInsightByWeek, saveChat } from '../../../src/supabase.js';
import type { ChatMessage } from '../../../src/types.js';
import { callLlm, resolveProvider, type LlmTool } from '../../../src/llm.js';
import { isAuthorized } from '../../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SUGGEST_TOOL: LlmTool = {
  name: 'suggest_correction',
  description:
    'Call this when the founder gives information that should be saved and used to regenerate the report. Two kinds: "caveat" — data is false/skewed/an instrumentation artifact and you both agree what it really means; "context" — a real-world fact the data cannot show (a campaign, founder testing, seasonality, an outage). Only call after the founder has stated the information; do not invent it speculatively.',
  input_schema: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: ['caveat', 'context'],
        description:
          '"caveat" = this data is wrong/skewed; "context" = real-world info the data can\'t show.',
      },
      affected_metric: {
        type: 'string',
        description:
          'For a caveat: the metric/area it corrects, e.g. "Zero-result searches". For context: a short label, e.g. "Reddit campaign".',
      },
      note: {
        type: 'string',
        description:
          'One or two plain sentences stating it as authoritative fact for re-analysis. Caveat e.g. "The ~800 zero-result searches were a PostHog misconfig, not real users — ignore zero-result rate this week." Context e.g. "Installs are inflated: founder ran ~30 test installs while debugging."',
      },
    },
    required: ['kind', 'affected_metric', 'note'],
  },
};

function systemPrompt(insight: NonNullable<Awaited<ReturnType<typeof getInsightByWeek>>>, history: unknown) {
  return `You are helping the founder of LLMnesia interrogate ONE week's automated product report. Be concise, plain, and skeptical.

Your most important job: help separate real user signal from instrumentation noise. Analytics data is frequently misconfigured — events double-fire, releases break events, bots and the founder's own testing inflate counts, "zero-result searches" are often an indexing/instrumentation bug not real behaviour. When the founder questions a number, reason about whether a tracking artifact is the more likely explanation. Do not defend the numbers reflexively; the automated report can be wrong or overly negative.

When the founder confirms data is false/skewed and you agree on the real interpretation, OR gives real-world context the data can't show (a campaign, their own testing inflating numbers, seasonality, an outage), call the suggest_correction tool — kind "caveat" for bad data, kind "context" for real-world facts — so it can be saved and the report regenerated. Don't call it speculatively or without the founder actually stating the information.

THE WEEK (${insight.week_start} → ${insight.week_end}):

CURRENT REPORT:
${JSON.stringify({
  headline: insight.headline,
  summary: insight.summary,
  findings: insight.findings,
  action_items: insight.action_items,
})}

ALREADY-CONFIRMED CAVEATS (treat as fact, don't re-suggest):
${JSON.stringify(insight.corrections ?? [])}

RAW METRICS:
${JSON.stringify(insight.metrics_snapshot)}

PRIOR WEEKS (for trend context):
${JSON.stringify(history)}`;
}

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { week, messages, provider } = (await req.json().catch(() => ({}))) as {
    week?: string;
    messages?: ChatMessage[];
    provider?: string;
  };
  if (!week || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'week and messages are required' }, { status: 400 });
  }

  const insight = await getInsightByWeek(week);
  if (!insight) return NextResponse.json({ error: `No report for ${week}` }, { status: 404 });

  const history = await getHistoryBefore(week, 6);

  try {
    const response = await callLlm({
      provider: resolveProvider(provider),
      // Headroom so DeepSeek's reasoning tokens don't crowd out the reply.
      // Claude only bills what it uses, so a short answer stays cheap.
      maxTokens: 8000,
      tools: [SUGGEST_TOOL],
      toolChoice: 'auto',
      system: [{ text: systemPrompt(insight, history), cache: true }],
      messages: messages.map((m) => ({ role: m.role, blocks: [{ text: m.content }] })),
    });

    const suggestion = response.toolCall
      ? (response.toolCall.input as {
          kind: 'caveat' | 'context';
          affected_metric: string;
          note: string;
        })
      : null;

    const reply =
      response.text.trim() ||
      (suggestion
        ? `I've drafted a correction for "${suggestion.affected_metric}" — review it below and save if it's right.`
        : 'No response.');

    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: reply,
      ts: new Date().toISOString(),
    };

    // Persist the full thread (incoming messages already carry their own ts).
    await saveChat(week, [...messages, assistantMsg]);

    return NextResponse.json({ reply: assistantMsg, suggestion });
  } catch (e) {
    console.error('[chat] failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Chat failed' },
      { status: 500 },
    );
  }
}
