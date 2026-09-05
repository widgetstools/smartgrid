/**
 * RuleEditor — `x-editor: rule`. Edits a Rule: either a predicate list
 * joined by AND/OR, or a boolean expression. This is the "condition" step
 * of every AdapTable wizard, as one component. `options.allowAggregated` /
 * `options.allowObservable` unlock the alert-only kinds.
 */
import { useId } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { AlertRule, CellDataType, Predicate, Rule } from '@smartgrid/schema';
import { Button, ToggleGroup, ToggleGroupItem, cn } from '@smartgrid/ui';
import { Field } from '../lib/Field.js';
import type { EditorProps } from '../types.js';
import { ExpressionEditor } from './ExpressionEditor.js';
import { PredicateEditor } from './PredicateEditor.js';

type AnyRule = Rule | AlertRule;

export interface RuleEditorOptions {
  allowAggregated?: boolean;
  allowObservable?: boolean;
  /** Data type / column of the scoped column, for predicate filtering and value suggestions. */
  dataType?: CellDataType;
  columnId?: string;
  /** When the owning scope is `all`, predicates cannot read "the" column. */
  predicatesDisabled?: boolean;
}

export function RuleEditor({
  value,
  onChange,
  mode = 'panel',
  readOnly,
  disabled,
  errors,
  label,
  description,
  id,
  className,
  options,
}: EditorProps<AnyRule>) {
  const ro = readOnly || disabled;
  const autoId = useId();
  const opts = (options ?? {}) as RuleEditorOptions;
  const kind = value?.kind;

  const kinds: { value: AnyRule['kind']; label: string }[] = [
    ...(opts.predicatesDisabled ? [] : [{ value: 'predicates' as const, label: 'Conditions' }]),
    { value: 'expression', label: 'Expression' },
    ...(opts.allowAggregated ? [{ value: 'aggregated' as const, label: 'Aggregated' }] : []),
    ...(opts.allowObservable ? [{ value: 'observable' as const, label: 'Over time' }] : []),
  ];

  const switchKind = (k: string) => {
    if (!k) return onChange(undefined);
    switch (k as AnyRule['kind']) {
      case 'predicates':
        return onChange({
          kind: 'predicates',
          predicates: [{ predicateId: '', inputs: [] }],
          operator: 'AND',
        });
      case 'expression':
        return onChange({ kind: 'expression', expression: '' });
      case 'aggregated':
        return onChange({ kind: 'aggregated', expression: '' } as AlertRule);
      case 'observable':
        return onChange({ kind: 'observable', expression: '' } as AlertRule);
    }
  };

  return (
    <Field
      id={id ?? autoId}
      label={label}
      description={description}
      mode={mode}
      errors={errors}
      className={className}
    >
      <div className={cn('flex flex-col gap-2', mode === 'inline' && 'gap-1')}>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            size="sm"
            value={kind ?? ''}
            disabled={ro}
            aria-label="Condition kind"
            onValueChange={switchKind}
          >
            {kinds.map((k) => (
              <ToggleGroupItem key={k.value} value={k.value} className="px-2 text-xs">
                {k.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {!kind && <span className="text-2xs text-muted-foreground">Always applies</span>}
          {value?.kind === 'predicates' && value.predicates.length > 1 && (
            <ToggleGroup
              type="single"
              size="sm"
              value={value.operator}
              disabled={ro}
              aria-label="Combine with"
              onValueChange={(op) => op && onChange({ ...value, operator: op as 'AND' | 'OR' })}
            >
              <ToggleGroupItem value="AND" className="px-2 text-xs">
                All (AND)
              </ToggleGroupItem>
              <ToggleGroupItem value="OR" className="px-2 text-xs">
                Any (OR)
              </ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>

        {value?.kind === 'predicates' && (
          <div className="flex flex-col gap-1.5">
            {value.predicates.map((p, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <PredicateEditor
                  value={p}
                  onChange={(next) => {
                    const predicates = [...value.predicates];
                    predicates[i] = next ?? { predicateId: '', inputs: [] };
                    onChange({ ...value, predicates });
                  }}
                  mode={mode === 'panel' ? 'popover' : mode}
                  readOnly={ro}
                  label={`Condition ${i + 1}`}
                  options={{ dataType: opts.dataType, columnId: opts.columnId }}
                  errors={errors
                    ?.filter((e) => e.path.startsWith(`/predicates/${i}`))
                    .map((e) => ({ ...e, path: '' }))}
                />
                {!ro && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Remove condition ${i + 1}`}
                    onClick={() => {
                      const predicates = value.predicates.filter((_, j) => j !== i);
                      onChange(predicates.length ? { ...value, predicates } : undefined);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
            {!ro && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit gap-1 text-xs"
                onClick={() =>
                  onChange({
                    ...value,
                    predicates: [...value.predicates, { predicateId: '', inputs: [] } as Predicate],
                  })
                }
              >
                <Plus className="size-3.5" /> Add condition
              </Button>
            )}
          </div>
        )}

        {(value?.kind === 'expression' || value?.kind === 'aggregated' || value?.kind === 'observable') && (
          <ExpressionEditor
            value={value.expression}
            onChange={(expr) => onChange({ ...value, expression: expr ?? '' })}
            mode={mode}
            readOnly={ro}
            label="Expression"
            options={{
              kind:
                value.kind === 'expression'
                  ? 'boolean'
                  : value.kind === 'aggregated'
                    ? 'aggregatedBoolean'
                    : 'observable',
            }}
            errors={errors
              ?.filter((e) => e.path === '/expression' || e.path === '')
              .map((e) => ({ ...e, path: '' }))}
          />
        )}
      </div>
    </Field>
  );
}
