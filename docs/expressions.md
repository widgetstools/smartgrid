# SmartGrid expression language (AdaptableQL-compatible)

`packages/expressions` implements the expression language used by format columns, calculated columns, alerts, filters and flashing cells. The grammar and function names follow AdaptableQL so existing AdapTable expressions and the AdapTable documentation apply unchanged. This page is the reference the assistant's system prompt is built from.

## Expression kinds

| Kind                | Returns    | Used by                                               | Notes                                                                      |
| ------------------- | ---------- | ----------------------------------------------------- | -------------------------------------------------------------------------- |
| `scalar`            | any value  | calculated columns, export                            | per row                                                                    |
| `boolean`           | true/false | format columns, flashing, filters, data-change alerts | per row                                                                    |
| `aggregatedScalar`  | value      | aggregated calculated columns                         | across rows; `GROUP_BY`, `WHERE`, `WEIGHT`, `CUMUL`, `QUANT`               |
| `aggregatedBoolean` | true/false | aggregated alerts                                     | same, compared to a threshold                                              |
| `observable`        | fires      | row-change alerts                                     | `ROW_CHANGE`, `GRID_CHANGE`, `ROW_ADDED`, `ROW_REMOVED` over a `TIMEFRAME` |

## Syntax

- Column reference: `[ColumnId]`, or the column's header `[Trade Date]` (resolved to the id, case-insensitive). `COL("id")` is equivalent. Non-column row data: `FIELD('meta.rank')`.
- Literals: numbers `12`, `1.5`, `1e3`; strings `'USD'` or `"USD"` (double a quote to escape it); `TRUE`, `FALSE`, `NULL`.
- Comparison: `=`, `!=` (or `<>`), `>`, `>=`, `<`, `<=`. Arithmetic: `+`, `-`, `*`, `/`, `%`, `^`. Logical: `AND`, `OR`, `NOT`, parentheses.
- Conditional: `cond ? a : b`; `CASE [x] WHEN v THEN r WHEN v2 THEN r2 ELSE r3 END`; `CASE WHEN cond THEN r END`.
- Precedence, lowest to highest: `WHERE` (top level only) · `?:` · `OR` · `AND` · `NOT` · comparison · `+ -` · `* / %` · unary `-` · `^`.
- Keywords and function names are case-insensitive. Text comparison is case-insensitive unless the environment sets `caseSensitive`.

### Value semantics

- Blank (`null`, `undefined`, `''`) propagates: arithmetic with a blank yields blank; comparisons with a blank are false; `= NULL` tests for blank.
- Magnitude strings compare numerically: `[PnL] > '5M'` means 5,000,000 (`K`, `M`, `B`).
- Dates compare by time; `'2026-06-01'` is local midnight. `+` concatenates when either side is text and not numeric.
- Division by zero yields blank.

## Function catalogue

Boolean: `EQ NEQ GT LT GTE LTE AND OR NOT BETWEEN IN CONTAINS STARTS_WITH ENDS_WITH ANY_CONTAINS IS_BLANK IS_NOT_BLANK IS_NUMERIC REGEX IS_HOLIDAY IS_WORKDAY`

Numeric: `ADD SUB MUL DIV MOD POW MIN MAX AVG ABS CEILING FLOOR ROUND`

Date: `DATE NOW CURRENT_DAY DAY WEEK MONTH YEAR ADD_DAYS ADD_WEEKS ADD_MONTHS ADD_YEARS DIFF_DAYS DIFF_WEEKS DIFF_MONTHS DIFF_YEARS`

String: `SUB_STRING REPLACE LEN UPPER LOWER CONCAT TRIM`

Misc: `COALESCE TO_ARRAY NULL IF`

Relative change (boolean kind, during a data change): `ANY_CHANGE([c])`, `ABSOLUTE_CHANGE([c], 'INCREASE'|'DECREASE')`, `PERCENT_CHANGE([c], direction)`

Aggregated: `SUM AVG MIN MAX MEDIAN COUNT MODE DISTINCT ONLY STD_DEVIATION PERCENTAGE CUMUL QUANT QUARTILE PERCENTILE` with modifiers `GROUP_BY([a],[b])`, `WEIGHT([w])`, `OVER([order])` and a trailing `WHERE cond`.

Observable: `ROW_CHANGE(COUNT([c], n) | MIN([c]) | MAX([c]) | NONE([c]), TIMEFRAME('5m'))`, `GRID_CHANGE(...)`, `ROW_ADDED()`, `ROW_ADDED(n, TIMEFRAME(t))`, `ROW_REMOVED(...)`, optional trailing `WHERE cond`. Timeframes: `30s`, `5m`, `2h`, `1d`; default maximum 8h.

Advanced: `QUERY('Name')` inlines a named query; `VAR('NAME')` / `VAR('NAME', arg)` reads host variables.

`defaultFunctionRegistry().list(kind)` is the source of truth for names, signatures, descriptions and examples; the editor's completions and the assistant's tool descriptions read it.

## Examples

```
[PnL] < 0 AND [Desk] = 'Rates'
MIN([BloombergBid], [MarkitBid]) > 50 OR [Currency] = 'USD'
ADD_DAYS(CURRENT_DAY(), 5) < [TradeDate]
[Comments] > 100 ? 'Big' : 'Small'
CASE [Rating] WHEN 'AAA' THEN 1 WHEN 'AA' THEN 2 ELSE 9 END
SUM([PnL]) > '5M' WHERE [Currency] = 'USD'
AVG([Price], WEIGHT([Notional]))
PERCENTAGE([open_issues], SUM([closed_issues], GROUP_BY([language])))
CUMUL(SUM([Stars]), OVER([CreatedAt]))
QUANT([Value], 4, GROUP_BY([Type]))
PERCENT_CHANGE([Price], 'DECREASE') > 10
ROW_CHANGE(COUNT([ItemCount], 3), TIMEFRAME('5m'))
GRID_CHANGE(NONE([Price]), TIMEFRAME('30s')) WHERE [Status] = 'Live'
ROW_ADDED() WHERE [Language] = 'TypeScript'
```

## API

```ts
import {
  parse,
  validate,
  compileSource,
  compileAggregatedSource,
  compileObservableSource,
  ObservableWatcher,
  createEnv,
} from '@smartgrid/expressions';

const env = createEnv({ variables: (name) => vars[name], namedQuery: (name) => queries[name] });

// Static checks with positioned errors (editor diagnostics; assistant self-correction)
const result = validate("[PnL] < 0 AND [Desk] = 'Rates'", { kind: 'boolean', env, columns });
result.ok;
result.errors; /* {message,start,end}[] */
result.columns;
result.returnType;

// Per-row
const test = compileSource('[PnL] < 0', env); // (row: RowContext) => Value
test({ get: (id) => data[id] });

// Across rows
const prog = compileAggregatedSource('SUM([PnL], GROUP_BY([Desk]))', env);
prog.evaluateRow(row, rows); // value for a row's group
prog.evaluate(rows); // { value, groups? }

// Over time
const spec = compileObservableSource("ROW_CHANGE(COUNT([Price], 3), TIMEFRAME('5m'))", env);
const watcher = new ObservableWatcher(spec);
watcher.push({ kind: 'change', rowId, columnId: 'Price', oldValue, newValue, row, at: Date.now() }); // → triggers[]
watcher.tick(Date.now()); // NONE conditions
```

`RowContext` is the only host contract: `{ get(columnId), field?(path), rowId?, change?: { columnId, oldValue, newValue } }`. The engine adapts AG Grid row nodes; tests use plain objects.

## Validation messages

Errors are meant to be read by people and by the model: `Unknown column [Nope]`, `Unknown function SUMM; did you mean SUM?`, `SUM aggregates over rows and needs an aggregated expression`, `Condition must return true/false, but this returns number`, `WHERE is only valid in aggregated and observable expressions`, `Comparisons cannot be chained; use AND`, `Timeframe exceeds the maximum of 8h`. Every message carries a `start`/`end` span.

## Extending

- Custom functions: `createEnv({ functions: [{ name: 'USD_CONVERT', category: 'numeric', returnType: 'number', kinds: ['scalar', 'boolean'], arity: { min: 2, max: 2 }, signatures: ['USD_CONVERT(amount, ccy)'], description: '…', impl: (args, ctx) => … }] })`.
- Custom predicates: `PredicateRegistry.register(...)` (see `predicates.ts`); predicates and expressions share `values.ts` semantics.
- Reduce the surface for a deployment by building a registry with only the functions you want and passing it in `env.functions`; validation, completions and the assistant's tool descriptions all follow it.
