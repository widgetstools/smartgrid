// @smartgrid/schema — Zod schemas for the SmartGrid config document.
//
// Every editable fragment carries an `x-editor` hint (see ./meta.ts) so the
// forms renderer and the assistant's tool UIs resolve the same editor.

export * from './meta.js';
export * from './primitives/index.js';
export * from './modules/index.js';
export * from './document.js';
export * from './jsonSchema.js';
export { z } from 'zod';
