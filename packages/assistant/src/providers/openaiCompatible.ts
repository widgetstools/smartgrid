/**
 * OpenAI-compatible chat-completions client (streaming, tool calls). Works
 * against the local Copilot proxy (`http://localhost:3000/v1`), OpenAI,
 * Azure gateways, vLLM, LM Studio and Ollama's OpenAI endpoint. No SDK: a
 * fetch call and an SSE reader keep the surface transparent and debuggable.
 */
import type {
  ChatHandlers,
  ChatRequest,
  ChatResult,
  HealthStatus,
  ModelProvider,
  ToolCall,
} from '../types.js';

export interface OpenAiCompatibleOptions {
  /** e.g. http://localhost:3000/v1 (no trailing slash needed). */
  baseUrl: string;
  apiKey?: string;
  /** Extra headers (e.g. `Copilot-Integration-Id`). */
  headers?: Record<string, string>;
  /** Use streaming (default true). Some servers only support non-streaming tool calls. */
  stream?: boolean;
  fetch?: typeof fetch;
  /** Request timeout in ms (default 60s). */
  timeoutMs?: number;
}

interface DeltaToolCall {
  index?: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface ChunkChoice {
  delta?: { content?: string | null; tool_calls?: DeltaToolCall[] };
  message?: { content?: string | null; tool_calls?: DeltaToolCall[] };
  finish_reason?: string | null;
}

interface ChunkBody {
  choices?: ChunkChoice[];
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export class OpenAiCompatibleProvider implements ModelProvider {
  readonly id: string;
  private readonly opts: OpenAiCompatibleOptions;

  constructor(opts: OpenAiCompatibleOptions) {
    this.opts = { ...opts, baseUrl: opts.baseUrl.replace(/\/+$/, '') };
    this.id = `openai-compatible:${this.opts.baseUrl}`;
  }

  private get fetchFn(): typeof fetch {
    // Browsers require `fetch` to be called with the global as `this`; a bare
    // method call on the provider would throw "Illegal invocation".
    return this.opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json', ...(this.opts.headers ?? {}) };
    if (this.opts.apiKey) h['authorization'] = `Bearer ${this.opts.apiKey}`;
    return h;
  }

  async health(): Promise<HealthStatus> {
    const started = Date.now();
    try {
      const res = await this.fetchFn(`${this.opts.baseUrl}/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 5000),
      });
      if (!res.ok)
        return {
          ok: false,
          error: `HTTP ${res.status}`,
          checkedAt: Date.now(),
          latencyMs: Date.now() - started,
        };
      const body = (await res.json().catch(() => ({}))) as { data?: { id?: string }[] };
      const models = (body.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string');
      return { ok: true, models, checkedAt: Date.now(), latencyMs: Date.now() - started };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e), checkedAt: Date.now() };
    }
  }

  async chat(request: ChatRequest, handlers: ChatHandlers = {}): Promise<ChatResult> {
    const stream = this.opts.stream !== false;
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map(toWire),
      stream,
    };
    if (request.tools?.length) {
      body['tools'] = request.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
      if (request.toolChoice) body['tool_choice'] = request.toolChoice;
    }
    if (request.temperature !== undefined) body['temperature'] = request.temperature;
    if (request.maxTokens !== undefined) body['max_tokens'] = request.maxTokens;
    if (stream) body['stream_options'] = { include_usage: true };

    const signal = request.signal ?? AbortSignal.timeout(this.opts.timeoutMs ?? 60_000);
    let res: Response;
    try {
      res = await this.fetchFn(`${this.opts.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (signal.aborted) return { text: '', toolCalls: [], finishReason: 'aborted' };
      throw new Error(`Model request failed: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Model server returned HTTP ${res.status}${text ? `: ${text.slice(0, 300)}` : ''}`);
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (stream && contentType.includes('text/event-stream') && res.body) {
      return readSse(res.body, handlers, signal);
    }
    const json = (await res.json()) as ChunkBody;
    if (json.error?.message) throw new Error(json.error.message);
    const choice = json.choices?.[0];
    const text = choice?.message?.content ?? '';
    const toolCalls = (choice?.message?.tool_calls ?? []).map((c, i) => ({
      id: c.id ?? `call_${i}`,
      name: c.function?.name ?? '',
      arguments: c.function?.arguments ?? '{}',
    }));
    if (text) handlers.onText?.(text);
    for (const c of toolCalls) handlers.onToolCall?.(c);
    return {
      text,
      toolCalls,
      finishReason: toolCalls.length ? 'tool_calls' : finish(choice?.finish_reason),
      usage: usageOf(json),
      model: json.model,
    };
  }
}

function toWire(m: ChatRequest['messages'][number]): Record<string, unknown> {
  switch (m.role) {
    case 'assistant':
      return {
        role: 'assistant',
        content: m.content,
        ...(m.tool_calls?.length
          ? {
              tool_calls: m.tool_calls.map((c) => ({
                id: c.id,
                type: 'function',
                function: { name: c.name, arguments: c.arguments },
              })),
            }
          : {}),
      };
    case 'tool':
      return { role: 'tool', tool_call_id: m.tool_call_id, name: m.name, content: m.content };
    default:
      return { role: m.role, content: m.content };
  }
}

function finish(reason: string | null | undefined): ChatResult['finishReason'] {
  if (reason === 'tool_calls' || reason === 'function_call') return 'tool_calls';
  if (reason === 'length') return 'length';
  return 'stop';
}

function usageOf(body: ChunkBody): ChatResult['usage'] {
  return body.usage
    ? { promptTokens: body.usage.prompt_tokens, completionTokens: body.usage.completion_tokens }
    : undefined;
}

/** Parse an SSE stream of chat-completion chunks into text deltas and complete tool calls. */
export async function readSse(
  body: ReadableStream<Uint8Array>,
  handlers: ChatHandlers,
  signal?: AbortSignal,
): Promise<ChatResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let finishReason: ChatResult['finishReason'] = 'stop';
  let usage: ChatResult['usage'];
  let model: string | undefined;
  const calls = new Map<number, { id: string; name: string; arguments: string }>();

  const handleChunk = (chunk: ChunkBody) => {
    if (chunk.error?.message) throw new Error(chunk.error.message);
    if (chunk.model) model = chunk.model;
    if (chunk.usage) usage = usageOf(chunk);
    const choice = chunk.choices?.[0];
    if (!choice) return;
    const delta = choice.delta ?? choice.message;
    if (delta?.content) {
      text += delta.content;
      handlers.onText?.(delta.content);
    }
    for (const tc of delta?.tool_calls ?? []) {
      const index = tc.index ?? calls.size;
      const existing = calls.get(index) ?? { id: '', name: '', arguments: '' };
      if (tc.id) existing.id = tc.id;
      if (tc.function?.name) existing.name += tc.function.name;
      if (tc.function?.arguments) existing.arguments += tc.function.arguments;
      calls.set(index, existing);
    }
    if (choice.finish_reason) finishReason = finish(choice.finish_reason);
  };

  try {
    for (;;) {
      if (signal?.aborted) {
        await reader.cancel();
        return { text, toolCalls: [], finishReason: 'aborted' };
      }
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '' || data === '[DONE]') continue;
        let chunk: ChunkBody;
        try {
          chunk = JSON.parse(data) as ChunkBody;
        } catch {
          continue;
        }
        handleChunk(chunk);
      }
    }
  } finally {
    reader.releaseLock();
  }

  const toolCalls: ToolCall[] = [...calls.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([i, c]) => ({ id: c.id || `call_${i}`, name: c.name, arguments: c.arguments || '{}' }));
  for (const c of toolCalls) handlers.onToolCall?.(c);
  return {
    text,
    toolCalls,
    finishReason: toolCalls.length ? 'tool_calls' : finishReason,
    usage,
    model,
  };
}
