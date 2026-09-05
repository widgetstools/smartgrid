import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';

afterEach(cleanup);
import userEvent from '@testing-library/user-event';
import { ColumnInfo, createGridConfig, defaultTableLayout, type GridConfig } from '@smartgrid/schema';
import { ConfigStore, MemoryAdapter } from '@smartgrid/store';
import { AssistantSession, MockProvider, demoScript } from '@smartgrid/assistant';
import { EditorContextProvider } from '@smartgrid/editors';
import { AssistantPane } from './AssistantPane.js';
import { describeConfigPath, resolveProposalEditor, schemaNodeAt } from './proposalEditors.js';
import { defaultEditorRegistry } from '@smartgrid/editors';
import { DEFAULT_ASSISTANT_SETTINGS } from './useAssistant.js';

const COLUMNS: ColumnInfo[] = (
  [
    ['tradeId', 'Trade', 'text'],
    ['desk', 'Desk', 'text'],
    ['book', 'Book', 'text'],
    ['notional', 'Notional', 'number'],
    ['pnl', 'PnL', 'number'],
  ] as const
).map(([id, header, dataType]) => ColumnInfo.parse({ id, header, dataType }));

function config(): GridConfig {
  const cfg = createGridConfig('t');
  const blotter = defaultTableLayout(
    'blotter',
    'Blotter',
    COLUMNS.map((c) => c.id),
  );
  cfg.modules.layout = { v: 1, data: { currentLayoutId: 'blotter', layouts: [blotter] } };
  return cfg;
}

async function setup(opts: { healthy?: boolean } = {}) {
  const store = new ConfigStore({ adapter: new MemoryAdapter(), persistDebounceMs: 0 });
  await store.init(config());
  const provider = new MockProvider(demoScript, { healthy: opts.healthy });
  const session = new AssistantSession({ provider, model: 'mock', store, getColumns: () => COLUMNS });
  await session.checkHealth();
  const view = render(
    <EditorContextProvider value={{ columns: COLUMNS }}>
      <AssistantPane
        session={session}
        config={store.current}
        settings={{ ...DEFAULT_ASSISTANT_SETTINGS, demo: true }}
        onSettingsChange={() => {}}
      />
    </EditorContextProvider>,
  );
  return { store, session, view };
}

describe('AssistantPane', () => {
  it('sends a prompt, shows tool chips and an editable proposal, and applies it', async () => {
    const user = userEvent.setup();
    const { store, session } = await setup();
    expect(screen.getByTestId('assistant-health')).toHaveAttribute('data-health', 'demo');

    await user.click(screen.getByText('group by desk then book, pin notional right and sum it'));
    await user.click(screen.getByLabelText('Send'));

    const card = await screen.findByTestId('patch-diff-card');
    expect(card).toHaveAttribute('data-status', 'proposed');
    expect(screen.getByText('Group by desk then book')).toBeInTheDocument();
    expect(screen.getAllByTestId('tool-chip').map((c) => c.dataset['tool'])).toEqual([
      'get_config',
      'propose_patch',
    ]);
    // Friendly path labels resolved against the document.
    expect(within(card).getByText('Layout › Blotter › row group columns')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('assistant-pane')).toHaveAttribute('data-status', 'awaiting-approval'),
    );

    await user.click(within(card).getByRole('button', { name: /apply/i }));
    await waitFor(() => expect(store.current?.revision).toBe(1));
    expect(store.current?.modules.layout?.data.layouts[0]?.rowGroupColumns).toEqual(['desk', 'book']);
    expect(screen.getByTestId('patch-diff-card')).toHaveAttribute('data-status', 'applied');
    expect(session.state.status).toBe('idle');
  });

  it('shows the fallback banner and disables the composer when the server is down', async () => {
    const store = new ConfigStore({ adapter: new MemoryAdapter(), persistDebounceMs: 0 });
    await store.init(config());
    const provider = new MockProvider(demoScript, { healthy: false });
    const session = new AssistantSession({ provider, model: 'mock', store, getColumns: () => COLUMNS });
    await session.checkHealth();
    let switched = false;
    render(
      <AssistantPane
        session={session}
        config={store.current}
        settings={{ ...DEFAULT_ASSISTANT_SETTINGS, demo: false }}
        onSettingsChange={(s) => {
          switched = s.demo;
        }}
      />,
    );
    const banner = screen.getByTestId('assistant-health');
    expect(banner).toHaveAttribute('data-health', 'down');
    expect(banner).toHaveTextContent('module tabs');
    expect(screen.getByTestId('assistant-composer')).toBeDisabled();
    await userEvent.setup().click(screen.getByText('Use demo mode'));
    expect(switched).toBe(true);
  });
});

describe('proposal editors', () => {
  const registry = defaultEditorRegistry();

  it('locates schema nodes through arrays, records and unions', () => {
    expect(schemaNodeAt('/modules/layout/data/layouts/0/rowGroupColumns')?.node['x-editor']).toBe('columns');
    expect(schemaNodeAt('/modules/layout/data/layouts/0/columnPinning/notional')?.node['enum']).toBeDefined();
    expect(schemaNodeAt('/modules/formatting/data/formatColumns/-/style')?.node['x-editor']).toBe('style');
    expect(schemaNodeAt('/modules/nope/data/x')).toBeUndefined();
    expect(schemaNodeAt('/modules/layout/data/layouts/0/notAKey')).toBeUndefined();
  });

  it('returns registry editors for hinted values and a form for objects', () => {
    const cols = resolveProposalEditor('/modules/layout/data/layouts/0/rowGroupColumns', ['desk'], {
      registry,
    });
    expect(cols?.hint).toBe('columns');
    expect(cols?.component).toBeUndefined();
    const obj = resolveProposalEditor('/modules/formatting/data/formatColumns/-', {}, { registry });
    expect(obj?.component).toBeDefined();
    expect(obj?.mode).toBe('popover');
    expect(resolveProposalEditor('/gridId', 'x', { registry })).toBeUndefined();
  });

  it('describes paths with object names from the document', () => {
    const cfg = config();
    expect(describeConfigPath('/modules/layout/data/layouts/0/columnPinning/notional', cfg)).toBe(
      'Layout › Blotter › column pinning › notional',
    );
    expect(describeConfigPath('/modules/formatting/data/formatColumns/-', cfg)).toBe(
      'Formatting › format columns › new',
    );
  });
});
