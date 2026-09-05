import { EDITOR_HINTS, type EditorHint } from '@smartgrid/schema';
import type { EditorComponent, EditorRegistration } from './types.js';

/**
 * Maps `x-editor` hints to components. The forms renderer and the
 * assistant's tool UIs both resolve through this, so registering an editor
 * once makes it available in every host.
 */
export class EditorRegistry {
  private map = new Map<EditorHint, EditorRegistration>();

  register<T>(reg: EditorRegistration<T>): this {
    this.map.set(reg.hint, reg as EditorRegistration);
    return this;
  }

  get<T = unknown>(hint: EditorHint): EditorRegistration<T> | undefined {
    return this.map.get(hint) as EditorRegistration<T> | undefined;
  }

  component<T = unknown>(hint: EditorHint): EditorComponent<T> | undefined {
    return this.get<T>(hint)?.component;
  }

  has(hint: string): boolean {
    return this.map.has(hint as EditorHint);
  }

  hints(): EditorHint[] {
    return [...this.map.keys()];
  }

  /** Hints declared in the schema package that have no editor registered. */
  missing(): EditorHint[] {
    return EDITOR_HINTS.filter((h) => !this.map.has(h));
  }
}
