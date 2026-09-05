# @smartgrid/schema

Zod schemas for the SmartGrid config document. The single source of truth for what can be configured; both the assistant's tool definitions and the fallback forms are generated from these schemas.

## Concepts

- **Primitives** (`src/primitives`): `Scope`, `RowScope`, `Predicate`, `Rule`, `Style`, `DisplayFormat`, `Schedule`, `Icon`, `KeyBinding`, `ObjectMeta`, expression kinds. Shared by every module.
- **Modules** (`src/modules`): one schema per config slice (`layout`, `formatting`, …), each with a version constant.
- **Document** (`src/document.ts`): `GridConfig` envelope, `MODULES` registry, `parseGridConfig`, `createGridConfig`.
- **JSON Schema** (`src/jsonSchema.ts`): `moduleJsonSchema(id)`, `fragmentJsonSchema(schema)`, `collectEditorHints(schema)`.

## Editor hints

Every editable fragment carries `x-editor` metadata via `withEditor(schema, { 'x-editor': 'color', … })`. Zod 4's `.meta()` places it on the JSON Schema node, so `packages/forms` and the assistant resolve the same editor from the same hint. The list of hints is `EDITOR_HINTS` in `src/meta.ts` and mirrors `docs/ui-components-plan.md`.

```ts
import { FormatColumn, moduleJsonSchema } from '@smartgrid/schema';

const fc = FormatColumn.parse({
  id: 'neg', name: 'Negative red',
  scope: { kind: 'dataTypes', dataTypes: ['number'] },
  rule: { kind: 'predicates', predicates: [{ predicateId: 'Negative' }] },
  style: { foreColor: 'var(--sg-negative)' },
});

const json = moduleJsonSchema('formatting'); // feeds the LLM tool and the form renderer
```
