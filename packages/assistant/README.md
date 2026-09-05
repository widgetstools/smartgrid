# @smartgrid/assistant

Framework-agnostic assistant loop over the SmartGrid config document: a model
proposes JSON Patches, the validator checks them against the module schemas,
the column list and the engine, and the host applies approved proposals
through the `ConfigStore`.

```ts
import { AssistantSession, OpenAiCompatibleProvider } from '@smartgrid/assistant';

const provider = new OpenAiCompatibleProvider({ baseUrl: 'http://localhost:3000/v1' });
const session = new AssistantSession({ provider, model: 'gpt-4.1', store, getColumns: () => columns });
session.subscribe((event) => render(session.state));
await session.send('group by desk then book, pin notional right and sum it');
// session.state.proposals[0] is validated; nothing is applied until:
await session.approve(session.state.proposals[0].id);
```

## Model server expectations

`OpenAiCompatibleProvider` talks to any OpenAI-compatible chat-completions
endpoint (the local Copilot proxy on port 3000, OpenAI, Azure gateways, vLLM,
LM Studio, Ollama's `/v1`):

| Call                              | Used for                                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `GET {baseUrl}/models`            | health check; the returned ids populate the model picker                                                               |
| `POST {baseUrl}/chat/completions` | one call per loop step, with `tools: [{ type: 'function', function }]`, `stream: true`, `stream_options.include_usage` |

Streaming responses are read as SSE (`data: {...}` chunks, `[DONE]` sentinel);
tool-call argument fragments are accumulated by `index`. When the server
answers with `application/json` instead of an event stream the reply is parsed
as a non-streaming completion, so servers without streaming tool calls work
with `stream: false`.

If the local server turns out to differ (a different path, a JSON-in-text
tool-call format), adapt it in `src/providers/openaiCompatible.ts`; the loop,
validator and UI only see `ModelProvider`.

## Pieces

- `types.ts` — provider, tool, proposal and session contracts.
- `providers/openaiCompatible.ts` — the HTTP client; `readSse` is exported for tests.
- `providers/mock.ts` — `MockProvider` runs a script; `demoScript` handles the playground demo prompts.
- `validator.ts` — `validatePatch(config, patch, columns)`: path policy, apply on a clone, Zod parse per module, column-id checks (suggests the id when a header was used), engine dry run.
- `prompt.ts` — the system prompt (document shape, patch rules, module summaries, columns).
- `tools.ts` — `get_columns`, `get_config`, `get_module_schema`, `list_functions`, `list_predicates`, `validate_expression`, `propose_patch`, `undo`, `explain`.
- `session.ts` — `AssistantSession`: the loop, proposals, approve/reject/undo, health.

No React here; the pane lives in `@smartgrid/react`.
