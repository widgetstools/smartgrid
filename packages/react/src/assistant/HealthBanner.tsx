import { CircleAlert, CircleCheck, FlaskConical, Loader2 } from 'lucide-react';
import type { HealthStatus } from '@smartgrid/assistant';
import { Button, cn } from '@smartgrid/ui';

export interface HealthBannerProps {
  health: HealthStatus | undefined;
  demo: boolean;
  baseUrl: string;
  model: string;
  onRetry: () => void;
  onDemo?: () => void;
  /** What to tell the user when the server is down (e.g. "use the module tabs"). */
  fallbackHint?: string;
  className?: string;
}

export function HealthBanner({
  health,
  demo,
  baseUrl,
  model,
  onRetry,
  onDemo,
  fallbackHint = 'You can still configure everything with the forms in the module tabs.',
  className,
}: HealthBannerProps) {
  if (demo) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 bg-muted/60 px-3 py-1.5 text-2xs text-muted-foreground',
          className,
        )}
        data-testid="assistant-health"
        data-health="demo"
      >
        <FlaskConical className="size-3" />
        Demo mode: a scripted assistant answers a few example prompts offline. Every proposal is validated for
        real.
      </div>
    );
  }
  if (!health) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 bg-muted/60 px-3 py-1.5 text-2xs text-muted-foreground',
          className,
        )}
        data-testid="assistant-health"
        data-health="checking"
      >
        <Loader2 className="size-3 animate-spin" /> Checking {baseUrl}…
      </div>
    );
  }
  if (!health.ok) {
    return (
      <div
        className={cn(
          'flex flex-col gap-1 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive',
          className,
        )}
        role="status"
        data-testid="assistant-health"
        data-health="down"
      >
        <div className="flex items-center gap-2">
          <CircleAlert className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            Cannot reach the model server at <code className="font-mono">{baseUrl}</code>
            {health.error ? ` (${health.error})` : ''}.
          </span>
        </div>
        <div className="text-2xs text-destructive/80">{fallbackHint}</div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-6 px-2 text-2xs" onClick={onRetry}>
            Retry
          </Button>
          {onDemo && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-2xs" onClick={onDemo}>
              Use demo mode
            </Button>
          )}
        </div>
      </div>
    );
  }
  const known = health.models?.length ? health.models.includes(model) : true;
  return (
    <div
      className={cn(
        'flex items-center gap-2 bg-muted/60 px-3 py-1.5 text-2xs text-muted-foreground',
        className,
      )}
      data-testid="assistant-health"
      data-health="ok"
    >
      <CircleCheck className="size-3 text-[var(--sg-positive)]" />
      <span className="truncate">
        {baseUrl} · {model}
        {health.latencyMs !== undefined ? ` · ${health.latencyMs} ms` : ''}
      </span>
      {!known && (
        <span className="text-[var(--sg-accent-warning)]" title={health.models?.join(', ')}>
          model not in server list
        </span>
      )}
    </div>
  );
}
