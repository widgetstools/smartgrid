/**
 * The assistant session: one conversation bound to a config store. It runs
 * the model loop (stream text, execute tools, feed results back), turns
 * `propose_patch` calls into validated proposals, and applies approved
 * proposals through the store so the patch log records prompt, model and
 * rationale. UI code subscribes to events and renders `state`.
 */
import type { Operation } from 'fast-json-patch';
import type { ColumnInfo, GridConfig, ModuleId } from '@smartgrid/schema';
import { MODULE_IDS } from '@smartgrid/schema';
import type { ConfigStore } from '@smartgrid/store';
import { buildSystemPrompt } from './prompt.js';
import { TOOLS, toolSchemas } from './tools.js';
import { validatePatch } from './validator.js';
import type {
  ChatMessage,
  MessagePart,
  ModelProvider,
  Proposal,
  SessionEvent,
  SessionListener,
  SessionPolicy,
  SessionState,
  SessionStatus,
  SessionToolApi,
  ToolCall,
  ToolContext,
  ToolDefinition,
  UiMessage,
} from './types.js';

export interface AssistantSessionOptions {
  provider: ModelProvider;
  model: string;
  store: ConfigStore;
  getColumns: () => readonly ColumnInfo[];
  /** Defaults to `store.current`. */
  getConfig?: () => GridConfig;
  policy?: Partial<SessionPolicy>;
  tools?: readonly ToolDefinition[];
  /** Extra text appended to the system prompt (site conventions, preferences). */
  systemPromptSuffix?: string;
  now?: () => number;
  idGen?: () => string;
}

export const DEFAULT_POLICY: SessionPolicy = {
  autoApply: false,
  maxSelfCorrections: 3,
  maxSteps: 8,
  temperature: 0.1,
};

let seq = 0;
const defaultId = () => `${Date.now().toString(36)}-${(++seq).toString(36)}`;

export class AssistantSession {
  readonly policy: SessionPolicy;
  private readonly provider: ModelProvider;
  private readonly store: ConfigStore;
  private readonly getColumns: () => readonly ColumnInfo[];
  private readonly getConfigFn: () => GridConfig;
  private readonly tools: readonly ToolDefinition[];
  private readonly suffix: string;
  private readonly now: () => number;
  private readonly idGen: () => string;
  private readonly listeners = new Set<SessionListener>();
  private readonly proposals = new Map<string, Proposal>();
  private history: ChatMessage[] = [];
  private messages: UiMessage[] = [];
  private status: SessionStatus = 'idle';
  private error: string | undefined;
  private health: SessionState['health'];
  private abort: AbortController | undefined;
  private currentPrompt = '';
  private lastProposalInTurn: Proposal | undefined;
  private corrections = 0;
  model: string;

  constructor(opts: AssistantSessionOptions) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.store = opts.store;
    this.getColumns = opts.getColumns;
    this.getConfigFn =
      opts.getConfig ??
      (() => {
        const c = this.store.current;
        if (!c) throw new Error('The config store has no document');
        return c;
      });
    this.policy = { ...DEFAULT_POLICY, ...opts.policy };
    this.tools = opts.tools ?? TOOLS;
    this.suffix = opts.systemPromptSuffix ?? '';
    this.now = opts.now ?? (() => Date.now());
    this.idGen = opts.idGen ?? defaultId;
  }

  // ---- state ---------------------------------------------------------------

  get state(): SessionState {
    return {
      status: this.status,
      messages: this.messages,
      proposals: [...this.proposals.values()],
      health: this.health,
      error: this.error,
      model: this.model,
    };
  }

  get busy(): boolean {
    return this.status === 'thinking' || this.status === 'streaming' || this.status === 'tools';
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: SessionEvent): void {
    for (const l of this.listeners) l(event);
  }

  private publish(): void {
    this.emit({ type: 'state', state: this.state });
  }

  private setStatus(status: SessionStatus): void {
    this.status = status;
    this.publish();
  }

  async checkHealth() {
    this.health = await this.provider.health();
    this.publish();
    return this.health;
  }

  /** Forget the transcript and proposals (the config document is untouched). */
  reset(): void {
    this.cancel();
    this.history = [];
    this.messages = [];
    this.proposals.clear();
    this.error = undefined;
    this.status = 'idle';
    this.publish();
  }

  cancel(): void {
    this.abort?.abort();
    this.abort = undefined;
  }

  // ---- the loop ------------------------------------------------------------

  async send(text: string): Promise<UiMessage> {
    const prompt = text.trim();
    if (!prompt) throw new Error('Empty prompt');
    if (this.busy) throw new Error('The assistant is still working on the previous request');
    this.currentPrompt = prompt;
    this.lastProposalInTurn = undefined;
    this.corrections = 0;
    this.error = undefined;

    // Proposals still open from earlier turns are superseded by a new request.
    for (const p of this.proposals.values()) {
      if (p.status === 'proposed') p.status = 'superseded';
    }

    this.messages = [...this.messages, this.uiMessage('user', [{ type: 'text', text: prompt }])];
    this.history.push({ role: 'user', content: prompt });
    const reply = this.uiMessage('assistant', [], true);
    this.messages = [...this.messages, reply];
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.setStatus('thinking');

    try {
      for (let step = 0; step < this.policy.maxSteps; step++) {
        const result = await this.provider.chat(
          {
            model: this.model,
            messages: [{ role: 'system', content: this.systemPrompt() }, ...this.history],
            tools: toolSchemas(this.tools),
            temperature: this.policy.temperature,
            signal,
          },
          {
            onText: (delta) => {
              this.appendText(reply, delta);
              if (this.status !== 'streaming') this.status = 'streaming';
              this.emit({ type: 'delta', messageId: reply.id, text: delta });
            },
          },
        );
        if (result.finishReason === 'aborted' || signal.aborted) break;
        // Providers that do not stream deliver the text only in the result.
        const streamed = textOf(reply);
        if (result.text && result.text !== streamed) {
          const missing = result.text.startsWith(streamed) ? result.text.slice(streamed.length) : result.text;
          if (missing) this.appendText(reply, missing);
        }
        this.history.push({ role: 'assistant', content: result.text || null, tool_calls: result.toolCalls });
        if (!result.toolCalls.length) break;

        this.setStatus('tools');
        let stop = false;
        for (const call of result.toolCalls) {
          const outcome = await this.runTool(call, reply);
          this.history.push({
            role: 'tool',
            tool_call_id: call.id,
            name: call.name,
            content: outcome.content,
          });
          if (outcome.stopAfter) stop = true;
        }
        if (stop) {
          // A valid proposal ends the turn; let the model write its one-line summary.
          const summary = await this.provider.chat(
            {
              model: this.model,
              messages: [{ role: 'system', content: this.systemPrompt() }, ...this.history],
              temperature: this.policy.temperature,
              signal,
            },
            {
              onText: (delta) => {
                this.appendText(reply, delta);
                this.emit({ type: 'delta', messageId: reply.id, text: delta });
              },
            },
          );
          const streamedNow = textOf(reply);
          if (summary.text && !streamedNow.endsWith(summary.text)) this.appendText(reply, summary.text);
          this.history.push({ role: 'assistant', content: summary.text || null });
          break;
        }
        this.setStatus('thinking');
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.emit({ type: 'error', message: this.error });
    } finally {
      reply.pending = false;
      this.abort = undefined;
      // Read through the map: TS cannot see the callbacks that set lastProposalInTurn.
      const last = this.lastProposalInTurn as Proposal | undefined;
      this.status = this.error ? 'error' : last?.status === 'proposed' ? 'awaiting-approval' : 'idle';
      this.publish();
    }
    return reply;
  }

  private async runTool(call: ToolCall, reply: UiMessage): Promise<{ content: string; stopAfter: boolean }> {
    const tool = this.tools.find((t) => t.name === call.name);
    const part: Extract<MessagePart, { type: 'tool' }> = { type: 'tool', call, quiet: tool?.quiet };
    reply.parts = [...reply.parts, part];
    this.publish();
    const started = this.now();
    let content: string;
    let stopAfter = false;
    if (!tool) {
      part.error = `Unknown tool ${call.name}`;
      content = JSON.stringify({ error: part.error, available: this.tools.map((t) => t.name) });
    } else {
      let args: Record<string, unknown>;
      try {
        args = call.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : {};
      } catch {
        part.error = 'Arguments were not valid JSON';
        content = JSON.stringify({ error: part.error });
        part.durationMs = this.now() - started;
        this.publish();
        return { content, stopAfter };
      }
      try {
        const result = await tool.execute(args, this.toolContext());
        content = typeof result === 'string' ? result : JSON.stringify(result ?? null);
        part.result = content;
        if (call.name === 'propose_patch' && this.lastProposalInTurn) {
          const p = this.lastProposalInTurn;
          reply.parts = [...reply.parts, { type: 'proposal', proposalId: p.id }];
          if (p.validation.ok) {
            if (this.policy.autoApply) {
              const applied = await this.approve(p.id);
              if (!applied.ok)
                content = JSON.stringify({ ...JSON.parse(content), applyError: applied.message });
            }
            stopAfter = true;
          } else {
            this.corrections++;
            if (this.corrections > this.policy.maxSelfCorrections) {
              content = JSON.stringify({
                ...(JSON.parse(content) as object),
                status: 'too many invalid attempts; stop and tell the user what could not be done',
              });
              stopAfter = true;
            }
          }
        }
      } catch (e) {
        part.error = e instanceof Error ? e.message : String(e);
        content = JSON.stringify({ error: part.error });
      }
    }
    part.durationMs = this.now() - started;
    this.publish();
    return { content, stopAfter };
  }

  private toolContext(): ToolContext {
    const api: SessionToolApi = {
      propose: (input) => this.propose(input),
      undo: () => this.undo(),
      applyProposal: (id) => this.approve(id),
      policy: this.policy,
    };
    return { getConfig: () => this.getConfigFn(), getColumns: () => this.getColumns(), session: api };
  }

  private systemPrompt(): string {
    const config = this.getConfigFn();
    const modules = MODULE_IDS.filter((m) => config.modules[m as ModuleId]) as ModuleId[];
    const base = buildSystemPrompt({ gridId: config.gridId, columns: this.getColumns(), modules });
    return this.suffix ? `${base}\n\n${this.suffix}` : base;
  }

  // ---- proposals -----------------------------------------------------------

  propose(input: { module?: ModuleId; ops: Operation[]; rationale: string; title?: string }): Proposal {
    const config = this.getConfigFn();
    const ops = Array.isArray(input.ops) ? input.ops : [];
    const validation = validatePatch(config, ops, this.getColumns());
    const proposal: Proposal = {
      id: this.idGen(),
      title: input.title?.trim() || titleFor(input.module, ops),
      rationale: input.rationale,
      patch: ops,
      validation,
      status: validation.ok ? 'proposed' : 'invalid',
      baseRevision: config.revision,
      prompt: this.currentPrompt,
      createdAt: this.now(),
    };
    // A retry supersedes the previous attempt of this turn.
    if (this.lastProposalInTurn && this.lastProposalInTurn.status === 'proposed') {
      this.lastProposalInTurn.status = 'superseded';
    }
    this.proposals.set(proposal.id, proposal);
    this.lastProposalInTurn = proposal;
    this.emit({ type: 'proposal', proposal });
    this.publish();
    return proposal;
  }

  getProposal(id: string): Proposal | undefined {
    return this.proposals.get(id);
  }

  /** Replace a proposal's patch (inline edits in the diff card) and re-validate. */
  updateProposal(id: string, patch: Operation[]): Proposal | undefined {
    const p = this.proposals.get(id);
    if (!p || p.status === 'applied') return p;
    p.patch = patch;
    p.validation = validatePatch(this.getConfigFn(), patch, this.getColumns());
    p.status = p.validation.ok ? 'proposed' : 'invalid';
    this.publish();
    return p;
  }

  async approve(id: string): Promise<{ ok: boolean; revision?: number; message: string }> {
    const p = this.proposals.get(id);
    if (!p) return { ok: false, message: `Unknown proposal ${id}` };
    if (p.status === 'applied') return { ok: true, revision: p.appliedRevision, message: 'Already applied' };
    const config = this.getConfigFn();
    if (config.revision !== p.baseRevision) {
      // The document moved on (forms, another proposal). Re-validate against the current revision.
      p.validation = validatePatch(config, p.patch, this.getColumns());
      p.baseRevision = config.revision;
    }
    if (!p.validation.ok) {
      p.status = 'invalid';
      this.publish();
      return { ok: false, message: p.validation.errors.map((e) => e.message).join('; ') };
    }
    try {
      const entry = await this.store.apply(p.patch, {
        origin: 'assistant',
        prompt: p.prompt,
        model: this.model,
        rationale: p.rationale,
        expectedRevision: p.baseRevision,
      });
      p.status = 'applied';
      p.appliedRevision = entry.revision;
      this.emit({ type: 'applied', proposal: p });
      if (this.status === 'awaiting-approval') this.status = 'idle';
      this.publish();
      return { ok: true, revision: entry.revision, message: `Applied as revision ${entry.revision}` };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      p.status = 'invalid';
      p.validation = { ...p.validation, ok: false, errors: [{ path: '', message }] };
      this.publish();
      return { ok: false, message };
    }
  }

  reject(id: string): void {
    const p = this.proposals.get(id);
    if (!p || p.status === 'applied') return;
    p.status = 'rejected';
    if (this.status === 'awaiting-approval') this.status = 'idle';
    this.publish();
  }

  /** Undo the last store change (any origin); an applied proposal becomes rejected. */
  async undo(): Promise<{ ok: boolean; revision?: number; message: string }> {
    const entry = await this.store.undo();
    if (!entry) return { ok: false, message: 'Nothing to undo' };
    for (const p of this.proposals.values()) {
      if (p.status === 'applied' && p.appliedRevision === entry.revision) p.status = 'rejected';
    }
    this.publish();
    return { ok: true, revision: entry.baseRevision, message: `Reverted to revision ${entry.baseRevision}` };
  }

  // ---- helpers -------------------------------------------------------------

  private uiMessage(role: UiMessage['role'], parts: MessagePart[], pending = false): UiMessage {
    return { id: this.idGen(), role, parts, createdAt: this.now(), pending };
  }

  private appendText(msg: UiMessage, delta: string): void {
    const last = msg.parts.at(-1);
    if (last?.type === 'text') {
      msg.parts = [...msg.parts.slice(0, -1), { type: 'text', text: last.text + delta }];
    } else {
      msg.parts = [...msg.parts, { type: 'text', text: delta }];
    }
  }
}

function textOf(msg: UiMessage): string {
  return msg.parts
    .filter((p): p is Extract<MessagePart, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

function titleFor(module: ModuleId | undefined, ops: readonly Operation[]): string {
  const first = ops[0];
  const m = module ?? /^\/modules\/([^/]+)/.exec(first?.path ?? '')?.[1] ?? 'config';
  const verb = first?.op === 'remove' ? 'Remove from' : first?.op === 'add' ? 'Add to' : 'Update';
  return `${verb} ${m}`;
}
