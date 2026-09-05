/**
 * Generated forms: thin bindings of SchemaForm to specific config objects.
 * They exist so hosts have a one-line component per object type and so the
 * editor options that depend on sibling values (a rule's data type follows
 * its scope) live in one place.
 */
import { useMemo } from 'react';
import {
  FormatColumn,
  Layout,
  moduleJsonSchema,
  type CellDataType,
  type ColumnInfo,
  type JsonSchema,
  type Scope,
} from '@smartgrid/schema';
import { useEditorContext } from '@smartgrid/editors';
import { SchemaForm, type SchemaFormProps } from '../SchemaForm.js';
import { defaultsFor, propertiesOf, type SchemaNode } from '../schemaNode.js';

function itemsOfProperty(moduleSchema: JsonSchema, key: string): SchemaNode {
  const prop = propertiesOf(moduleSchema)[key];
  const items = prop?.['items'];
  if (!items || typeof items !== 'object') throw new Error(`No items schema for ${key}`);
  return items as SchemaNode;
}

let formatColumnSchema: SchemaNode | undefined;
let layoutSchema: SchemaNode | undefined;

/** JSON Schema node for one FormatColumn (from the formatting module schema). */
export function formatColumnJsonSchema(): SchemaNode {
  formatColumnSchema ??= itemsOfProperty(moduleJsonSchema('formatting'), 'formatColumns');
  return formatColumnSchema;
}

/** JSON Schema node for one Layout (table | pivot). */
export function layoutJsonSchema(): SchemaNode {
  layoutSchema ??= itemsOfProperty(moduleJsonSchema('layout'), 'layouts');
  return layoutSchema;
}

export function defaultFormatColumn(id: string, name = 'New format'): FormatColumn {
  const base = defaultsFor(formatColumnJsonSchema(), formatColumnJsonSchema()) as Record<string, unknown>;
  return { ...base, id, name, scope: { kind: 'all' }, style: {} } as FormatColumn;
}

export function defaultLayout(id: string, name: string, columns: string[]): Layout {
  const base = defaultsFor(layoutJsonSchema(), layoutJsonSchema()) as Record<string, unknown>;
  return Layout.parse({ ...base, id, name, kind: 'table', columns });
}

/** Data type / column implied by a scope, for rule and predicate editors. */
export function scopeEditorOptions(
  scope: Scope | undefined,
  columns: readonly ColumnInfo[],
): { dataType?: CellDataType; columnId?: string } {
  if (!scope) return {};
  if (scope.kind === 'columns' && scope.columnIds.length === 1) {
    const id = scope.columnIds[0]!;
    return { columnId: id, dataType: columns.find((c) => c.id === id)?.dataType };
  }
  if (scope.kind === 'columns') {
    const types = new Set(
      scope.columnIds.map((id) => columns.find((c) => c.id === id)?.dataType).filter(Boolean),
    );
    return types.size === 1 ? { dataType: [...types][0] as CellDataType } : {};
  }
  if (scope.kind === 'dataTypes' && scope.dataTypes.length === 1) return { dataType: scope.dataTypes[0] };
  return {};
}

export type FormatColumnFormProps = Omit<SchemaFormProps<FormatColumn>, 'jsonSchema' | 'root' | 'schema'>;

export function FormatColumnForm(props: FormatColumnFormProps) {
  const { columns } = useEditorContext();
  const ownOptions = props.editorOptions;
  const jsonSchema = formatColumnJsonSchema();
  const editorOptions = useMemo<SchemaFormProps['editorOptions']>(
    () => (path, node, rootValue) => {
      const fc = rootValue as Partial<FormatColumn> | undefined;
      const own = ownOptions?.(path, node, rootValue);
      if (path === '/rule') return { ...scopeEditorOptions(fc?.scope, columns), ...own };
      if (path === '/displayFormat') {
        const dt = scopeEditorOptions(fc?.scope, columns).dataType;
        const kinds =
          dt === 'number'
            ? ['number', 'template', 'excel', 'tick', 'custom']
            : dt === 'date' || dt === 'dateString'
              ? ['date', 'template', 'custom']
              : dt === 'text'
                ? ['string', 'template', 'custom']
                : undefined;
        return { ...(kinds ? { kinds } : {}), ...own };
      }
      return own;
    },
    [columns, ownOptions],
  );
  return (
    <SchemaForm<FormatColumn>
      {...props}
      jsonSchema={jsonSchema}
      schema={FormatColumn}
      editorOptions={editorOptions}
    />
  );
}

export type LayoutFormProps = Omit<SchemaFormProps<Layout>, 'jsonSchema' | 'root' | 'schema'>;

export function LayoutForm(props: LayoutFormProps) {
  return <SchemaForm<Layout> {...props} jsonSchema={layoutJsonSchema()} schema={Layout} />;
}
