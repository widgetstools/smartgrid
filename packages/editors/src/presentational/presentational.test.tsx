import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Operation } from 'fast-json-patch';
import { EditorContextProvider } from '../context.js';
import { registerDefaultEditors } from '../defaults.js';
import { FIXTURE_CONTEXT } from '../test/fixtures.js';
import { ObjectList } from './ObjectList.js';
import { PatchDiffCard, defaultDescribePath, getAtPointer } from './PatchDiffCard.js';
import { PreviewCell } from './PreviewCell.js';
import { ValidationSummary, humanizePointer } from './ValidationSummary.js';

afterEach(cleanup);

const wrap = (ui: React.ReactElement) =>
  render(<EditorContextProvider value={FIXTURE_CONTEXT}>{ui}</EditorContextProvider>);

describe('PreviewCell', () => {
  it('formats the value and applies the style like the grid does', () => {
    wrap(
      <PreviewCell
        value={1234.5}
        displayFormat={{ kind: 'number', preset: 'Dollar' }}
        style={{ foreColor: '#00ff00', font: { italic: true } }}
        theme="light"
      />,
    );
    const cell = screen.getByTestId('preview-cell');
    expect(cell).toHaveTextContent('$1,234.50');
    expect(cell.style.color).toBe('rgb(0, 255, 0)');
    expect(cell.style.fontStyle).toBe('italic');
  });
});

describe('ValidationSummary', () => {
  it('humanizes pointers and calls onSelect', async () => {
    const onSelect = vi.fn();
    const err = { path: '/formatColumns/0/style/backColor', message: 'Bad colour' };
    render(
      <ValidationSummary
        errors={[err]}
        warnings={['Expression rules are ignored until M1']}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByText('formatColumns › 0 › style › backColor')).toBeInTheDocument();
    expect(screen.getByText(/ignored until M1/)).toBeInTheDocument();
    await userEvent.click(screen.getByText(/Bad colour/));
    expect(onSelect).toHaveBeenCalledWith(err);
  });

  it('renders counts when compact and nothing when empty', () => {
    const { container } = render(<ValidationSummary errors={[]} />);
    expect(container).toBeEmptyDOMElement();
    render(
      <ValidationSummary
        errors={[
          { path: '', message: 'x' },
          { path: '', message: 'y' },
        ]}
        compact
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('2 errors');
    expect(humanizePointer('/a/b', '/a')).toBe('b');
    expect(humanizePointer('')).toBe('value');
  });
});

describe('PatchDiffCard', () => {
  const before = {
    modules: { formatting: { data: { formatColumns: [{ id: 'fc1', style: { backColor: '#ff0000' } }] } } },
  };
  const patch: Operation[] = [
    { op: 'replace', path: '/modules/formatting/data/formatColumns/0/style/backColor', value: '#00ff00' },
    { op: 'add', path: '/modules/formatting/data/formatColumns/0/style/font', value: { weight: 'bold' } },
    { op: 'remove', path: '/modules/formatting/data/formatColumns/0/style/border' },
  ];

  it('reads pointers and describes paths', () => {
    expect(getAtPointer(before, '/modules/formatting/data/formatColumns/0/style/backColor')).toBe('#ff0000');
    expect(getAtPointer(before, '/nope/x')).toBeUndefined();
    expect(defaultDescribePath('/modules/formatting/data/formatColumns/0/style')).toBe(
      'formatting › formatColumns › 0 › style',
    );
  });

  it('shows before and after values per operation and applies', async () => {
    const onApply = vi.fn();
    const onReject = vi.fn();
    wrap(
      <PatchDiffCard
        patch={patch}
        before={before}
        title="Make PnL green"
        rationale="Because you asked"
        onApply={onApply}
        onReject={onReject}
      />,
    );
    expect(screen.getByText('Make PnL green')).toBeInTheDocument();
    expect(screen.getByText('Because you asked')).toBeInTheDocument();
    expect(screen.getByText('#ff0000')).toBeInTheDocument();
    expect(screen.getByText('#00ff00')).toBeInTheDocument();
    expect(screen.getByText('{"weight":"bold"}')).toBeInTheDocument();
    expect(screen.getAllByText('remove')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onReject).toHaveBeenCalled();
  });

  it('renders an inline editor for resolvable paths and edits the patch', async () => {
    const onEdit = vi.fn();
    const registry = registerDefaultEditors();
    wrap(
      <PatchDiffCard
        patch={patch}
        before={before}
        registry={registry}
        resolveEditor={(path) => (path.endsWith('/backColor') ? { hint: 'color', label: 'Fill' } : undefined)}
        onEdit={onEdit}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Fill: #00ff00/ }));
    await userEvent.click(await screen.findByRole('tab', { name: 'Tokens' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Negative' }));
    expect(onEdit).toHaveBeenCalledWith([{ ...patch[0], value: 'var(--sg-negative)' }, patch[1], patch[2]]);
  });

  it('disables Apply while invalid and shows errors', () => {
    wrap(
      <PatchDiffCard
        patch={patch}
        before={before}
        status="invalid"
        errors={[
          { path: '/modules/formatting/data/formatColumns/0/style/backColor', message: 'Not a colour' },
        ]}
        onApply={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('1 error');
    expect(screen.getByTestId('patch-diff-card')).toHaveAttribute('data-status', 'invalid');
  });

  it('offers undo once applied', async () => {
    const onUndo = vi.fn();
    wrap(<PatchDiffCard patch={patch} status="applied" onUndo={onUndo} />);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalled();
  });
});

describe('ObjectList', () => {
  type Item = { id: string; name: string; enabled?: boolean };
  const items: Item[] = [
    { id: 'a', name: 'Alpha' },
    { id: 'b', name: 'Beta', enabled: false },
    { id: 'c', name: 'Gamma' },
  ];
  const summarize = (it: Item) => ({ title: it.name, subtitle: it.id, badges: [it.id.toUpperCase()] });

  it('selects, toggles, reorders, duplicates and removes', async () => {
    const onChange = vi.fn();
    const onSelect = vi.fn();
    render(
      <ObjectList
        items={items}
        onChange={onChange}
        summarize={summarize}
        selectedId="a"
        onSelect={onSelect}
      />,
    );
    const list = screen.getByRole('listbox', { name: 'Items' });
    const rows = within(list).getAllByRole('option');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(rows[2]!);
    expect(onSelect).toHaveBeenLastCalledWith('c');

    await userEvent.click(within(rows[1]!).getByRole('switch', { name: 'Beta enabled' }));
    expect(onChange).toHaveBeenLastCalledWith([items[0], { ...items[1], enabled: true }, items[2]]);

    await userEvent.click(within(rows[2]!).getByRole('button', { name: 'Move up' }));
    expect(onChange).toHaveBeenLastCalledWith([items[0], items[2], items[1]]);

    await userEvent.click(within(rows[0]!).getByRole('button', { name: 'Duplicate' }));
    const dup = onChange.mock.calls.at(-1)?.[0] as Item[];
    expect(dup).toHaveLength(4);
    expect(dup[1]?.name).toBe('Alpha');
    expect(dup[1]?.id).not.toBe('a');

    await userEvent.click(within(rows[0]!).getByRole('button', { name: 'Remove' }));
    expect(onChange).toHaveBeenLastCalledWith([items[1], items[2]]);
    expect(onSelect).toHaveBeenLastCalledWith(undefined);
  });

  it('adds through create() and reorders via keyboard', async () => {
    const onChange = vi.fn();
    render(
      <ObjectList
        items={items}
        onChange={onChange}
        summarize={summarize}
        create={() => ({ id: 'd', name: 'Delta' })}
        addLabel="Add thing"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add thing' }));
    expect(onChange).toHaveBeenLastCalledWith([...items, { id: 'd', name: 'Delta' }]);
    const rows = screen.getAllByRole('option');
    rows[0]!.focus();
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(onChange).toHaveBeenLastCalledWith([items[1], items[0], items[2]]);
  });

  it('is read-only without action buttons and shows empty text', () => {
    render(
      <ObjectList items={[]} onChange={() => {}} summarize={summarize} readOnly emptyText="No formats" />,
    );
    expect(screen.getByText('No formats')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
