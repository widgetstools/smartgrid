/** Static type inference over the AST; used by validation and completions. */
import type { FunctionRegistry, Node, ValueType } from './types.js';

export function inferType(
  node: Node,
  columnType: (id: string) => ValueType,
  functions: FunctionRegistry,
): ValueType {
  const t = (n: Node): ValueType => inferType(n, columnType, functions);
  switch (node.type) {
    case 'literal':
      if (node.value === null) return 'any';
      if (typeof node.value === 'number') return 'number';
      if (typeof node.value === 'boolean') return 'boolean';
      return 'text';
    case 'column':
      return columnType(node.id);
    case 'field':
      return 'any';
    case 'unary':
      return node.op === 'NOT' ? 'boolean' : 'number';
    case 'binary':
      switch (node.op) {
        case 'AND':
        case 'OR':
        case '=':
        case '!=':
        case '>':
        case '>=':
        case '<':
        case '<=':
          return 'boolean';
        case '+': {
          const l = t(node.left);
          const r = t(node.right);
          if (l === 'text' || r === 'text') return 'text';
          if (l === 'any' || r === 'any') return 'any';
          return 'number';
        }
        default:
          return 'number';
      }
    case 'ternary':
      return unify(t(node.then), t(node.else));
    case 'case': {
      const types = node.whens.map((w) => t(w.then));
      if (node.else) types.push(t(node.else));
      return types.reduce<ValueType>((a, b) => unify(a, b), types[0] ?? 'any');
    }
    case 'call': {
      const def = functions.get(node.name);
      if (!def) return 'any';
      if (
        def.returnType === 'any' &&
        (def.name === 'COALESCE' || def.name === 'IF' || def.name === 'MIN' || def.name === 'MAX')
      ) {
        const types = node.args.map(t).filter((x) => x !== 'any');
        return types.length ? types.reduce<ValueType>((a, b) => unify(a, b), types[0]!) : 'any';
      }
      return def.returnType;
    }
    case 'where':
      return t(node.expr);
  }
}

function unify(a: ValueType, b: ValueType): ValueType {
  if (a === b) return a;
  if (a === 'any') return b;
  if (b === 'any') return a;
  return 'any';
}
