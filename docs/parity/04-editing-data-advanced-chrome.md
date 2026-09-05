# Parity audit — Editing, Annotating, Data, Advanced & UI Chrome

stern-bak (`widgetstools/stern-bak` @ `5a248ad`) versus AdapTable for AG Grid v23. Every status was verified against source. Paths are relative to the stern-bak repo root.

---

## Editing

| Feature | AdapTable | stern-bak status | Evidence | Gap notes |
|---|---|---|---|---|
| Smart Edit — arithmetic ops | 4 ops + `customOperations` | **Partial** | `core/engine/src/customizer/modules/smart-edit/operations.ts` `applyNumericOp`; `state.ts` `SmartEditOp` (+ extra `set`) | Closed union; no custom-op hook |
| Smart Edit — preview | Yes | **Full** | `react-grid/.../smart-edit/SmartEditToolbarBody.tsx` preview table; `editing-core/previewPatches.ts` | Gated by `previewBeforeApply` (default false) |
| Smart Edit — tri-state validation | Yes | **Partial** | `EditPreviewResult { allValid, someInvalid, allInvalid }` | Plumbing complete but `editing-core/validation.ts` `defaultEditValidator()` **always returns `'valid'`**; nothing computes invalid |
| Smart Edit — single column | implicit | **Full** | `editing-core/selectionGuards.ts` `assertSingleColumnSelection` | Labelled "AdapTable parity" |
| Smart Edit — surfaces | Toolbar, Tool Panel, context menu | **Partial** | toolbar segment + settings drawer | No tool panel or context menu |
| Bulk Update | Yes | **Full (Different)** | `bulk-update/{applyBulkUpdate,collectBulkUpdateTargets,resolveColumnDistinctValues}.ts`; `BulkUpdateToolbarBody.tsx` | `maxDropdownValues`, `confirmThreshold`; no `customEditColumnValues`, no status bar/tool panel |
| Plus/Minus — scope | ColumnScope | **Partial** | `plus-minus/state.ts` `{ columnIds }`; `resolveNudgeForCell.ts` | No DataTypes/ColumnTypes |
| Plus/Minus — value | `NudgeValue` | **Full** | `incrementStep`, `decrementStep` | Asymmetric steps (superset) |
| Plus/Minus — rule | expression | **Full** | `expressionAllows` → `engine.parseAndEvaluate` | First match wins |
| Plus/Minus — custom keys / modifiers | Yes | **Missing** | `runtime/activate.ts` `directionFromKey` hard-coded `+`/`=`/`-` | — |
| Shortcuts | letter key **while editing** | **Different** | `shortcuts/state.ts` `ShortcutDefinition`; `matchShortcut.ts`; `runtime/activate.ts` | **Inverted trigger**: fires on selected cells when **not** editing; applies to whole selection |
| Select cell editor | Rich Select | **Full** | `CellEditorEditor.tsx` (`agSelectCellEditor`, `agRichSelectCellEditor`); `transforms.ts:837-866` | Per-column config |
| Numeric editor | spinner, shortcuts, clear button | **Partial** | `agNumberCellEditor` + min/max/step/precision | Stock; no clear/empty params; shortcuts don't fire inside editor |
| Date editor | AdapTable picker + options | **Partial** | `agDateCellEditor` | Native only; `ToolbarDatePicker.tsx` is toolbar-only |
| Percentage editor | Yes | **Missing** | 7 kinds, none percentage | — |
| Custom edit column values | runtime callback | **Different** | `SelectValuesEditor` static list + `AppDataSourcePicker` (`{{provider.key}}`); `buildValuesGetter` | Declarative provider binding; values only, no labels |
| Pre-edit editability callback | `isCellEditable(ctx)` | **Partial** | `formattingActions.ts:283-300` `setColumnEditable`; `colDef/types.ts:127` `editable?: boolean` | Static boolean, no row-level predicate |
| Client validation (`PreventEdit`) | Yes | **Missing** | zero hits; `AlertRule` cannot veto | — |
| Server validation hook | Yes | **Missing** | zero hits | — |
| DCH — monitor grid | Yes | **Different** | `data-change-history/EditHistoryMonitor.tsx` virtualised list over `EditJournalEntry[]` | Batches per apply, not per cell |
| DCH — undo one | Yes | **Full** | `EditJournal.ts:137` `canUndoEntry`; `journalUndoRedo.ts` | — |
| DCH — undo all | Yes | **Missing** | `reset()` clears without reverting | stern-bak adds **Redo** instead |
| DCH — modes | 4 | **Partial** | `settings.enabled`, `settings.suspended` | No "Inactive"; adds per-source `recordSources` |
| DCH — max in store | Yes | **Full** | `maxEntries` 50 | — |
| DCH — `showDataChange` filters | Yes | **Missing** | — | — |
| DCH — custom button column | Yes | **Missing** | — | — |
| Edited-cell styling | Yes | **Missing** | zero hits | Nearest: transient cell-change flash |
| Row Forms | create/clone/edit/delete | **Missing** | zero hits; config-browser `RowDrawer` edits config rows | — |
| Row Form field overrides | Yes | **Missing** | — | — |
| Action Columns | Yes | **Missing** | all 24 renderers display-only | — |

## Annotating

| Feature | AdapTable | stern-bak status | Evidence | Gap notes |
|---|---|---|---|---|
| Notes | Yes | **Missing** | none of the 15 engine modules | — |
| Comments | Yes | **Missing** | — | — |
| Free Text Columns | Yes | **Missing** | no per-PK value store; calculated columns are derived | Structural gap |

## Data

| Feature | AdapTable | stern-bak status | Evidence | Gap notes |
|---|---|---|---|---|
| System reports | 3 | **Partial** | `visual-excel/exportVisualExcel.ts` `{ onlySelected, exportedRows }` | Ad-hoc options, not named reports; toolbar calls with no args |
| Custom Reports | persisted `Report` | **Missing** | no `Report` types | — |
| Visual Excel | WYSIWYG | **Full** | `exportVisualExcel.ts`; `buildVisualExcelStyles.ts`, `cellStyleToExcelStyle.ts`, `cssToExcelColor.ts` | Strongest export feature |
| Excel / CSV / JSON | 4 formats | **Partial** | AG Grid stock context-menu items | **No JSON** |
| Destinations | Download / Clipboard / custom + form | **Partial** | download only; clipboard settings are for copy | — |
| Filename / timestamp / sheet options | Yes | **Partial** | `defaultVisualExcelFileName` → `<prefix>-<gridId>-YYYY-MM-DD.xlsx` | Always stamped; no sheet name, `isColumnExportable`, `exportDataFormat` |
| Scheduled reports | cron | **Missing** | `conditional-styling/runtime/schedulers.ts` is for style windows | — |
| Import wizard | Yes | **Missing** | config-browser/OpenFin importers move config, not rows | — |
| Charts | persisted | **Missing** | — | — |
| Scheduling shared object | Yes | **Missing** | alerts have `debounceMs` only | — |

## Advanced

| Feature | AdapTable | stern-bak status | Evidence | Gap notes |
|---|---|---|---|---|
| Team Sharing | snapshot/active/referenced, `Revision` | **Partial (Different)** | `profiles/types.ts` `ExportedProfilePayload`; `ProfileManager.export()/import()`; `host-config/src/visibility.ts` `isPublic`; `profileBundle.ts`; `ProfileSetVersionConflictError` | Whole-profile, file or public row; no per-entity share, no Active mode, no dependencies, no Share button |
| Entitlements per module | Full/ReadOnly/Hidden | **Different** | `host-config/src/ConfigManager.ts` roles/permissions; `effectiveUser.ts` | Config-row permissions, not module access levels |
| `defaultAccessLevel` | Yes | **Missing** | — | — |
| Object-level `IsReadOnly` | Yes | **Missing** | rules have `enabled` ≈ suspend only | — |
| State hooks (load/apply/save/persist/clear) | 5 callbacks | **Different (equivalent)** | `persistence/StorageAdapter.ts` (`loadProfile/saveProfile/deleteProfile/listProfiles` + `subscribeToChanges`); `MemoryAdapter`, `LocalStorageBundleAdapter`, `createConfigServiceStorage()` | Adapter interface; no `applyState` transform; cross-tab subscribe is a superset |
| Persist debounce | 400 ms | **Full** | `autoSaveDebounceMs` 300 | — |
| Per-section `Revision` (Override / KeepUserDefined) | Yes | **Missing** | `GridPlatform.ts:148,208-214` `schemaVersion` + `migrate` only | **No way to push new design-time defaults into saved profiles** except destructive `resetToSeed()` |
| Migration helper | Yes | **Full (Different)** | per-module `schemaVersion` + `migrate?(raw, fromVersion)`; `host-config/src/migrations/profiles-v1.ts` | Better factored |
| State Management UI | clear / export / import | **Partial (Different)** | `ProfileSelector.tsx:456-482` export/import; config-browser `DeleteAllDialog`, `ResetToSeedDialog` | Split across surfaces; no in-grid clear; no copy-to-clipboard |
| State-changed events with action names | ~50 names | **Partial** | `GridPlatform.ts` `module:stateChanged { gridId, moduleId }` | No per-action verb; no Before event |
| Application data entries | Yes | **Different** | `AppDataLookup` (live host registry) | Not persisted in state; read-only |
| No Code plugin | Yes | **Missing** | — | — |
| FDC3 | 14 contexts / 14 intents / mapping / action columns | **Partial** | `widgets-react/src/hosted/useFdc3Channel.ts`, `gridContextLink.ts` (`starui.gridSelection`), `useInteropChannel.ts` | User channels only, one proprietary context; **no intents**, no mapping, no action columns |
| OpenFin alerts as notifications | Yes | **Full** | `host-openfin/src/notifications.ts`; `useAlertsOpenFinBridge.ts` | — |
| OpenFin Live Excel | Yes | **Missing** | — | — |
| interop.io | plugin | **Partial** | `useInteropChannel.ts` | Channel plumbing only |
| ipushpull | plugin | **Missing** | — | — |
| Server-side row model | supported | **Partial** | `useGridHost.ts:36` `rowModelType` pass-through | Nothing in customizer accounts for SSRM |
| Master detail | plugin | **Missing** | `hasMasterDetail` in `SettingsSheet.tsx` is the panel layout, not AG Grid | — |

## UI chrome

| Feature | AdapTable | stern-bak status | Evidence | Gap notes |
|---|---|---|---|---|
| Settings Panel — grouped navigation | left rail, 8 groups | **Full (Different)** | `widget/SettingsModuleMenubar.tsx` `MODULE_GROUP_DEFS` (Options/Columns/Styling/Editing/Data + MORE); `SettingsSheet.tsx` | Horizontal menubar |
| Collection sections | New/Edit/Clone/Delete/Share/Suspend | **Partial** | `SettingsSheet.tsx` `ListPane`/`EditorPane`; per-module panels; suspend ≈ `enabled` | No Share; Clone only for some |
| Configuration sections | Yes | **Full** | `general-settings/{GridOptionsPanel,gridOptionsSchema,fieldSchema}.tsx`; shared `Band`/`SettingsRow` | — |
| Custom panels | `customSettingsPanels` | **Different** | host `modules` prop; unlisted ids → MORE | Module contract, React-only |
| Modal vs window / popout | Yes | **Full (Different)** | `Drawer` + `Poppable`; `customizer/ui/PopoutPortal.tsx` (real `window.open`, OpenFin-safe) | Genuine second window |
| Dashboard header / icon / title | Yes | **Partial** | `PrimaryToolbar.tsx`; `EditableCaption.tsx` | No app icon option |
| Quick Search in header | Yes | **Full** | `QuickSearch.tsx` | — |
| Module buttons | one per module | **Partial** | settings toggle + `ViewMenu`, `OverflowMenu`, `GridInfoButton`, `AlertsBadge` | Curated, not per-module |
| Tabs of toolbars / pinned / runtime editing | Yes | **Missing** | `toolbar-visibility` state is flat `Record<id, boolean>` | Fixed 4 toolbars |
| Collapsed / floating / hidden modes | 4 modes | **Partial** | `DraggableFloat.tsx` (Formatting toolbar); `showToolbar` prop | Per-toolbar, no dashboard state machine |
| Custom toolbars | Yes | **Missing** | `headerExtras` React slot only | — |
| Tool Panel (module + custom panels) | 15 panels | **Missing** | `general-settings/index.ts:121-151` stock Columns/Filters only | — |
| Status Bar module panels | 10 panels | **Missing** | `general-settings/index.ts:154-170` stock AG Grid only | — |
| Column Menu items + `customColumnMenu` | ~30 items | **Missing** | `getMainMenuItems` **never set** | Stock AG Grid; no hook |
| Context Menu items + `customContextMenu` | 5 sections | **Partial** | `widget/gridContextMenu.ts` prepends Settings + Remove from Grid | Two fixed items; no extension point |
| Wizards | 14 | **Different** | zero hits; `SettingsSheet.tsx` master-detail + `useModuleDraft` + `Band` sections | Single-page drawer forms; no summary step |
| Custom popup windows | id-keyed API | **Full (Different)** | `PopoutPortal.tsx`, `Poppable.tsx`, `openChildToolWindow.ts` | Portal-based |
| Loading screen | Yes | **Missing** | — | — |
| Progress indicator | Yes | **Partial** | `react-core/ui/.../progress.tsx` primitive | No grid API, no call sites |
| `AdaptableButton` descriptor | serialisable | **Different** | `ChromeButton.tsx`, `GhostIconButton.tsx`, `EditingToolbarPrimitives.tsx` | React props, not config descriptors |
| `AdaptableForm` (13 field types) | Yes | **Different** | `general-settings/fieldSchema.tsx` (internal) | Not a reusable public contract; no validate/pattern/async options |
| `AdaptableIcon` (system/custom/element) | Yes | **Partial** | `icons-svg/allIcons.ts`, `DynamicIcon.tsx`, lucide | No `customIcons` registration |
| Toast options | Yes | **Full (Different)** | shadcn/sonner; `useAlertsToastBridge.ts` | No options object |
| Accessibility / keyboard | documented | **Partial** | Radix primitives; `aria-label`s | No documented contract, no audit |
| Hide-all-UI | one flag | **Different** | `MarketsGridCore` chrome-less component + `show*` props | Compile-time + props |
| Help / doc links | per-section | **Partial** | `HelpPanel.tsx`, `widget/help/` (6 sections), `GridInfoButton.tsx` | Not per-module |
| English variant | Yes | **Missing** | — | — |

---

## Summary

| Status | Count (69 rows) |
|---|---|
| Full (incl. Full-Different) | 15 |
| Partial | 22 |
| Different | 8 |
| Missing | 24 |

Editing 21 (5/6/3/7) · Annotating 3 (0/0/0/3) · Data 10 (1/5/0/4) · Advanced 16 (2/4/4/6) · UI chrome 19 (7/7/1/4).

### Top 5 gaps

1. **No validation layer, client or server.** Static `editable` boolean, no `PreventEdit`, no `validateOnServer`. The tri-state preview is wired to a validator that always returns valid, so bulk edits apply with no gate.
2. **No Export module.** No `Report` objects, scopes, JSON, custom destinations, filename options, or scheduling. Visual Excel is good but is one hard-coded call. No grid-data import.
3. **No annotation family.** Notes, Comments, Free Text Columns all missing; no per-PK user-value store exists to build on.
4. **No `Revision` / redeploy merge, and only module-granular state events.** Shipped changes to design-time defaults can never reach saved profiles except destructively.
5. **Two of four chrome surfaces don't exist and the column menu has no hook.** Tool Panel and Status Bar are stock; `getMainMenuItems` is never set; context menu has two fixed items; toolbars are a flat on/off set.

### stern-bak wins in this slice

Redo; per-source DCH recording toggles; asymmetric nudge steps; K/M/B suffix parsing in every numeric `valueParser`; per-module `migrate()`; cross-tab invalidation via `StorageAdapter.subscribeToChanges`; a real second-window popout.
