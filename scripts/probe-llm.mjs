#!/usr/bin/env node
/**
 * Probe an OpenAI-compatible server the way the assistant uses it, and print
 * the raw shapes so a mismatch is obvious:
 *   1. GET  /models
 *   2. POST /chat/completions (non-streaming) with one tool the model should call
 *   3. POST /chat/completions (streaming) with the same tool; prints the first chunks
 *
 * Usage: node scripts/probe-llm.mjs [baseUrl] [model]
 *   baseUrl defaults to $SMARTGRID_LLM_URL/v1 or http://localhost:3000/v1
 *   model defaults to the first id returned by /models
 */
const baseUrl = (process.argv[2] ?? `${process.env.SMARTGRID_LLM_URL ?? 'http://localhost:3000'}/v1`).replace(
  /\/+$/,
  '',
);
const apiKey = process.env.SMARTGRID_LLM_KEY;
const headers = {
  'content-type': 'application/json',
  ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
};

const tool = {
  type: 'function',
  function: {
    name: 'get_columns',
    description: 'List the grid columns.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
};
const messages = [
  { role: 'system', content: 'You configure a data grid. Always call get_columns before answering.' },
  { role: 'user', content: 'Which columns does the grid have?' },
];

function section(title) {
  console.log(`\n=== ${title} ===`);
}
function show(label, value) {
  console.log(`${label}: ${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}`);
}

section(`1. GET ${baseUrl}/models`);
let model = process.argv[3];
try {
  const res = await fetch(`${baseUrl}/models`, { headers });
  show('status', `${res.status} ${res.headers.get('content-type')}`);
  const body = await res.json().catch(() => undefined);
  const ids = (body?.data ?? []).map((m) => m.id);
  show('model ids', ids);
  model ??= ids[0];
} catch (e) {
  show('error', e.message);
}
if (!model) {
  console.log('\nNo model id; pass one as the second argument.');
  process.exit(1);
}
show('using model', model);

section(`2. POST ${baseUrl}/chat/completions (stream: false, tools)`);
try {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, tools: [tool], stream: false, temperature: 0 }),
  });
  show('status', `${res.status} ${res.headers.get('content-type')}`);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    show('non-JSON body', text.slice(0, 800));
  }
  if (json) {
    const choice = json.choices?.[0];
    show('finish_reason', choice?.finish_reason);
    show('message', choice?.message);
    if (json.error) show('error', json.error);
  }
} catch (e) {
  show('error', e.message);
}

section(`3. POST ${baseUrl}/chat/completions (stream: true, tools)`);
try {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      tools: [tool],
      stream: true,
      temperature: 0,
      stream_options: { include_usage: true },
    }),
  });
  show('status', `${res.status} ${res.headers.get('content-type')}`);
  if (!res.body) {
    show('body', await res.text());
  } else {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let shown = 0;
    let total = 0;
    const calls = new Map();
    let content = '';
    let finish;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        if (!line.trim()) continue;
        total++;
        if (shown < 8) {
          console.log(`  raw> ${line.slice(0, 300)}`);
          shown++;
        }
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const chunk = JSON.parse(data);
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.content) content += delta.content;
          for (const tc of delta?.tool_calls ?? []) {
            const i = tc.index ?? 0;
            const cur = calls.get(i) ?? { id: '', name: '', arguments: '' };
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.name += tc.function.name;
            if (tc.function?.arguments) cur.arguments += tc.function.arguments;
            calls.set(i, cur);
          }
          if (chunk.choices?.[0]?.finish_reason) finish = chunk.choices[0].finish_reason;
        } catch {
          console.log(`  (unparseable data line) ${data.slice(0, 120)}`);
        }
      }
    }
    show('lines', total);
    show('finish_reason', finish);
    show('content', content);
    show('tool calls', [...calls.values()]);
  }
} catch (e) {
  show('error', e.message);
}

console.log(
  '\nExpected: /models lists ids; both calls finish with finish_reason "tool_calls" and a get_columns call. If the tool call arrives as text instead, or the stream is not "data:" SSE lines, adapt packages/assistant/src/providers/openaiCompatible.ts.',
);
