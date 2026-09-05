import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorContextProvider } from '../context.js';
import { FIXTURE_CONTEXT } from '../test/fixtures.js';
import { PredicateEditor } from './PredicateEditor.js';

afterEach(cleanup);

const wrap = (ui: React.ReactElement) =>
  render(<EditorContextProvider value={FIXTURE_CONTEXT}>{ui}</EditorContextProvider>);

describe('PredicateEditor', () => {
  it('lists only predicates for the scoped data type', async () => {
    wrap(
      <PredicateEditor
        value={undefined}
        onChange={() => {}}
        label="Condition"
        options={{ dataType: 'number' }}
      />,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Predicate' }));
    const list = await screen.findByRole('listbox');
    expect(within(list).getByText('Greater Than')).toBeInTheDocument();
    expect(within(list).queryByText('Contains')).not.toBeInTheDocument();
  });

  it('selecting a predicate resets inputs', async () => {
    const onChange = vi.fn();
    wrap(
      <PredicateEditor
        value={{ predicateId: 'GreaterThan', inputs: [5] }}
        onChange={onChange}
        label="Condition"
        options={{ dataType: 'number' }}
      />,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Predicate' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Between' }));
    expect(onChange).toHaveBeenCalledWith({ predicateId: 'Between', inputs: [], columnId: undefined });
  });

  it('renders two number inputs for arity-2 predicates and updates them', async () => {
    const onChange = vi.fn();
    wrap(
      <PredicateEditor
        value={{ predicateId: 'Between', inputs: [] }}
        onChange={onChange}
        label="Condition"
        options={{ dataType: 'number' }}
      />,
    );
    await userEvent.type(screen.getByLabelText('From'), '10');
    expect(onChange).toHaveBeenLastCalledWith({ predicateId: 'Between', inputs: [10] });
    await userEvent.type(screen.getByLabelText('To'), '2');
    expect(onChange).toHaveBeenLastCalledWith({ predicateId: 'Between', inputs: [undefined, 2] });
  });

  it('uses the referenced column data type and offers its values for list predicates', async () => {
    const onChange = vi.fn();
    wrap(
      <PredicateEditor
        value={{ predicateId: 'In', inputs: ['Rates'], columnId: 'desk' }}
        onChange={onChange}
        label="Condition"
      />,
    );
    expect(screen.getByRole('button', { name: 'Reads column Desk' })).toBeInTheDocument();
    expect(screen.getByText('Rates')).toBeInTheDocument();
  });

  it('renders a text input for text predicates', () => {
    wrap(
      <PredicateEditor
        value={{ predicateId: 'Contains', inputs: [] }}
        onChange={() => {}}
        label="Condition"
        options={{ columnId: 'desk' }}
      />,
    );
    expect(screen.getByLabelText('Value')).toBeInTheDocument();
  });
});
