import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorContextProvider } from '../context.js';
import { FIXTURE_CONTEXT } from '../test/fixtures.js';
import { RuleEditor } from './RuleEditor.js';

afterEach(cleanup);

const wrap = (ui: React.ReactElement) =>
  render(<EditorContextProvider value={FIXTURE_CONTEXT}>{ui}</EditorContextProvider>);

describe('RuleEditor', () => {
  it('starts as "always applies" and creates a predicate rule', async () => {
    const onChange = vi.fn();
    wrap(<RuleEditor value={undefined} onChange={onChange} label="Rule" />);
    expect(screen.getByText('Always applies')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Conditions' }));
    expect(onChange).toHaveBeenCalledWith({
      kind: 'predicates',
      predicates: [{ predicateId: '', inputs: [] }],
      operator: 'AND',
    });
  });

  it('switches to an expression rule and edits it', async () => {
    const onChange = vi.fn();
    const { rerender } = wrap(<RuleEditor value={undefined} onChange={onChange} label="Rule" />);
    await userEvent.click(screen.getByRole('radio', { name: 'Expression' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'expression', expression: '' });
    rerender(
      <EditorContextProvider value={FIXTURE_CONTEXT}>
        <RuleEditor value={{ kind: 'expression', expression: '' }} onChange={onChange} label="Rule" />
      </EditorContextProvider>,
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Expression' }), '[[pnl] < 0');
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'expression', expression: '[pnl] < 0' });
  });

  it('adds, removes and combines conditions', async () => {
    const onChange = vi.fn();
    const one = {
      kind: 'predicates' as const,
      predicates: [{ predicateId: 'Positive', inputs: [] }],
      operator: 'AND' as const,
    };
    const { rerender } = wrap(
      <RuleEditor value={one} onChange={onChange} label="Rule" options={{ dataType: 'number' }} />,
    );
    expect(screen.queryByRole('radio', { name: 'Any (OR)' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add condition' }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...one,
      predicates: [...one.predicates, { predicateId: '', inputs: [] }],
    });

    const two = { ...one, predicates: [...one.predicates, { predicateId: 'Negative', inputs: [] }] };
    rerender(
      <EditorContextProvider value={FIXTURE_CONTEXT}>
        <RuleEditor value={two} onChange={onChange} label="Rule" options={{ dataType: 'number' }} />
      </EditorContextProvider>,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Any (OR)' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...two, operator: 'OR' });
    await userEvent.click(screen.getByRole('button', { name: 'Remove condition 2' }));
    expect(onChange).toHaveBeenLastCalledWith(one);
  });

  it('removing the last condition clears the rule', async () => {
    const onChange = vi.fn();
    wrap(
      <RuleEditor
        value={{ kind: 'predicates', predicates: [{ predicateId: 'Positive', inputs: [] }], operator: 'AND' }}
        onChange={onChange}
        label="Rule"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove condition 1' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('offers aggregated/observable kinds only when allowed', () => {
    wrap(
      <RuleEditor
        value={undefined}
        onChange={() => {}}
        label="Rule"
        options={{ allowAggregated: true, predicatesDisabled: true }}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Aggregated' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Over time' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Conditions' })).not.toBeInTheDocument();
  });
});
