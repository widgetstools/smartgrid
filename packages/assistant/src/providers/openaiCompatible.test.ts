import { describe, expect, it } from 'vitest';
import { OpenAiCompatibleProvider, readSse } from './openaiCompatible.js';
import type { ToolCall } from '../types.js';

function sse(events: unknown[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const chunks = events.map((e) => (typeof e === 'string' ? e : `data: ${JSON.stringify(e)}\n\n`));
  // Split at awkward byte boundaries to exercise buffering.
  const text = chunks.join('');
  const parts = [text.slice(0, 17), text.slice(17, 40), text.slice(40)];
  return new ReadableStream({
    start(controller) {
      for (const p of parts) controller.enqueue(enc.encode(p));
      controller.close();
    },
  });
}

describe('readSse', () => {
  it('accumulates text deltas and tool-call argument fragments', async () => {
    const stream = sse([
      { choices: [{ delta: { content: 'Hel' } }], model: 'gpt-x' },
      { choices: [{ delta: { content: 'lo' } }] },
      {
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, id: 'c1', function: { name: 'get_config', arguments: '{"mod' } }],
            },
          },
        ],
      },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ule":"layout"}' } }] } }] },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
      { choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } },
      'data: [DONE]\n\n',
    ]);
    const deltas: string[] = [];
    const calls: ToolCall[] = [];
    const r = await readSse(stream, { onText: (d) => deltas.push(d), onToolCall: (c) => calls.push(c) });
    expect(r.text).toBe('Hello');
    expect(deltas.join('')).toBe('Hello');
    expect(r.toolCalls).toEqual([{ id: 'c1', name: 'get_config', arguments: '{"module":"layout"}' }]);
    expect(calls).toHaveLength(1);
    expect(r.finishReason).toBe('tool_calls');
    expect(r.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
    expect(r.model).toBe('gpt-x');
  });

  it('throws on an error chunk', async () => {
    const stream = sse([{ error: { message: 'quota exceeded' } }]);
    await expect(readSse(stream, {})).rejects.toThrow('quota exceeded');
  });
});

describe('OpenAiCompatibleProvider', () => {
  it('sends the chat-completions request shape and parses a non-streaming reply', async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const fakeFetch: typeof fetch = async (url, init) => {
      captured = { url: String(url), init: init ?? {} };
      return new Response(
        JSON.stringify({
          model: 'm',
          choices: [
            {
              message: {
                content: null,
                tool_calls: [{ id: 'a', function: { name: 'get_columns', arguments: '{}' } }],
              },
              finish_reason: 'tool_calls',
            },
          ],
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    };
    const provider = new OpenAiCompatibleProvider({
      baseUrl: 'http://localhost:3000/v1/',
      apiKey: 'k',
      fetch: fakeFetch,
      stream: false,
    });
    const r = await provider.chat({
      model: 'm',
      messages: [
        { role: 'system', content: 's' },
        { role: 'user', content: 'u' },
        { role: 'assistant', content: null, tool_calls: [{ id: 'a', name: 'get_columns', arguments: '{}' }] },
        { role: 'tool', tool_call_id: 'a', name: 'get_columns', content: '[]' },
      ],
      tools: [{ name: 'get_columns', description: 'd', parameters: { type: 'object', properties: {} } }],
      temperature: 0,
    });
    expect(captured?.url).toBe('http://localhost:3000/v1/chat/completions');
    const body = JSON.parse(String(captured?.init.body)) as Record<string, unknown>;
    expect(body['stream']).toBe(false);
    expect(body['temperature']).toBe(0);
    expect(body['tools']).toEqual([
      {
        type: 'function',
        function: { name: 'get_columns', description: 'd', parameters: { type: 'object', properties: {} } },
      },
    ]);
    expect((body['messages'] as unknown[])[2]).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'a', type: 'function', function: { name: 'get_columns', arguments: '{}' } }],
    });
    expect((captured?.init.headers as Record<string, string>)['authorization']).toBe('Bearer k');
    expect(r.toolCalls).toEqual([{ id: 'a', name: 'get_columns', arguments: '{}' }]);
    expect(r.finishReason).toBe('tool_calls');
  });

  it('reports HTTP failures and unreachable servers through health()', async () => {
    const down = new OpenAiCompatibleProvider({
      baseUrl: 'http://localhost:1',
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });
    const h = await down.health();
    expect(h.ok).toBe(false);
    expect(h.error).toBe('fetch failed');

    const up = new OpenAiCompatibleProvider({
      baseUrl: 'http://localhost:3000/v1',
      fetch: async () => new Response(JSON.stringify({ data: [{ id: 'gpt-4.1' }, { id: 'claude' }] })),
    });
    const ok = await up.health();
    expect(ok.ok).toBe(true);
    expect(ok.models).toEqual(['gpt-4.1', 'claude']);
  });

  it('wraps HTTP errors from chat with the status', async () => {
    const provider = new OpenAiCompatibleProvider({
      baseUrl: 'http://x',
      fetch: async () => new Response('nope', { status: 401 }),
    });
    await expect(provider.chat({ model: 'm', messages: [{ role: 'user', content: 'u' }] })).rejects.toThrow(
      'HTTP 401: nope',
    );
  });
});
