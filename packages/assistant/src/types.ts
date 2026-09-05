/**
 * Assistant contracts. The model layer speaks OpenAI chat-completion
 * shapes (the local Copilot server and most gateways do); the session loop
 * owns proposals, validation and approval; the UI subscribes to events.
 */
import type { Operation } from 'fast-json-patch';
import type { ColumnInfo, GridConfig, ModuleId } from '@smartgrid/schema';

// ---------------------------------------------------------------------------
// Model layer
// ---------------------------------------------------------------------------

export interface ToolCall {
  id: string;
  name: string;
  /** Raw JSON text of the arguments, as produced by the model. */
  arguments: string;
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; name: string; content: string };

export interface ToolSchema {
  name: string;
  description: string;
  /** JSON Schema for the arguments object. */
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolSchema[];
  toolChoice?: 'auto' | 'none' | 'required';
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ChatHandlers {
  /** Streamed assistant text. */
  onText?(delta: string): void;
  /** A tool call whose arguments are complete. */
  onToolCall?(call: ToolCall): void;
}

export interface ChatResult {
  text: string;
  toolCalls: ToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error' | 'aborted';
  usage?: { promptTokens?: number; completionTokens?: number };
  model?: string;
}

export interface HealthStatus {
  ok: boolean;
  latencyMs?: number;
  models?: string[];
  error?: string;
  checkedAt: number;
}

export interface ModelProvider {
  readonly id: string;
  chat(request: ChatRequest, handlers?: ChatHandlers): Promise<ChatResult>;
  health(): Promise<HealthStatus>;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export interface ToolContext {
  getConfig(): GridConfig;
  getColumns(): readonly ColumnInfo[];
  session: SessionToolApi;
}

/** What tools may ask of the session (proposals, undo). */
export interface SessionToolApi {
  propose(input: { module?: ModuleId; ops: Operation[]; rationale: string; title?: string }): Proposal;
  undo(): Promise<{ ok: boolean; revision?: number; message: string }>;
  applyProposal(id: string): Promise<{ ok: boolean; revision?: number; message: string }>;
  policy: SessionPolicy;
}

export interface ToolDefinition extends ToolSchema {
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> | unknown;
  /** Do not show a call chip in the transcript (read-only lookups). */
  quiet?: boolean;
}

// ---------------------------------------------------------------------------
// Validation and proposals
// ---------------------------------------------------------------------------

export interface PatchIssue {
  /** JSON pointer into the config document. */
  path: string;
  message: string;
  /** Character range inside a string value (expressions). */
  start?: number;
  end?: number;
}

export interface PatchValidation {
  ok: boolean;
  errors: PatchIssue[];
  warnings: PatchIssue[];
  /** The document after applying the patch, when it applied. */
  next?: GridConfig;
  /** Modules touched by the patch. */
  modules: ModuleId[];
}

export type ProposalStatus = 'proposed' | 'applied' | 'rejected' | 'invalid' | 'superseded';

export interface Proposal {
  id: string;
  title: string;
  rationale: string;
  patch: Operation[];
  validation: PatchValidation;
  status: ProposalStatus;
  /** Revision the patch was proposed against. */
  baseRevision: number;
  /** Revision produced when applied. */
  appliedRevision?: number;
  /** Prompt that led to this proposal. */
  prompt: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface SessionPolicy {
  /** Apply valid proposals without asking. Off by default. */
  autoApply: boolean;
  /** How many times the model may retry after validation errors before giving up. */
  maxSelfCorrections: number;
  /** Hard cap on tool-call rounds per user turn. */
  maxSteps: number;
  temperature?: number;
}

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'tool'; call: ToolCall; result?: string; error?: string; quiet?: boolean; durationMs?: number }
  | { type: 'proposal'; proposalId: string };

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: MessagePart[];
  createdAt: number;
  /** Still being streamed. */
  pending?: boolean;
}

export type SessionStatus = 'idle' | 'thinking' | 'streaming' | 'tools' | 'awaiting-approval' | 'error';

export interface SessionState {
  status: SessionStatus;
  messages: UiMessage[];
  proposals: Proposal[];
  health?: HealthStatus;
  error?: string;
  model: string;
}

export type SessionEvent =
  | { type: 'state'; state: SessionState }
  | { type: 'delta'; messageId: string; text: string }
  | { type: 'proposal'; proposal: Proposal }
  | { type: 'applied'; proposal: Proposal }
  | { type: 'error'; message: string };

export type SessionListener = (event: SessionEvent) => void;
