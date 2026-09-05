import { useRef, useState, type KeyboardEvent } from 'react';
import { SendHorizontal, Square } from 'lucide-react';
import { Button, Textarea, cn } from '@smartgrid/ui';

export interface ComposerProps {
  onSend: (text: string) => void;
  onCancel?: () => void;
  busy?: boolean;
  disabled?: boolean;
  placeholder?: string;
  suggestions?: readonly string[];
  className?: string;
}

export function Composer({
  onSend,
  onCancel,
  busy,
  disabled,
  placeholder,
  suggestions,
  className,
}: ComposerProps) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const submit = () => {
    const t = text.trim();
    if (!t || busy || disabled) return;
    onSend(t);
    setText('');
    ref.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };
  return (
    <div className={cn('flex flex-col gap-2 border-t border-border p-2', className)}>
      {suggestions && suggestions.length > 0 && text === '' && (
        <div className="flex flex-wrap gap-1">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="rounded-full border border-border px-2 py-0.5 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => {
                setText(s);
                ref.current?.focus();
              }}
              disabled={disabled}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? 'Describe the change… (Enter to send, Shift+Enter for a new line)'}
          rows={2}
          className="min-h-[2.5rem] flex-1 resize-none text-sm"
          disabled={disabled}
          aria-label="Message the assistant"
          data-testid="assistant-composer"
        />
        {busy && onCancel ? (
          <Button size="sm" variant="outline" onClick={onCancel} title="Stop" aria-label="Stop">
            <Square className="size-3.5" />
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={submit}
            disabled={disabled || !text.trim()}
            title="Send"
            aria-label="Send"
          >
            <SendHorizontal className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
