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
  assistant/       Model layer, tool set, agent loop
  design-system/   Tokens, themes, AG Grid theme adapter, cell renderers, icons
  ui/              shadcn primitives + grid chrome
  react/           <SmartGrid>, <AssistantPane>, hooks
```

## Develop

```
npm install
npm run build
npm run test
npm run dev        # playground on http://localhost:5300
```

Playground routes: `#/` grid, `#/customizer` grid + form-driven customizer drawer (format columns, layouts, mock assistant proposal), `#/gallery` every editor in inline/popover/panel modes.

Node 22+, npm workspaces, Turborepo, TypeScript 5.9, Vite 8, Vitest 5, AG Grid Enterprise 36, React 19, Tailwind 4.
