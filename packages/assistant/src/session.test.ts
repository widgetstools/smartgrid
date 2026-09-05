import { describe, expect, it } from 'vitest';
import { AssistantSession } from './session.js';
import { MockProvider, demoScript, lastTurn, type MockScript } from './providers/mock.js';
import type { SessionEvent, SessionPolicy } from './types.js';
import { COLUMNS, fixtureStore } from './test/fixtures.js';

async function makeSession(script: MockScript, policy?: Partial<SessionPolicy>) {
  const store = await fixtureStore();
  const provider = new MockProvider(script);
  const session = new AssistantSession({ provider, model: 'mock', store, getColumns: () => COLUMNS, policy });
  const events: SessionEvent[] = [];
  session.subscribe((e) => events.push(e));
  return { store, provider, session, events };
}

describe('AssistantSession with the demo script', () => {
  it('reads the layout, proposes a valid patch and waits for approval', async () => {
    const { store, provider, session, events } = await makeSession(demoScript);
    const reply = await session.send('group by desk then book, pin notional right and sum it');

    expect(session.state.status).toBe('awaiting-approval');
    const proposals = session.state.proposals;
    expect(proposals).toHaveLength(1);
    const p = proposals[0]!;
    expect(p.status).toBe('proposed');
    expect(p.validation.ok).toBe(true);
    expect(p.title).toBe('Group by desk then book');
    expect(p.patch.map((o) => o.path)).toEqual([
      '/modules/layout/data/layouts/0/rowGroupColumns',
      '/modules/layout/data/layouts/0/columnPinning/notional',
      '/modules/layout/data/layouts/0/aggregations',
    ]);

    // Transcript: tool chips for get_config (quiet) and propose_patch, then a proposal part and a summary.
    const kinds = reply.parts.map((x) => x.type);
    expect(kinds).toEqual(['tool', 'tool', 'proposal', 'text']);
    expect(reply.parts[0]).toMatchObject({ type: 'tool', quiet: true, call: { name: 'get_config' } });
    expect(reply.pending).toBe(false);
    expect(events.some((e) => e.type === 'delta')).toBe(true);
    expect(events.filter((e) => e.type === 'proposal')).toHaveLength(1);

    // Three model calls: read, propose, summary. The tool results were fed back.
    expect(provider.calls).toHaveLength(3);
    const toolMsgs = provider.calls[2]!.messages.filter((m) => m.role === 'tool');
    expect(toolMsgs.map((m) => m.role === 'tool' && m.name)).toEqual(['get_config', 'propose_patch']);
    expect(provider.calls[0]!.messages[0]).toMatchObject({ role: 'system' });
    expect((provider.calls[0]!.messages[0] as { content: string }).content).toMatch(/desk "Desk" text/);

    // Nothing applied yet.
    expect(store.current?.revision).toBe(0);

    const result = await session.approve(p.id);
    expect(result.ok).toBe(true);
    expect(store.current?.revision).toBe(1);
    expect(store.current?.modules.layout?.data.layouts[0]?.rowGroupColumns).toEqual(['desk', 'book']);
    expect(store.current?.modules.layout?.data.layouts[0]?.columnPinning).toMatchObject({
      notional: 'right',
    });
    expect(session.state.status).toBe('idle');
    expect(session.getProposal(p.id)?.status).toBe('applied');
    const history = await store.history();
    expect(history.at(-1)).toMatchObject({
      origin: 'assistant',
      model: 'mock',
      prompt: 'group by desk then book, pin notional right and sum it',
    });
    expect(events.some((e) => e.type === 'applied')).toBe(true);
  });

  it('undo through the tool reverts an applied proposal', async () => {
    const { store, session } = await makeSession(demoScript);
    await session.send('make negative pnl red');
    const p = session.state.proposals[0]!;
    await session.approve(p.id);
    expect(store.current?.modules.formatting?.data.formatColumns).toHaveLength(1);

    await session.send('undo that');
    expect(store.current?.revision).toBe(0);
    expect(store.current?.modules.formatting?.data.formatColumns).toHaveLength(0);
    expect(session.getProposal(p.id)?.status).toBe('rejected');
  });

  it('rejecting a proposal leaves the document alone', async () => {
    const { store, session } = await makeSession(demoScript);
    await session.send('flash pnl when it drops more than 3%');
    const p = session.state.proposals[0]!;
    expect(p.validation.ok).toBe(true);
    expect(p.patch[0]).toMatchObject({ path: '/modules/flashing/data/flashingCells/-' });
    session.reject(p.id);
    expect(session.state.status).toBe('idle');
    expect(store.current?.revision).toBe(0);
  });

  it('answers questions with quiet tools and no proposal', async () => {
    const { session } = await makeSession(demoScript);
    const reply = await session.send('what columns are there?');
    expect(session.state.proposals).toHaveLength(0);
    expect(session.state.status).toBe('idle');
    const text = reply.parts.find((p) => p.type === 'text');
    expect(text && text.type === 'text' ? text.text : '').toMatch(/7 columns/);
  });
});

describe('self-correction', () => {
  const badThenGood: MockScript = (messages) => {
    const { toolResults } = lastTurn(messages);
    const attempts = toolResults.filter((t) => t.name === 'propose_patch');
    if (attempts.length === 0) {
      return {
        toolCalls: [
          {
            name: 'propose_patch',
            args: {
              rationale: 'first try',
              ops: [
                { op: 'replace', path: '/modules/layout/data/layouts/0/rowGroupColumns', value: ['Desk'] },
              ],
            },
          },
        ],
      };
    }
    const last = attempts.at(-1)!;
    if (/"ok":false/.test(last.content) && attempts.length < 5) {
      // Tool results are JSON text, so the quotes inside the message are escaped.
      const fixed = /use the column id \\"desk\\"/.test(last.content) ? 'desk' : 'Desk';
      return {
        toolCalls: [
          {
            name: 'propose_patch',
            args: {
              rationale: 'second try',
              ops: [
                { op: 'replace', path: '/modules/layout/data/layouts/0/rowGroupColumns', value: [fixed] },
              ],
            },
          },
        ],
      };
    }
    return { text: 'Done.' };
  };

  it('feeds validation errors back and supersedes the invalid attempt', async () => {
    const { session } = await makeSession(badThenGood);
    await session.send('group by desk');
    const [first, second] = session.state.proposals;
    expect(first?.status).toBe('invalid');
    expect(first?.validation.errors[0]?.message).toMatch(/use the column id "desk"/);
    expect(second?.status).toBe('proposed');
    expect(session.state.status).toBe('awaiting-approval');
  });

  it('stops after maxSelfCorrections invalid attempts', async () => {
    const alwaysBad: MockScript = (messages) => {
      const { toolResults } = lastTurn(messages);
      const last = toolResults.filter((t) => t.name === 'propose_patch').at(-1);
      if (last && /too many invalid attempts/.test(last.content)) return { text: 'I could not do that.' };
      return {
        toolCalls: [
          {
            name: 'propose_patch',
            args: {
              rationale: 'x',
              ops: [{ op: 'replace', path: '/modules/layout/data/layouts/9/name', value: 'y' }],
            },
          },
        ],
      };
    };
    const { session, provider } = await makeSession(alwaysBad, { maxSelfCorrections: 2 });
    const reply = await session.send('rename layout');
    expect(session.state.proposals).toHaveLength(3);
    expect(session.state.proposals.every((p) => p.status === 'invalid')).toBe(true);
    expect(session.state.status).toBe('idle');
    expect(reply.parts.at(-1)).toMatchObject({ type: 'text', text: 'I could not do that.' });
    expect(provider.calls.length).toBeLessThanOrEqual(4);
  });
});

describe('policies and edge cases', () => {
  it('autoApply applies valid proposals immediately', async () => {
    const { store, session } = await makeSession(demoScript, { autoApply: true });
    await session.send('group by desk');
    expect(store.current?.revision).toBe(1);
    expect(session.state.proposals[0]?.status).toBe('applied');
    expect(session.state.status).toBe('idle');
  });

  it('re-validates a proposal when the document moved on', async () => {
    const { store, session } = await makeSession(demoScript);
    await session.send('group by desk');
    const p = session.state.proposals[0]!;
    await store.apply([{ op: 'replace', path: '/modules/layout/data/layouts/0/name', value: 'Renamed' }], {
      origin: 'form',
    });
    const r = await session.approve(p.id);
    expect(r.ok).toBe(true);
    expect(store.current?.revision).toBe(2);
    expect(store.current?.modules.layout?.data.layouts[0]?.name).toBe('Renamed');
    expect(store.current?.modules.layout?.data.layouts[0]?.rowGroupColumns).toEqual(['desk']);
  });

  it('updateProposal re-validates edited patches', async () => {
    const { session } = await makeSession(demoScript);
    await session.send('group by desk');
    const p = session.state.proposals[0]!;
    const edited = session.updateProposal(p.id, [
      { op: 'replace', path: '/modules/layout/data/layouts/0/rowGroupColumns', value: ['nope'] },
    ]);
    expect(edited?.status).toBe('invalid');
    session.updateProposal(p.id, [
      { op: 'replace', path: '/modules/layout/data/layouts/0/rowGroupColumns', value: ['book'] },
    ]);
    expect(session.getProposal(p.id)?.status).toBe('proposed');
  });

  it('handles unknown tools and malformed arguments without crashing', async () => {
    let step = 0;
    const script: MockScript = () => {
      step++;
      if (step === 1) return { toolCalls: [{ name: 'nonexistent', args: {} }] };
      return { text: 'ok' };
    };
    const { session, provider } = await makeSession(script);
    const reply = await session.send('hi');
    expect(reply.parts[0]).toMatchObject({ type: 'tool', error: 'Unknown tool nonexistent' });
    const fed = provider.calls[1]!.messages.at(-1);
    expect(fed?.role === 'tool' && fed.content).toMatch(/available/);
    expect(session.state.status).toBe('idle');
  });

  it('surfaces provider errors as session errors', async () => {
    const { session } = await makeSession(() => {
      throw new Error('server down');
    });
    await session.send('hi');
    expect(session.state.status).toBe('error');
    expect(session.state.error).toBe('server down');
    // A later request recovers.
    session.reset();
    expect(session.state.status).toBe('idle');
  });

  it('caps the number of tool rounds', async () => {
    const { session, provider } = await makeSession(
      () => ({ toolCalls: [{ name: 'get_columns', args: {} }] }),
      {
        maxSteps: 3,
      },
    );
    await session.send('loop');
    expect(provider.calls).toHaveLength(3);
    expect(session.state.status).toBe('idle');
  });
});
