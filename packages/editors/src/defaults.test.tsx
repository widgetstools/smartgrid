import { describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EDITOR_HINTS } from '@smartgrid/schema';
import { EditorContextProvider } from './context.js';
import { STRUCTURAL_HINTS, defaultEditorRegistry, registerDefaultEditors } from './defaults.js';
import { EditorRegistry } from './registry.js';
import { FIXTURE_CONTEXT } from './test/fixtures.js';

describe('default editor registry', () => {
  it('covers every hint: leaf hints have an editor, the rest are structural', () => {
    const registry = registerDefaultEditors();
    expect(registry.missing().sort()).toEqual([...STRUCTURAL_HINTS].sort());
    for (const hint of EDITOR_HINTS) {
      expect(registry.has(hint) || STRUCTURAL_HINTS.includes(hint)).toBe(true);
    }
    expect(defaultEditorRegistry()).toBe(defaultEditorRegistry());
  });

  it('registers onto an existing registry and reports titles', () => {
    const registry = new EditorRegistry();
    registerDefaultEditors(registry);
    expect(registry.get('style')?.title).toBe('Style');
    expect(registry.component('color')).toBeTypeOf('function');
  });

  it('every registered editor renders with an undefined value in all three modes', () => {
    const registry = registerDefaultEditors();
    for (const hint of registry.hints()) {
      const Editor = registry.component(hint)!;
      for (const mode of ['inline', 'popover', 'panel'] as const) {
        const { container } = render(
          <EditorContextProvider value={FIXTURE_CONTEXT}>
            <Editor value={undefined} onChange={() => {}} mode={mode} label={hint} />
          </EditorContextProvider>,
        );
        expect(container.querySelector('.sg-field'), `${hint} in ${mode} mode`).not.toBeNull();
        if (mode === 'panel')
          expect(screen.getAllByText(hint, { exact: false }).length, `${hint} label`).toBeGreaterThan(0);
        cleanup();
      }
    }
  });
});
