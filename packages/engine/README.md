# @smartgrid/engine

Turns the config document into AG Grid inputs. Framework-agnostic and pure: `buildGrid` returns `columnDefs`, `gridOptions`, a stylesheet and warnings; it never calls the grid API.

**M0:** layout (order, visibility, sizing, pinning, sorts, captions, row groups, aggregations incl. weighted average and `only`, pivot flags, row selection, grand total, expansion) and formatting (predicate-based conditional styles as `cellClassRules` with per-theme CSS, header styles, number/string/date/template display formats with the 15 AdapTable presets).

**Later:** expression rules (M1), styled columns, flashing, calculated columns, alerts, the `RowChangeBus`, and the shared validator (M2).

```ts
import { buildGrid } from '@smartgrid/engine';

const { columnDefs, gridOptions, css } = buildGrid({ config, baseColumnDefs, columns });
```
