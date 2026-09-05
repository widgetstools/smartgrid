// @smartgrid/assistant — model-agnostic assistant loop over the config document.
export * from './types.js';
export { AssistantSession, DEFAULT_POLICY, type AssistantSessionOptions } from './session.js';
export {
  OpenAiCompatibleProvider,
  readSse,
  type OpenAiCompatibleOptions,
} from './providers/openaiCompatible.js';
export { MockProvider, demoScript, lastTurn, type MockScript, type MockTurn } from './providers/mock.js';
export { validatePatch, modulesTouched } from './validator.js';
export { buildSystemPrompt, MODULE_SUMMARIES, type PromptInput } from './prompt.js';
export { TOOLS, toolSchemas, explainColumn } from './tools.js';
