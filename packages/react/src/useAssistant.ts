/**
 * Hooks binding an AssistantSession to React. `useAssistantState` mirrors the
 * session's state through useSyncExternalStore (every session event
 * invalidates the snapshot, so streaming text re-renders); `useAssistant`
 * owns a session for a store + provider settings and re-creates it when the
 * provider changes.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ColumnInfo, GridConfig } from '@smartgrid/schema';
import type { ConfigStore } from '@smartgrid/store';
import {
  AssistantSession,
  MockProvider,
  OpenAiCompatibleProvider,
  demoScript,
  type ModelProvider,
  type SessionPolicy,
  type SessionState,
} from '@smartgrid/assistant';

const EMPTY_STATE: SessionState = { status: 'idle', messages: [], proposals: [], model: '' };

const snapshots = new WeakMap<AssistantSession, SessionState>();

export function useAssistantState(session: AssistantSession | undefined): SessionState {
  return useSyncExternalStore(
    (onChange) => {
      if (!session) return () => {};
      return session.subscribe(() => {
        snapshots.set(session, session.state);
        onChange();
      });
    },
    () => {
      if (!session) return EMPTY_STATE;
      let snap = snapshots.get(session);
      if (!snap) {
        snap = session.state;
        snapshots.set(session, snap);
      }
      return snap;
    },
    () => EMPTY_STATE,
  );
}

/** Where the model lives. Persisted by hosts (e.g. localStorage) and edited in the settings popover. */
export interface AssistantSettings {
  /** OpenAI-compatible base URL, e.g. http://localhost:3000/v1 */
  baseUrl: string;
  apiKey?: string;
  model: string;
  /** Use the scripted offline provider instead of a server. */
  demo: boolean;
  /** Streaming responses (some proxies only support non-streaming tool calls). */
  stream?: boolean;
}

export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = {
  baseUrl: 'http://localhost:3000/v1',
  model: 'gpt-4.1',
  demo: false,
  stream: true,
};

export function providerFor(settings: AssistantSettings): ModelProvider {
  if (settings.demo) return new MockProvider(demoScript, { delayMs: 120 });
  return new OpenAiCompatibleProvider({
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    stream: settings.stream !== false,
  });
}

export interface UseAssistantOptions {
  store: ConfigStore;
  getColumns: () => readonly ColumnInfo[];
  getConfig?: () => GridConfig;
  settings: AssistantSettings;
  policy?: Partial<SessionPolicy>;
  systemPromptSuffix?: string;
  /** Provide a provider directly (tests, custom gateways); overrides settings. */
  provider?: ModelProvider;
}

function createCallbackHolder(getColumns: () => readonly ColumnInfo[], getConfig?: () => GridConfig) {
  let fns = { getColumns, getConfig };
  return {
    set(nextColumns: () => readonly ColumnInfo[], nextConfig?: () => GridConfig) {
      fns = { getColumns: nextColumns, getConfig: nextConfig };
    },
    getColumns: () => fns.getColumns(),
    getConfig: () => {
      if (!fns.getConfig) throw new Error('getConfig is not set');
      return fns.getConfig();
    },
  };
}

export function useAssistant(opts: UseAssistantOptions): { session: AssistantSession; state: SessionState } {
  const { store, settings, policy, systemPromptSuffix, provider: explicit } = opts;
  const { baseUrl, apiKey, model, demo, stream } = settings;
  // Latest callbacks, read lazily by the session so it survives re-renders.
  const [latest] = useState(() => createCallbackHolder(opts.getColumns, opts.getConfig));
  useEffect(() => {
    latest.set(opts.getColumns, opts.getConfig);
  });
  const hasGetConfig = !!opts.getConfig;

  const session = useMemo(() => {
    const provider = explicit ?? providerFor({ baseUrl, apiKey, model, demo, stream });
    return new AssistantSession({
      provider,
      model: demo ? 'demo' : model,
      store,
      getColumns: () => latest.getColumns(),
      getConfig: hasGetConfig ? () => latest.getConfig() : undefined,
      policy,
      systemPromptSuffix,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, explicit, baseUrl, apiKey, model, demo, stream, systemPromptSuffix, hasGetConfig, latest]);

  useEffect(() => {
    void session.checkHealth();
    return () => session.cancel();
  }, [session]);

  const state = useAssistantState(session);
  return { session, state };
}
