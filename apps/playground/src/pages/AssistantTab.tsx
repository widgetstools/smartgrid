/**
 * Assistant tab: the real AssistantPane bound to the playground store. Model
 * settings persist in localStorage; "demo mode" swaps in the scripted
 * provider so the loop runs without a server (and in headless tests).
 */
import { useCallback, useState } from 'react';
import type { TypedGridConfig } from '@smartgrid/schema';
import type { ConfigStore } from '@smartgrid/store';
import { useEditorContext } from '@smartgrid/editors';
import {
  AssistantPane,
  DEFAULT_ASSISTANT_SETTINGS,
  useAssistant,
  type AssistantSettings,
} from '@smartgrid/react';

export const ASSISTANT_SETTINGS_KEY = 'smartgrid.assistant.settings';

function loadSettings(): AssistantSettings {
  try {
    const raw = localStorage.getItem(ASSISTANT_SETTINGS_KEY);
    if (raw) return { ...DEFAULT_ASSISTANT_SETTINGS, ...(JSON.parse(raw) as Partial<AssistantSettings>) };
  } catch {
    // ignore corrupt storage
  }
  return DEFAULT_ASSISTANT_SETTINGS;
}

export function useAssistantSettings(): [AssistantSettings, (next: AssistantSettings) => void] {
  const [settings, setSettings] = useState<AssistantSettings>(loadSettings);
  const update = useCallback((next: AssistantSettings) => {
    setSettings(next);
    try {
      localStorage.setItem(ASSISTANT_SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable
    }
  }, []);
  return [settings, update];
}

export function AssistantTab({ store, config }: { store: ConfigStore; config: TypedGridConfig }) {
  const ctx = useEditorContext();
  const [settings, setSettings] = useAssistantSettings();
  const { session } = useAssistant({ store, getColumns: () => ctx.columns, settings });
  return (
    <AssistantPane
      session={session}
      config={config}
      settings={settings}
      onSettingsChange={setSettings}
      fallbackHint="The module tabs (Formats, Layouts, …) edit the same document with forms. Start the local model server or switch to demo mode to use the assistant."
    />
  );
}
