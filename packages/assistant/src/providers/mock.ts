/**
 * Scripted provider for tests and the offline demo. A script is a function
 * of the conversation so far; it returns text and/or tool calls. The
 * default script answers a few demo prompts with realistic tool sequences
 * so the whole propose → validate → approve loop runs without a server.
 */
import type {
  ChatHandlers,
  ChatMessage,
  ChatRequest,
  ChatResult,
  HealthStatus,
  ModelProvider,
  ToolCall,
} from '../types.js';

export interface MockTurn {
  text?: string;
  toolCalls?: { name: string; args: Record<string, unknown> }[];
}

export type MockScript = (messages: ChatMessage[], request: ChatRequest) => MockTurn | Promise<MockTurn>;

let counter = 0;

export class MockProvider implements ModelProvider {
  readonly id = 'mock';
  readonly calls: ChatRequest[] = [];
  constructor(
    private readonly script: MockScript,
    private readonly opts: { delayMs?: number; healthy?: boolean } = {},
  ) {}

  async health(): Promise<HealthStatus> {
    return { ok: this.opts.healthy !== false, models: ['mock'], checkedAt: Date.now(), latencyMs: 1 };
  }

  async chat(request: ChatRequest, handlers: ChatHandlers = {}): Promise<ChatResult> {
    this.calls.push(request);
    if (this.opts.delayMs) await new Promise((r) => setTimeout(r, this.opts.delayMs));
    const turn = await this.script(request.messages, request);
    const text = turn.text ?? '';
    if (text) {
      // Stream in word-sized pieces so the UI path is exercised.
      for (const piece of text.match(/\S+\s*/g) ?? []) handlers.onText?.(piece);
    }
    const toolCalls: ToolCall[] = (turn.toolCalls ?? []).map((c) => ({
      id: `call_${++counter}`,
      name: c.name,
      arguments: JSON.stringify(c.args),
    }));
    for (const c of toolCalls) handlers.onToolCall?.(c);
    return { text, toolCalls, finishReason: toolCalls.length ? 'tool_calls' : 'stop', model: 'mock' };
  }
}

/** Last user message text and the tool results since it, for script authors. */
export function lastTurn(messages: ChatMessage[]): {
  user: string;
  toolResults: { name: string; content: string }[];
} {
  let user = '';
  const toolResults: { name: string; content: string }[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === 'user') {
      user = m.content;
      break;
    }
    if (m.role === 'tool') toolResults.unshift({ name: m.name, content: m.content });
  }
  return { user, toolResults };
}

/**
 * Demo script: understands a handful of phrasings and otherwise explains
 * what it can do. Each proposal goes through the real validator.
 */
export const demoScript: MockScript = (messages) => {
  const { user, toolResults } = lastTurn(messages);
  const u = user.toLowerCase();
  const proposed = toolResults.some((t) => t.name === 'propose_patch');
  if (proposed) {
    const last = toolResults.filter((t) => t.name === 'propose_patch').at(-1)!;
    const ok = /"ok":\s*true/.test(last.content);
    return {
      text: ok
        ? 'I have proposed the change above. Review it and press Apply, or tell me what to adjust.'
        : 'That proposal did not validate; I have corrected it and proposed again.',
    };
  }
  if (/group by desk/.test(u) || /group.*desk/.test(u)) {
    if (!toolResults.some((t) => t.name === 'get_config')) {
      return { toolCalls: [{ name: 'get_config', args: { module: 'layout' } }] };
    }
    const cfg = JSON.parse(toolResults.find((t) => t.name === 'get_config')!.content) as {
      data?: { currentLayoutId?: string; layouts?: { id: string }[] };
    };
    const layouts = cfg.data?.layouts ?? [];
    const idx = Math.max(
      0,
      layouts.findIndex((l) => l.id === cfg.data?.currentLayoutId),
    );
    const base = `/modules/layout/data/layouts/${idx}`;
    const groups = /then book/.test(u) ? ['desk', 'book'] : ['desk'];
    const ops: Record<string, unknown>[] = [
      { op: 'replace', path: `${base}/rowGroupColumns`, value: groups },
    ];
    if (/pin notional/.test(u))
      ops.push({ op: 'add', path: `${base}/columnPinning/notional`, value: 'right' });
    if (/sum/.test(u))
      ops.push({
        op: 'replace',
        path: `${base}/aggregations`,
        value: [
          { columnId: 'notional', aggFunc: 'sum' },
          { columnId: 'pnl', aggFunc: 'sum' },
        ],
      });
    return {
      toolCalls: [
        {
          name: 'propose_patch',
          args: {
            module: 'layout',
            title: `Group by ${groups.join(' then ')}`,
            rationale: 'Updates the current layout: row groups, pinning and aggregations as requested.',
            ops,
          },
        },
      ],
    };
  }
  if (/flash/.test(u) && /pnl/.test(u)) {
    const pct = /(\d+(?:\.\d+)?)\s*%/.exec(u)?.[1] ?? '2';
    return {
      toolCalls: [
        {
          name: 'propose_patch',
          args: {
            module: 'flashing',
            title: 'Flash PnL on large drops',
            rationale: `Flashes the PnL cell red when it drops more than ${pct}% from its previous value.`,
            ops: [
              {
                op: 'add',
                path: '/modules/flashing/data/flashingCells/-',
                value: {
                  id: 'flash-pnl-drop',
                  name: `PnL drop > ${pct}%`,
                  enabled: true,
                  readOnly: false,
                  tags: [],
                  source: 'assistant',
                  scope: { kind: 'columns', columnIds: ['pnl'] },
                  rule: { kind: 'expression', expression: `PERCENT_CHANGE([pnl], 'DECREASE') > ${pct}` },
                  target: 'cell',
                  duration: 1500,
                  downStyle: { backColor: { light: '#fecaca', dark: '#7f1d1d' }, font: { weight: 'bold' } },
                  columnGroupScope: 'both',
                },
              },
            ],
          },
        },
      ],
    };
  }
  if (/red/.test(u) && /(negative|loss|below zero|< ?0)/.test(u)) {
    const col = /pnl ?%|pnlpct/.test(u) ? 'pnlPct' : /notional/.test(u) ? 'notional' : 'pnl';
    return {
      toolCalls: [
        {
          name: 'propose_patch',
          args: {
            module: 'formatting',
            title: `Red ${col} when negative`,
            rationale: 'Adds a format column with a Negative predicate and a red foreground.',
            ops: [
              {
                op: 'add',
                path: '/modules/formatting/data/formatColumns/-',
                value: {
                  id: `fc-${col}-negative`,
                  name: `${col} negative`,
                  enabled: true,
                  readOnly: false,
                  tags: [],
                  source: 'assistant',
                  scope: { kind: 'columns', columnIds: [col] },
                  target: 'cell',
                  columnGroupScope: 'both',
                  rule: {
                    kind: 'predicates',
                    predicates: [{ predicateId: 'Negative', inputs: [] }],
                    operator: 'AND',
                  },
                  style: { foreColor: 'var(--sg-negative)', font: { weight: 'semibold' } },
                },
              },
            ],
          },
        },
      ],
    };
  }
  if (/undo/.test(u)) return { toolCalls: [{ name: 'undo', args: {} }] };
  if (/what columns|list columns|which columns/.test(u)) {
    if (!toolResults.some((t) => t.name === 'get_columns'))
      return { toolCalls: [{ name: 'get_columns', args: {} }] };
    const cols = JSON.parse(toolResults.find((t) => t.name === 'get_columns')!.content) as {
      id: string;
      header: string;
    }[];
    return { text: `The grid has ${cols.length} columns: ${cols.map((c) => c.header).join(', ')}.` };
  }
  return {
    text: 'I am the offline demo assistant. Try: "group by desk then book, pin notional right and sum it", "flash PnL red when it drops more than 2%", or "make negative PnL red".',
  };
};
