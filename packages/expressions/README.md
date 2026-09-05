# @smartgrid/expressions

AdaptableQL-compatible expression language for SmartGrid.

**M0:** predicate catalogue (`SYSTEM_PREDICATES`, all 45 AdapTable-compatible ids), `PredicateRegistry` with custom predicates, arity validation and evaluation context (`now`, `holidays`, `caseSensitive`, `previousValue`).

**M1 (planned):** tokenizer, parser, evaluator, function catalogue (scalar, boolean, aggregated, relative-change, observable), positioned diagnostics, AST export, compile-to-closure. CSP-safe: no `eval`.
