import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { z } from '@smartgrid/schema';
import { fragmentJsonSchema, withEditor } from '@smartgrid/schema';
import { EditorContextProvider, EMPTY_EDITOR_CONTEXT } from '@smartgrid/editors';
import { SchemaForm } from './SchemaForm.js';
import { validate } from './validate.js';

afterEach(cleanup);

const columns = [
  {
    id: 'pnl',
    header: 'PnL',
    dataType: 'number' as const,
    columnTypes: [],
    sampleValues: [1, -2],
    editable: false,
    isPrimaryKey: false,
    isSpecial: false,
  },
  {
    id: 'desk',
    header: 'Desk',
    dataType: 'text' as const,
    columnTypes: [],
    sampleValues: ['Rates'],
    editable: false,
    isPrimaryKey: false,
    isSpecial: false,
  },
];
const ctx = { ...EMPTY_EDITOR_CONTEXT, columns };
const wrap = (ui: React.ReactElement) =>
  render(<EditorContextProvider value={ctx}>{ui}</EditorContextProvider>);

const Thing = z.object({
  id: z.string(),
  name: z.string().min(1),
  count: z.number().int().min(0).max(10).default(1),
  mode: z.enum(['fast', 'slow']).default('fast'),
  on: z.boolean().default(false),
  colour: withEditor(z.string(), { 'x-editor': 'color', title: 'Fill colour' }).optional(),
  tags: z.array(z.string()).default([]),
  nested: z.object({ note: z.string().optional() }).optional(),
});

describe('SchemaForm', () => {
  it('renders typed fields, hides id, and emits merged objects', async () => {
    const onChange = vi.fn();
    wrap(
      <SchemaForm
        jsonSchema={fragmentJsonSchema(Thing)}
        value={{ id: 'x', name: 'A', count: 1 }}
        onChange={onChange}
      />,
    );
    expect(screen.queryByLabelText('Id')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('A');
    await userEvent.type(screen.getByLabelText('Count'), '0');
    expect(onChange).toHaveBeenLastCalledWith({ id: 'x', name: 'A', count: 10 });
    await userEvent.click(screen.getByRole('switch', { name: 'On' }));
    expect(onChange).toHaveBeenLastCalledWith({ id: 'x', name: 'A', count: 1, on: true });
    await userEvent.click(screen.getByRole('radio', { name: 'Slow' }));
    expect(onChange).toHaveBeenLastCalledWith({ id: 'x', name: 'A', count: 1, mode: 'slow' });
  });

  it('resolves x-editor hints through the registry', () => {
    wrap(
      <SchemaForm
        jsonSchema={fragmentJsonSchema(Thing)}
        value={{ id: 'x', name: 'A', colour: '#ff0000' }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /Fill colour: #ff0000/ })).toBeInTheDocument();
  });

  it('renders string arrays as chips and nested objects as fieldsets', async () => {
    const onChange = vi.fn();
    wrap(
      <SchemaForm
        jsonSchema={fragmentJsonSchema(Thing)}
        value={{ id: 'x', name: 'A', tags: ['a'] }}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('group', { name: 'Tags' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove a' }));
    expect(onChange).toHaveBeenLastCalledWith({ id: 'x', name: 'A' });
    expect(screen.getByRole('group', { name: 'Nested' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Note'), 'hi');
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith({ id: 'x', name: 'A', tags: ['a'], nested: { note: 'hi' } });
  });

  it('validates with the Zod schema and routes errors to fields', () => {
    const onValidate = vi.fn();
    wrap(
      <SchemaForm
        jsonSchema={fragmentJsonSchema(Thing)}
        schema={Thing}
        value={{ id: 'x', name: '', count: 99 }}
        onChange={() => {}}
        onValidate={onValidate}
        showSummary
      />,
    );
    const errs = onValidate.mock.calls.at(-1)?.[0] as { path: string }[];
    expect(errs.map((e) => e.path).sort()).toEqual(['/count', '/name']);
    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((a) => a.textContent?.includes('10'))).toBe(true);
    expect(validate(Thing, { id: 'x', name: 'ok' })).toEqual([]);
  });

  it('edits discriminated unions with a kind selector and carries compatible keys', async () => {
    const Shape = z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('circle'), r: z.number(), label: z.string().optional() }),
      z.object({ kind: z.literal('square'), side: z.number(), label: z.string().optional() }),
    ]);
    const onChange = vi.fn();
    wrap(
      <SchemaForm
        jsonSchema={fragmentJsonSchema(Shape)}
        value={{ kind: 'circle', r: 2, label: 'c' }}
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText('R')).toHaveValue(2);
    await userEvent.click(screen.getByRole('radio', { name: 'Square' }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'square', side: 0, label: 'c' });
  });

  it('renders object arrays as a list with a detail form', async () => {
    const List = z.object({
      rows: z.array(z.object({ id: z.string(), name: z.string(), enabled: z.boolean().default(true) })),
    });
    const onChange = vi.fn();
    wrap(
      <SchemaForm
        jsonSchema={fragmentJsonSchema(List)}
        value={{ rows: [{ id: 'r1', name: 'One', enabled: true }] }}
        onChange={onChange}
      />,
    );
    const list = screen.getByRole('listbox', { name: 'Items' });
    expect(within(list).getByText('One')).toBeInTheDocument();
    await userEvent.click(within(list).getByRole('option'));
    const detail = screen.getByTestId('list-detail');
    await userEvent.clear(within(detail).getByLabelText('Name'));
    await userEvent.type(within(detail).getByLabelText('Name'), 'Uno');
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith({ rows: [{ id: 'r1', name: 'Uno', enabled: true }] });
    await userEvent.click(screen.getByRole('button', { name: 'Add row' }));
    const added = onChange.mock.calls.at(-1)?.[0] as {
      rows: { id: string; name: string; enabled: boolean }[];
    };
    expect(added.rows).toHaveLength(2);
    expect(added.rows[1]?.enabled).toBe(true);
    expect(added.rows[1]?.id).toBeTruthy();
  });

  it('edits records with add and remove', async () => {
    const Rec = z.object({ pins: z.record(z.string(), z.enum(['left', 'right'])) });
    const onChange = vi.fn();
    wrap(
      <SchemaForm jsonSchema={fragmentJsonSchema(Rec)} value={{ pins: { a: 'left' } }} onChange={onChange} />,
    );
    expect(screen.getByRole('button', { name: 'Remove a' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('New key'), 'b');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onChange).toHaveBeenLastCalledWith({ pins: { a: 'left', b: 'left' } });
    await userEvent.click(screen.getByRole('button', { name: 'Remove a' }));
    expect(onChange).toHaveBeenLastCalledWith({});
  });

  it('supports hintFor overrides and read-only mode', () => {
    wrap(
      <SchemaForm
        jsonSchema={fragmentJsonSchema(Thing)}
        value={{ id: 'x', name: 'A' }}
        onChange={() => {}}
        hintFor={(path) => (path === '/name' ? 'column' : undefined)}
        readOnly
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Name' })).toBeDisabled();
  });
});
