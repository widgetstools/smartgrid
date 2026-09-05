# SmartGrid

AI-first configuration layer for AG Grid Enterprise. An assistant configures the grid from natural language; a lean schema-driven UI is the fallback when the LLM is unavailable. One config document, two producers, one validator.

- Vision: [docs/smartgrid-vision.md](docs/smartgrid-vision.md)
- Plan: [docs/smartgrid-plan.md](docs/smartgrid-plan.md)
- Components: [docs/ui-components-plan.md](docs/ui-components-plan.md)
- Expression language: [docs/expressions.md](docs/expressions.md)
- Feature reference: [docs/adaptable-tools-features.md](docs/adaptable-tools-features.md)
- Parity audit of the prior implementation: [docs/parity-stern-bak-vs-adaptable.md](docs/parity-stern-bak-vs-adaptable.md)

## Layout

```
apps/
  playground/      Vite + React demo: trading blotter, assistant pane, editor gallery
packages/
  schema/          Zod schemas per module, JSON Schema export with x-editor hints
  expressions/     AdaptableQL-compatible expression language
  engine/          Module pipeline (layout, formatting, calculated/styled columns, flashing, alerts, queries) + GridRuntime
  store/           StorageAdapter, IndexedDB + memory adapters, patch log, profiles
  editors/         Host-agnostic editing components + EditorRegistry
  forms/           Schema-driven form renderer (fallback customizer)
  assistant/       Model providers (OpenAI-compatible, mock), tool set, validator, session loop
  design-system/   Tokens, themes, AG Grid theme adapter, cell renderers, icons
  ui/              shadcn primitives + grid chrome
  react/           <AssistantPane>, useAssistant, schema-driven proposal editors
```

## Develop

```
npm install
npm run build
npm run test
npm run dev        # playground on http://localhost:5300
```

Playground routes: `#/` grid, `#/customizer` grid + customizer drawer (one form-driven tab per module plus the Assistant tab), `#/gallery` every editor in inline/popover/panel modes.

## Assistant

The Assistant tab talks to an OpenAI-compatible chat-completions server. Run it locally against the Copilot API server on port 3000:

```
npm install
npm run build                       # workspace packages resolve from dist/
npm run dev                         # http://localhost:5300/#/customizer → Assistant tab
SMARTGRID_LLM_URL=http://localhost:4000 npm run dev   # different LLM port
```

The dev server proxies `/llm/*` to `http://localhost:3000/*`, so the default base URL is `/llm/v1` and the browser never makes a cross-origin request. The gear icon sets the base URL, model (the health check lists what the server offers), optional API key and streaming; settings persist in localStorage. When the server cannot be reached the pane shows a banner, disables the composer and points at the module tabs, which edit the same document with forms. **Demo mode** swaps in a scripted provider so the full propose → validate → review → apply loop runs offline; try "group by desk then book, pin notional right and sum it".

Every proposal is a JSON Patch validated against the module schemas, the column ids and an engine dry run before it is shown; rows are editable inline with the same editors the forms use, and applied patches land in the store's revision log with the prompt, model and rationale.

Node 22+, npm workspaces, Turborepo, TypeScript 5.9, Vite 8, Vitest 5, AG Grid Enterprise 36, React 19, Tailwind 4.
