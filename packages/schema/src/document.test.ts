import { describe, expect, it } from 'vitest';
import { MODULE_IDS, createGridConfig, parseGridConfig } from './document.js';
import { defaultTableLayout } from './modules/layout.js';
import { allModuleJsonSchemas, collectEditorHints, moduleJsonSchema } from './jsonSchema.js';
import { EDITOR_HINTS } from './meta.js';

describe('GridConfig', () => {
  it('creates a document with every module except layout seeded', () => {
    const cfg = createGridConfig('g1');
    expect(cfg.modules.formatting?.data.formatColumns).toEqual([]);
    expect(cfg.modules.layout).toBeUndefined();
  });

  it('round-trips through JSON and parses typed modules', () => {
    const cfg = createGridConfig('g1');
    cfg.modules.layout = {
      v: 1,
      data: { currentLayoutId: 'a', layouts: [defaultTableLayout('a', 'A', ['x', 'y'])] },
    };
    const raw = JSON.parse(JSON.stringify(cfg));
    const result = parseGridConfig(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.modules.layout?.data.layouts[0]?.columns).toEqual(['x', 'y']);
      expect(result.unknownModules).toEqual([]);
    }
  });

  it('reports module issues with the module id', () => {
    const result = parseGridConfig({
      schemaVersion: 1,
      gridId: 'g',
      modules: { formatting: { v: 1, data: { formatColumns: [{ id: 'x' }] } } },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.moduleIssues[0]?.moduleId).toBe('formatting');
  });

  it('preserves unknown modules', () => {
    const result = parseGridConfig({
      schemaVersion: 1,
      gridId: 'g',
      modules: { future: { v: 3, data: {} } },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.unknownModules).toEqual(['future']);
  });
});

describe('JSON Schema export', () => {
  it('exports every module with x-editor hints intact', () => {
    const all = allModuleJsonSchemas();
    for (const id of MODULE_IDS) {
      const hints = collectEditorHints(all[id]);
      expect(hints.length, `${id} has editor hints`).toBeGreaterThan(0);
      for (const h of hints) expect(EDITOR_HINTS).toContain(h.editor);
    }
  });

  it('keeps editor options on expression fragments', () => {
    const s = moduleJsonSchema('layout');
    const json = JSON.stringify(s);
    expect(json).toContain('"x-editor":"expression"');
    expect(json).toContain('"kind":"boolean"');
  });

  it('marks defaults optional for input', () => {
    const s = moduleJsonSchema('formatting') as { required?: string[] };
    expect(s.required ?? []).not.toContain('formatColumns');
  });
});
