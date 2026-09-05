import { useEffect, useRef, type ReactNode } from 'react';
import { AlertCircle, Bot, Check, Loader2, Undo2, Wrench } from 'lucide-react';
import type { AssistantSession, MessagePart, SessionState, UiMessage } from '@smartgrid/assistant';
import type { GridConfig } from '@smartgrid/schema';
import type { EditorRegistry, ResolvedEditor } from '@smartgrid/editors';
import { cn } from '@smartgrid/ui';
import { ProposalCard } from './ProposalCard.js';

export interface MessageListProps {
  state: SessionState;
  session: AssistantSession;
  config: GridConfig | undefined;
  registry: EditorRegistry;
  resolveEditor?: (path: string, value: unknown) => ResolvedEditor | undefined;
  empty?: ReactNode;
  className?: string;
}

const TOOL_LABEL: Record<string, string> = {
  get_columns: 'Read columns',
  get_config: 'Read config',
  get_module_schema: 'Read schema',
  list_functions: 'List functions',
  list_predicates: 'List predicates',
  validate_expression: 'Validate expression',
  propose_patch: 'Propose change',
  undo: 'Undo',
  explain: 'Explain column',
};

function toolLabel(part: Extract<MessagePart, { type: 'tool' }>): string {
  const base = TOOL_LABEL[part.call.name] ?? part.call.name;
  try {
    const args = JSON.parse(part.call.arguments || '{}') as Record<string, unknown>;
    const detail = args['module'] ?? args['columnId'] ?? args['kind'] ?? args['dataType'];
    return typeof detail === 'string' ? `${base} · ${detail}` : base;
  } catch {
    return base;
  }
}

export function MessageList({
  state,
  session,
  config,
  registry,
  resolveEditor,
  empty,
  className,
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastKey = `${state.messages.length}:${state.status}:${textLength(state.messages.at(-1))}`;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lastKey]);

  return (
    <div className={cn('flex flex-col gap-3 p-3', className)} data-testid="assistant-messages">
      {state.messages.length === 0 && empty}
      {state.messages.map((m) => (
        <Message
          key={m.id}
          message={m}
          session={session}
          config={config}
          registry={registry}
          resolveEditor={resolveEditor}
          thinking={m.pending && (state.status === 'thinking' || state.status === 'tools')}
        />
      ))}
      {state.error && (
        <div
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

function textLength(m: UiMessage | undefined): number {
  return m?.parts.reduce((n, p) => n + (p.type === 'text' ? p.text.length : 1), 0) ?? 0;
}

function Message({
  message,
  session,
  config,
  registry,
  resolveEditor,
  thinking,
}: {
  message: UiMessage;
  session: AssistantSession;
  config: GridConfig | undefined;
  registry: EditorRegistry;
  resolveEditor?: (path: string, value: unknown) => ResolvedEditor | undefined;
  thinking?: boolean;
}) {
  if (message.role === 'user') {
    const text = message.parts.map((p) => (p.type === 'text' ? p.text : '')).join('');
    return (
      <div className="flex justify-end" data-role="user">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-primary/10 px-3 py-2 text-sm">
          {text}
        </div>
      </div>
    );
  }
  // Consecutive quiet tool calls collapse into one line of chips.
  const groups: MessagePart[][] = [];
  for (const part of message.parts) {
    const last = groups.at(-1);
    if (
      part.type === 'tool' &&
      part.quiet &&
      last?.[0]?.type === 'tool' &&
      (last[0] as { quiet?: boolean }).quiet
    ) {
      last.push(part);
    } else groups.push([part]);
  }
  return (
    <div className="flex gap-2" data-role="assistant">
      <div className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Bot className="size-3.5" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {groups.map((group, i) => {
          const first = group[0]!;
          if (first.type === 'text') {
            return (
              <p key={i} className="whitespace-pre-wrap text-sm leading-relaxed">
                {first.text}
              </p>
            );
          }
          if (first.type === 'proposal') {
            const proposal = session.getProposal(first.proposalId);
            return proposal ? (
              <ProposalCard
                key={i}
                proposal={proposal}
                session={session}
                config={config}
                registry={registry}
                resolveEditor={resolveEditor}
              />
            ) : null;
          }
          return (
            <div key={i} className="flex flex-wrap items-center gap-1">
              {group.map((p, j) => (p.type === 'tool' ? <ToolChip key={j} part={p} /> : null))}
            </div>
          );
        })}
        {thinking && (
          <span
            className="inline-flex items-center gap-1 text-xs text-muted-foreground"
            data-testid="assistant-thinking"
          >
            <Loader2 className="size-3 animate-spin" /> Working…
          </span>
        )}
      </div>
    </div>
  );
}

function ToolChip({ part }: { part: Extract<MessagePart, { type: 'tool' }> }) {
  const done = part.result !== undefined || part.error !== undefined;
  const Icon = part.error
    ? AlertCircle
    : !done
      ? Loader2
      : part.call.name === 'undo'
        ? Undo2
        : part.quiet
          ? Wrench
          : Check;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs',
        part.quiet ? 'border-border text-muted-foreground' : 'border-primary/40 bg-primary/5 text-foreground',
        part.error && 'border-destructive/50 text-destructive',
      )}
      title={part.error ?? (part.durationMs !== undefined ? `${part.durationMs} ms` : undefined)}
      data-testid="tool-chip"
      data-tool={part.call.name}
    >
      <Icon className={cn('size-3', !done && 'animate-spin')} />
      {toolLabel(part)}
    </span>
  );
}
