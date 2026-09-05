/**
 * AssistantPane — the chat surface over an AssistantSession: health banner,
 * transcript with tool chips and editable proposal cards, composer with
 * suggestions, and a settings popover. Standalone (give it a session) or
 * through `useAssistant` in a host.
 */
import { useMemo, type ReactNode } from 'react';
import { Eraser } from 'lucide-react';
import type { AssistantSession, SessionState } from '@smartgrid/assistant';
import type { GridConfig } from '@smartgrid/schema';
import { defaultEditorRegistry, type EditorRegistry, type ResolvedEditor } from '@smartgrid/editors';
import { Button, ScrollArea, cn } from '@smartgrid/ui';
import { Composer } from './assistant/Composer.js';
import { HealthBanner } from './assistant/HealthBanner.js';
import { MessageList } from './assistant/MessageList.js';
import { SettingsPopover } from './assistant/SettingsPopover.js';
import { useAssistantState, type AssistantSettings } from './useAssistant.js';

export interface AssistantPaneProps {
  session: AssistantSession;
  /** Current config document (for before/after values in proposals). */
  config: GridConfig | undefined;
  settings: AssistantSettings;
  onSettingsChange?: (next: AssistantSettings) => void;
  registry?: EditorRegistry;
  resolveEditor?: (path: string, value: unknown) => ResolvedEditor | undefined;
  suggestions?: readonly string[];
  /** Shown before the first message. */
  intro?: ReactNode;
  fallbackHint?: string;
  title?: ReactNode;
  /** Extra header controls. */
  actions?: ReactNode;
  className?: string;
}

export const DEFAULT_SUGGESTIONS: readonly string[] = [
  'group by desk then book, pin notional right and sum it',
  'flash PnL red when it drops more than 2%',
  'make negative PnL red',
  'what columns are there?',
];

export function AssistantPane({
  session,
  config,
  settings,
  onSettingsChange,
  registry: registryProp,
  resolveEditor,
  suggestions = DEFAULT_SUGGESTIONS,
  intro,
  fallbackHint,
  title = 'Assistant',
  actions,
  className,
}: AssistantPaneProps) {
  const state: SessionState = useAssistantState(session);
  const registry = useMemo(() => registryProp ?? defaultEditorRegistry(), [registryProp]);
  const busy = state.status === 'thinking' || state.status === 'streaming' || state.status === 'tools';
  const down = !settings.demo && state.health !== undefined && !state.health.ok;

  return (
    <div
      className={cn('flex h-full min-h-0 flex-col', className)}
      data-testid="assistant-pane"
      data-status={state.status}
    >
      <div className="flex items-center gap-1 border-b border-border px-3 py-1.5">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-2xs text-muted-foreground">propose → validate → apply</span>
        <div className="ml-auto flex items-center gap-0.5">
          {actions}
          <Button
            size="sm"
            variant="ghost"
            title="Clear conversation"
            aria-label="Clear conversation"
            onClick={() => session.reset()}
            disabled={state.messages.length === 0}
          >
            <Eraser className="size-4" />
          </Button>
          {onSettingsChange && (
            <SettingsPopover settings={settings} onChange={onSettingsChange} models={state.health?.models} />
          )}
        </div>
      </div>
      <HealthBanner
        health={state.health}
        demo={settings.demo}
        baseUrl={settings.baseUrl}
        model={settings.model}
        onRetry={() => void session.checkHealth()}
        onDemo={onSettingsChange ? () => onSettingsChange({ ...settings, demo: true }) : undefined}
        fallbackHint={fallbackHint}
      />
      <ScrollArea className="min-h-0 flex-1">
        <MessageList
          state={state}
          session={session}
          config={config}
          registry={registry}
          resolveEditor={resolveEditor}
          empty={
            intro ?? (
              <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                Describe how the grid should look or behave. The assistant reads the current configuration,
                proposes a change as a JSON Patch, and you review it before it is applied. Every value in a
                proposal can be edited inline.
              </div>
            )
          }
        />
      </ScrollArea>
      <Composer
        onSend={(t) => void session.send(t).catch(() => undefined)}
        onCancel={() => session.cancel()}
        busy={busy}
        disabled={down}
        suggestions={suggestions}
        placeholder={down ? 'Model server unreachable — switch to demo mode or fix the settings' : undefined}
      />
    </div>
  );
}
