import { useId, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { Button, Input, Label, Popover, PopoverContent, PopoverTrigger, Switch } from '@smartgrid/ui';
import type { AssistantSettings } from '../useAssistant.js';

export interface SettingsPopoverProps {
  settings: AssistantSettings;
  onChange: (next: AssistantSettings) => void;
  models?: readonly string[];
  policy?: { autoApply: boolean };
  onPolicyChange?: (next: { autoApply: boolean }) => void;
}

export function SettingsPopover({
  settings,
  onChange,
  models,
  policy,
  onPolicyChange,
}: SettingsPopoverProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(settings);
  const listId = `${id}-models`;
  const field = (key: 'baseUrl' | 'model' | 'apiKey', label: string, type = 'text', placeholder?: string) => (
    <div className="flex flex-col gap-1">
      <Label htmlFor={`${id}-${key}`} className="text-2xs">
        {label}
      </Label>
      <Input
        id={`${id}-${key}`}
        type={type}
        value={draft[key] ?? ''}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        placeholder={placeholder}
        list={key === 'model' ? listId : undefined}
        className="h-7 text-xs"
        autoComplete="off"
      />
    </div>
  );
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft(settings);
      }}
    >
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" title="Assistant settings" aria-label="Assistant settings">
          <Settings2 className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-3 p-3 text-sm">
        <div className="text-xs font-semibold">Model server</div>
        {field('baseUrl', 'Base URL (OpenAI-compatible)', 'text', 'http://localhost:3000/v1')}
        {field('model', 'Model', 'text', 'gpt-4.1')}
        {models && models.length > 0 && (
          <datalist id={listId}>
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        )}
        {field('apiKey', 'API key (optional)', 'password')}
        <label className="flex items-center justify-between gap-2 text-xs">
          <span>Stream responses</span>
          <Switch
            checked={draft.stream !== false}
            onCheckedChange={(v) => setDraft({ ...draft, stream: v })}
          />
        </label>
        <label className="flex items-center justify-between gap-2 text-xs">
          <span>Demo mode (offline, scripted)</span>
          <Switch
            checked={draft.demo}
            onCheckedChange={(v) => setDraft({ ...draft, demo: v })}
            data-testid="demo-switch"
          />
        </label>
        {policy && onPolicyChange && (
          <label className="flex items-center justify-between gap-2 text-xs">
            <span>Apply valid proposals automatically</span>
            <Switch checked={policy.autoApply} onCheckedChange={(v) => onPolicyChange({ autoApply: v })} />
          </label>
        )}
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onChange({ ...draft, baseUrl: draft.baseUrl.trim(), model: draft.model.trim() });
              setOpen(false);
            }}
          >
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
