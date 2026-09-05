# SmartGrid — UI Component Plan (editors, pickers, and the assistant host)

> Companion to [smartgrid-plan.md](./smartgrid-plan.md). Defines the editing components needed to customise AG Grid, the contract that lets each one run unchanged inside a grid customizer **and** inside the AI assistant's chat as generative UI, and the decision on off-the-shelf assistant frameworks.

## 1. The principle: every editor is a controlled component over a schema fragment

Every knob a user can turn on the grid is a value in the config document, and every value has a Zod schema in `packages/schema`. An **editor** is a React component that edits exactly one schema fragment. It knows nothing about where it is mounted.

```ts
interface EditorProps<T> {
  value: T;
  onChange: (next: T) => void;
  schema?: ZodTypeAny;                     // the fragment it edits; used for constraints and defaults
  context: EditorContext;                  // columns, sample rows, theme, functions, predicates
  mode?: 'inline' | 'popover' | 'panel';   // density/layout only; behaviour identical
  readOnly?: boolean;
  errors?: PositionedError[];              // from the shared validator
  autoFocus?: boolean;
}

interface EditorContext {
  columns: ColumnInfo[];                   // id, header, cellDataType, sample values, distinct count
  sampleRows: Record<string, unknown>[];   // for previews and expression evaluation
  theme: 'light' | 'dark';
  functions: FunctionCatalog;              // AdaptableQL function metadata for palettes/completion
  predicates: PredicateCatalog;
  icons: IconCatalog;
}
```

Three consequences:

1. **The customizer is a form renderer.** `packages/forms` walks a module's JSON Schema, reads an `x-editor` hint on each node, and mounts the matching editor from an `EditorRegistry`. No hand-written panel per module.
2. **The assistant renders the same editors.** When the model proposes a patch, the chat shows a diff card whose fields are these editors in `inline` mode, so the user can nudge a colour or a threshold before approving. When the model needs a choice it cannot infer, it calls a `request_input` tool that renders the relevant picker (column, colour, icon) in the chat and waits for the answer.
3. **One registry, two hosts.** `EditorRegistry` maps `x-editor` id → component. The forms renderer and the assistant tool-UI layer both resolve through it, so adding an editor once adds it everywhere.

## 2. Inventory

Grouped by role. "Reuse" points at stern-bak source worth porting; "new" means nothing usable exists. Sizes are stern-bak LOC where a port is planned.

### 2.1 Value editors (atoms)

| Editor | `x-editor` | Edits | Used by modules | Reuse from stern-bak | Notes |
|---|---|---|---|---|---|
| ColorPicker | `color` | `Color` (hex/rgba/`var(--token)`), optional alpha, per-theme pair `{light, dark}` | formatting, styledColumns, flashing, alerts, chrome | `customizer/ui/ColorPicker/CompactColorField.tsx` (379), `format-editor/FormatColorPicker.tsx` (429), `GridColorPickerPopover.tsx` | Palette from design tokens (12 semantic + 20 swatches), recent colours, eyedropper where supported, theme-pair toggle |
| BorderEditor | `border` | `BorderSpec` per side: width, style, colour | formatting | `StyleEditor/BorderStyleEditor.tsx` (687) | Port and shrink; side selector + shared spec |
| FontStyleEditor | `fontStyle` | weight, italic, size (named scale + px), text decoration | formatting, styledColumns | `StyleEditor/TextSection` | — |
| AlignmentPicker | `alignment` | horizontal (L/C/R/justify) + vertical | formatting, styledColumns | `StyleEditor` | Icon toggle group |
| StyleEditor (composite atom) | `style` | full `Style` = colours + border + font + alignment + radius + className | formatting, flashing, alerts, quick search | `StyleEditor/StyleEditor.tsx` (128) + sections | One component, three layouts (`inline` strip / `popover` / `panel`) |
| DisplayFormatEditor | `displayFormat` | `DisplayFormat` union: number / string / date / template / excel / tick + presets | formatting, calculatedColumns, cellSummary | `FormatterPicker/*` (1,863), `format-editor/*` (800) | Merge the two into one with a `mode` prop; presets grouped by data type |
| ExpressionEditor | `expression` | AdaptableQL string with kind (`scalar` / `boolean` / `aggregated` / `observable`) | filters, formatting, styledColumns, flashing, calculatedColumns, alerts, editing, export | `ExpressionEditor/*` (1,413, CodeMirror 6) | Keep. Add: kind-aware function filtering, row preview, `QUERY()` completion, positioned errors from shared validator |
| PredicateEditor | `predicate` | `{ predicateId, inputs[] }` with data-type-aware predicate list | filters, formatting, alerts, flashing, styledColumns (badge) | new | Dropdown + typed inputs (0/1/2) matching AdapTable's 45 predicates |
| RuleEditor | `rule` | `Rule` = predicates[] (AND/OR) **or** expression, with a toggle | same as PredicateEditor | new | The "condition" step of every AdapTable wizard, as one component |
| ScopePicker | `scope` | `Scope` = All / DataTypes[] / ColumnIds[] / ColumnTypes[] | formatting, flashing, alerts, editing, export | new (ColumnPicker inside) | Segmented control + sub-picker |
| RowScopePicker | `rowScope` | exclude data / group / summary / total rows | formatting, styledColumns | new | Four checkboxes with preview |
| ColumnPicker | `column` / `columns` | one or many column ids, optional data-type filter, ordering | layout, filters, calculatedColumns, export, everywhere | `widget/column-selector/*` (854, dnd-kit) | Single-select combobox + multi-select ordered list |
| ColumnTypePicker | `columnType` | `cellDataType` incl. array types | calculatedColumns, freeTextColumns | new | — |
| IconPicker | `icon` | `Icon` = system name / custom src / emoji, with size | styledColumns (icon, badge), alerts, chrome, headers | `icons.tsx`, `icons-svg/DynamicIcon.tsx`, help `EmojiGallery` | Searchable grid over the 113-icon set + lucide + emoji; supports header icons and cell icons |
| ImagePicker | `image` | URL / data URI / asset id, with fit and size | styledColumns (icon `src`), headers | new | Upload or URL; preview |
| NumberField / RangeField | `number` / `range` | number with min/max/step; two-ended range | everywhere | `SettingsPanel/Stepper` | — |
| ScheduleEditor | `schedule` | `{ isOneOff, cron, runAt }` with presets | alerts, export | new | Cron presets + human-readable summary |
| KeyBindingEditor | `keys` | `IncrementKey`/`ShortcutKey` with modifiers | editing | new | Press-to-capture |
| DurationField | `duration` | ms or `'always'` | flashing, alerts | new | — |
| SelectValuesEditor | `values` | static list or data-provider binding for select editors / In filter | editing, filters | `column-customization/editors/CellEditorEditor.tsx` | — |
| DensityPicker | `density` | ultra / compact / comfort | chrome | `adapters/agGrid.ts` | — |

### 2.2 Composite editors (one per object kind)

Each is a thin composition of atoms following the object's schema. In the forms host these are generated; the hand-written versions below exist only where layout needs care.

| Editor | Edits | Composition |
|---|---|---|
| FormatColumnEditor | `FormatColumn` | ScopePicker + RowScopePicker + target toggle + RuleEditor + StyleEditor + DisplayFormatEditor |
| StyledColumnEditor | `StyledColumn` (8 variants) | ColumnPicker + variant tabs; per variant: range list (colour + `Col-Min/Max/Avg/Median` endpoints), badge rule list (RuleEditor + StyleEditor + IconPicker), sparkline options, bullet targets, rating options, range-bar bounds, icon mappings |
| FlashingEditor | `FlashingDefinition` | ScopePicker + RuleEditor + target + DurationField + 3 × StyleEditor |
| CalculatedColumnEditor | `CalculatedColumn` | kind tabs + ExpressionEditor (kind-aware) + ColumnTypePicker + column settings + preview column |
| AlertEditor | `AlertDefinition` | kind tabs (7) + ScopePicker + RuleEditor / ScheduleEditor + message template editor + behaviours checklist + StyleEditor for highlight + command buttons list |
| ColumnFilterEditor | `ColumnFilter` | PredicateEditor list with AND/OR + `In` value picker (distinct values, tree, lazy) |
| GridFilterEditor | `GridFilter` | ExpressionEditor (boolean) + save-as-named-query |
| LayoutEditor | `Layout` (table / pivot) | ordered ColumnPicker with per-column width/pin/caption/visibility; row-group order; aggregation map (incl. weighted average); pivot columns/values/totals; row selection options; row summaries |
| ReportEditor | `Report` | name + column scope + row scope (RuleEditor) + format + destination + ScheduleEditor |
| NudgeEditor / ShortcutEditor | editing objects | ScopePicker + NumberField + RuleEditor + KeyBindingEditor |
| CellRendererConfigEditor | renderer params | generated from a field descriptor on each registry entry (replaces stern-bak's 11 bespoke editors) |

### 2.3 Presentational components shared by both hosts

| Component | Purpose |
|---|---|
| PreviewCell | renders a single AG Grid-styled cell with the given style/format/renderer against a sample value; used inside editors for live preview |
| PatchDiffCard | shows a proposed patch as before/after per field, each field rendered by its editor in `inline` mode, with Approve / Edit / Reject |
| ObjectCard / ObjectList | list item for any config object: name, enabled toggle, tags, edit/clone/delete; the collection view for every module |
| ExplainTrace | "why does this cell look like this" — ordered list of rules that touched a cell, each linking to its editor |
| ValidationSummary | positioned errors from the shared validator, clickable to focus the offending editor |
| ColumnChip / ColumnBadge | consistent rendering of a column reference everywhere (name + type glyph) |

### 2.4 Host shells

| Shell | Role |
|---|---|
| CustomizerDrawer | the fallback grid customizer: module navigation + ObjectList + generated form (from `packages/forms`); supports popout to a real window (port stern-bak `PopoutPortal`) |
| AssistantPane | chat thread + streaming + tool UIs (PatchDiffCard, pickers) + health banner; collapses into the same drawer when the LLM is unavailable |
| Toolbar / ContextMenu / ColumnMenu | grid chrome that opens either shell at the right object |

## 3. Dual-host contract

What makes one component work in both places:

- **Controlled only.** No internal persistence. `value` in, `onChange` out. Hosts decide when to commit (form Save, or assistant Approve).
- **Three layout modes, one behaviour.** `inline` (chat card, toolbar strip), `popover` (anchored), `panel` (drawer). Sizes and chrome differ; keyboard model, validation and semantics do not.
- **Context is injected, never fetched.** Editors receive columns, sample rows and catalogues through `EditorContext` from a provider. The customizer fills it from the live grid; the assistant fills it from the same source; tests fill it with fixtures.
- **Validation is external.** Editors display `errors` they are given; they do not own validation logic. The shared validator in `packages/engine` produces the same errors for a form submit and for an assistant patch.
- **Schema drives defaults and constraints.** Min/max, enums, required flags come from the Zod fragment, so the editor and the LLM tool schema can never disagree.
- **Registry keyed by `x-editor`.** `packages/schema` annotates each fragment (`z.string().describe(...)` plus a `.meta({ 'x-editor': 'color' })` style hint exported into JSON Schema). Forms renderer and assistant tool-UI both resolve editors through `EditorRegistry.get(hint)`.
- **Theme and a11y from the design system.** Tokens only; every editor has dark/light parity, ARIA labels, and keyboard operation. Popouts inherit the host's theme via `applyTheme`.
- **Serialisable state only.** No functions or React nodes in `value`, so the same value can be sent to the LLM, stored, diffed and undone.

### How the assistant uses editors

| Assistant moment | Component | Mechanism |
|---|---|---|
| Model proposes a change | PatchDiffCard with inline editors | tool UI for `propose_patch`; user may edit fields, then Approve calls `apply` |
| Model needs a colour / column / icon it cannot infer | ColorPicker / ColumnPicker / IconPicker in `inline` mode | tool UI for `request_input({ editor, schema, prompt })`; the picked value is returned as the tool result |
| Model wants to show its work | PreviewCell, ExplainTrace | tool UI for `explain` |
| Model's expression fails validation | ExpressionEditor with `errors` | rendered from validator output; user can fix, or the model self-corrects |
| LLM unreachable | CustomizerDrawer | same registry, generated forms |

## 4. Off-the-shelf assistant frameworks

Requirements: OpenAI-compatible local server on `localhost:3000` today, other providers later; generative UI that renders **our** editors; human-in-the-loop approval; we own the propose → validate → apply loop with validator-driven self-correction; shadcn/Tailwind styling consistent with the design system; minimal backend for M3, optional gateway later; permissive licence.

| Option | What it gives | Fit | Concerns |
|---|---|---|---|
| **CopilotKit** | Full stack: `CopilotSidebar`/`CopilotPopup`/`CopilotChat`, `useCopilotReadable` (app state → context), `useComponent` (display generative UI), `useHumanInTheLoop` (approve flows with `respond`), frontend tools, `CopilotRuntime` server with OpenAI/Anthropic adapters and AG-UI/LangGraph agents, headless mode | Strong generative-UI and HITL primitives; fastest path to a polished chat | Requires its runtime endpoint and its agent loop; our validator-driven self-correction would sit inside or beside its loop rather than own it; larger dependency surface; commercial "Intelligence" tier signals where investment goes; adapter for a custom OpenAI-compatible base URL exists but is a second hop |
| **assistant-ui** | shadcn-based composable chat primitives (thread, composer, message parts), tool-call UI via `makeAssistantToolUI`, runtimes: Vercel AI SDK, LangGraph, AG-UI, `LocalRuntime` with a custom `ChatModelAdapter`, `ExternalStoreRuntime` where the app owns messages; MIT | Styles like our design system out of the box; we keep the loop (`LocalRuntime` adapter or external store); tool UIs render our editors directly; no mandated backend | Fewer batteries than CopilotKit; we write the agent loop (which we want to anyway) |
| **Vercel AI SDK** (core + `@ai-sdk/openai-compatible`) | `streamText` with tools, typed tool parts, multi-step loops, `createOpenAICompatible({ baseURL })`; provider swap to Anthropic is one import | Excellent as the **model-call layer**; browser-callable for a localhost server; no chat UI of its own (that's assistant-ui's job) | `useChat` expects a transport; for M3 we call core directly from a `ChatModelAdapter`, gateway route later |
| **Custom fetch** | thin client over `/v1/chat/completions` with tool parsing | Total control, zero deps | Re-implements streaming, tool-call accumulation, retries; not worth it given AI SDK core |

**Recommendation: assistant-ui for the chat host + Vercel AI SDK core with the OpenAI-compatible provider as the model layer + our own agent loop.** Rationale:

1. The loop is our product. Propose → validate → self-correct → diff card → apply → patch log is where the "world-class" part lives. Owning it means no framework's loop semantics leak into our behaviour.
2. Editors are host-agnostic by contract (section 3), so the chat host is swappable. If CopilotKit's HITL or AG-UI ecosystem becomes compelling, swapping the shell is a bounded change; the editors, schemas, tools and loop stay.
3. assistant-ui is shadcn-native, so it inherits our tokens without a theming layer; CopilotKit's default UI would need re-skinning.
4. AI SDK's `createOpenAICompatible({ baseURL: 'http://localhost:3000/v1' })` supports tool calling with streaming, which is exactly the local Copilot server case; adding Anthropic later is a provider import.

Decision is reversible; it is recorded in [smartgrid-plan.md](./smartgrid-plan.md) as such.

## 5. Package placement and build order

New package: **`packages/editors`** — the registry, atoms, composites, presentational components, host-agnostic. Depends on `schema`, `expressions` (for the ExpressionEditor's local validation and completion), `design-system`, `ui`. Does **not** depend on `engine`, `assistant`, or AG Grid.

Revised M0/M1 order, so components are designed first, not retrofitted:

1. Scaffold + design-system/ui extraction (unchanged).
2. `packages/schema` primitives **with `x-editor` hints** on every fragment.
3. `packages/editors`: registry + atoms (ColorPicker, StyleEditor, DisplayFormatEditor, ColumnPicker, ScopePicker, PredicateEditor, RuleEditor, IconPicker, ScheduleEditor) + PatchDiffCard + PreviewCell, each demonstrated in an **editor gallery** app page in three modes.
4. `packages/forms`: renderer that walks JSON Schema and resolves editors. First generated forms: FormatColumn, Layout.
5. `packages/expressions` (M1), then ExpressionEditor gets real completion and diagnostics.
6. Assistant (M3) mounts the same editors via assistant-ui tool UIs.

Acceptance for the editors milestone: every atom renders in `inline`, `popover` and `panel` modes in the gallery, in dark and light, keyboard-operable, with a round-trip test (value → editor → onChange → same value) and a snapshot per mode.
