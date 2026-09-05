/**
 * ScheduleEditor — `x-editor: 'schedule'`.
 *
 * Edits the schema `Schedule` union:
 *   `{ kind: 'once', runAt: ISO-8601 with offset } | { kind: 'cron', cron, timezone? }`.
 *
 * A kind toggle switches between a one-off run (datetime-local input,
 * converted to an ISO string carrying the browser's UTC offset) and a
 * recurring cron expression (preset chooser, free 5-field input with
 * validation, optional IANA timezone, and a human-readable summary).
 *
 * Exports `describeCron(cron)` (handles `*`, `*\/N`, ranges, lists and
 * day/month names), `validateCron(cron)`, `CRON_PRESETS`,
 * `localInputToIso(local)` and `isoToLocalInput(iso)`.
 */
import { useId } from 'react';
import type { Schedule } from '@smartgrid/schema';
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ToggleGroup,
  ToggleGroupItem,
  cn,
} from '@smartgrid/ui';
import { CalendarClock, Repeat } from 'lucide-react';
import { Field } from '../lib/Field.js';
import { TextInput, controlSize } from '../lib/inputs.js';
import type { EditorProps } from '../types.js';

// ---------------------------------------------------------------------------
// Cron parsing and description
// ---------------------------------------------------------------------------

export interface CronPreset {
  id: string;
  label: string;
  cron: string;
}

export const CRON_PRESETS: readonly CronPreset[] = [
  { id: 'weekday-0930', label: 'Every weekday at 09:30', cron: '30 9 * * 1-5' },
  { id: 'hourly', label: 'Hourly', cron: '0 * * * *' },
  { id: 'daily-1700', label: 'Daily at 17:00', cron: '0 17 * * *' },
  { id: 'weekly-mon-0800', label: 'Weekly on Monday at 08:00', cron: '0 8 * * 1' },
  { id: 'monthly-1st-0600', label: 'Monthly on the 1st at 06:00', cron: '0 6 1 * *' },
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ALIASES: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const MONTH_ALIASES: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

type FieldKind = 'minute' | 'hour' | 'dom' | 'month' | 'dow';

interface FieldSpec {
  kind: FieldKind;
  min: number;
  max: number;
  aliases?: Record<string, number>;
}

const FIELD_SPECS: readonly FieldSpec[] = [
  { kind: 'minute', min: 0, max: 59 },
  { kind: 'hour', min: 0, max: 23 },
  { kind: 'dom', min: 1, max: 31 },
  { kind: 'month', min: 1, max: 12, aliases: MONTH_ALIASES },
  { kind: 'dow', min: 0, max: 7, aliases: DAY_ALIASES },
];

/** One comma-separated term of a cron field. */
interface Term {
  /** `undefined` start means `*`. */
  start?: number;
  end?: number;
  step?: number;
}

function parseAtom(s: string, spec: FieldSpec): number | undefined {
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return n >= spec.min && n <= spec.max ? n : undefined;
  }
  const alias = spec.aliases?.[s.toLowerCase()];
  return alias;
}

function parseTerm(raw: string, spec: FieldSpec): Term | undefined {
  const [base, stepStr, ...rest] = raw.split('/');
  if (rest.length > 0 || base === undefined || base === '') return undefined;
  let step: number | undefined;
  if (stepStr !== undefined) {
    if (!/^\d+$/.test(stepStr) || Number(stepStr) < 1) return undefined;
    step = Number(stepStr);
  }
  if (base === '*') return step === undefined ? {} : { step };
  const [a, b, ...more] = base.split('-');
  if (more.length > 0 || a === undefined) return undefined;
  const start = parseAtom(a, spec);
  if (start === undefined) return undefined;
  if (b === undefined) {
    // `N/step` means "from N every step" (Vixie cron extension).
    return step === undefined ? { start, end: start } : { start, end: spec.max, step };
  }
  const end = parseAtom(b, spec);
  if (end === undefined || end < start) return undefined;
  return step === undefined ? { start, end } : { start, end, step };
}

interface ParsedField {
  raw: string;
  terms: Term[];
  wildcard: boolean;
}

interface ParsedCron {
  minute: ParsedField;
  hour: ParsedField;
  dom: ParsedField;
  month: ParsedField;
  dow: ParsedField;
}

/** Parse a 5-field cron expression; returns an error message instead when invalid. */
export function parseCron(cron: string): ParsedCron | string {
  const fields = cron.trim().split(/\s+/);
  if (cron.trim() === '') return 'Enter a cron expression';
  if (fields.length !== 5)
    return `Expected 5 fields (minute hour day-of-month month day-of-week), got ${fields.length}`;
  const out: Partial<ParsedCron> = {};
  for (let i = 0; i < FIELD_SPECS.length; i++) {
    const spec = FIELD_SPECS[i] as FieldSpec;
    const raw = fields[i] as string;
    const terms: Term[] = [];
    for (const part of raw.split(',')) {
      const term = parseTerm(part, spec);
      if (!term)
        return `Invalid ${spec.kind === 'dom' ? 'day-of-month' : spec.kind === 'dow' ? 'day-of-week' : spec.kind} field "${raw}"`;
      terms.push(term);
    }
    out[spec.kind] = {
      raw,
      terms,
      wildcard: terms.length === 1 && terms[0]?.start === undefined && terms[0]?.step === undefined,
    };
  }
  return out as ParsedCron;
}

/** `undefined` when valid, otherwise a readable message. */
export function validateCron(cron: string): string | undefined {
  const parsed = parseCron(cron);
  return typeof parsed === 'string' ? parsed : undefined;
}

const joinList = (items: string[]): string => {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
};

const ordinal = (n: number): string => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
};

const dayName = (n: number) => DAY_NAMES[n % 7] as string;
const monthName = (n: number) => MONTH_NAMES[n - 1] ?? String(n);
const pad2 = (n: number) => String(n).padStart(2, '0');

const singleValue = (f: ParsedField): number | undefined => {
  const t = f.terms[0];
  return f.terms.length === 1 && t && t.start !== undefined && t.end === t.start && t.step === undefined
    ? t.start
    : undefined;
};

/** `*\/N` with nothing else. */
const wildcardStep = (f: ParsedField): number | undefined => {
  const t = f.terms[0];
  return f.terms.length === 1 && t && t.start === undefined && t.step !== undefined ? t.step : undefined;
};

function describeTerm(t: Term, name: (n: number) => string, unit: string): string {
  if (t.start === undefined) return t.step === undefined ? `every ${unit}` : `every ${t.step} ${unit}s`;
  if (t.end === t.start || t.end === undefined) return name(t.start);
  const range = `${name(t.start)} through ${name(t.end)}`;
  return t.step === undefined ? range : `every ${t.step} ${unit}s from ${range}`;
}

const describeField = (f: ParsedField, name: (n: number) => string, unit: string) =>
  joinList(f.terms.map((t) => describeTerm(t, name, unit)));

/**
 * Human-readable summary of a 5-field cron expression, e.g.
 * `30 9 * * 1-5` → "Every weekday at 09:30". Returns
 * "Invalid cron expression" for anything that does not parse.
 */
export function describeCron(cron: string): string {
  const parsed = parseCron(cron);
  if (typeof parsed === 'string') return 'Invalid cron expression';
  const { minute, hour, dom, month, dow } = parsed;

  const m = singleValue(minute);
  const h = singleValue(hour);
  const timeOfDay = m !== undefined && h !== undefined ? `${pad2(h)}:${pad2(m)}` : undefined;
  const dateFree = dom.wildcard && month.wildcard;

  // Frequent shapes get a tidy sentence.
  if (dateFree && dow.wildcard) {
    if (minute.wildcard && hour.wildcard) return 'Every minute';
    const ms = wildcardStep(minute);
    if (ms !== undefined && hour.wildcard) return ms === 1 ? 'Every minute' : `Every ${ms} minutes`;
    const hs = wildcardStep(hour);
    if (m !== undefined && hs !== undefined)
      return `${hs === 1 ? 'Every hour' : `Every ${hs} hours`}${m === 0 ? '' : ` at :${pad2(m)}`}`;
    if (m !== undefined && hour.wildcard) return m === 0 ? 'Every hour' : `Hourly at :${pad2(m)}`;
    if (timeOfDay) return `Daily at ${timeOfDay}`;
  }
  if (dateFree && timeOfDay) {
    const dowDesc = describeDow(dow);
    if (dowDesc.kind === 'weekday') return `Every weekday at ${timeOfDay}`;
    if (dowDesc.kind === 'weekend') return `Every weekend day at ${timeOfDay}`;
    if (dowDesc.kind === 'days') return `Every ${dowDesc.text} at ${timeOfDay}`;
  }
  if (dow.wildcard && month.wildcard && timeOfDay) {
    const d = singleValue(dom);
    if (d !== undefined) return `Monthly on the ${ordinal(d)} at ${timeOfDay}`;
  }

  // Generic composition.
  const parts: string[] = [];
  if (timeOfDay) parts.push(`at ${timeOfDay}`);
  else if (minute.wildcard && hour.wildcard) parts.push('every minute');
  else if (hour.wildcard) parts.push(`at minute ${describeField(minute, String, 'minute')}`);
  else if (minute.wildcard) parts.push(`every minute past hour ${describeField(hour, String, 'hour')}`);
  else
    parts.push(
      `at minute ${describeField(minute, String, 'minute')} past hour ${describeField(hour, String, 'hour')}`,
    );
  if (!dom.wildcard) parts.push(`on the ${describeField(dom, ordinal, 'day')} of the month`);
  if (!month.wildcard) parts.push(`in ${describeField(month, monthName, 'month')}`);
  if (!dow.wildcard) {
    const d = describeDow(dow);
    parts.push(d.kind === 'weekday' ? 'on weekdays' : d.kind === 'weekend' ? 'on weekends' : `on ${d.text}`);
  }
  const text = parts.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function describeDow(dow: ParsedField): { kind: 'weekday' | 'weekend' | 'days' | 'other'; text: string } {
  const t = dow.terms[0];
  if (dow.terms.length === 1 && t && t.start === 1 && t.end === 5 && t.step === undefined)
    return { kind: 'weekday', text: 'weekdays' };
  const singles = dow.terms.map((x) =>
    x.start !== undefined && x.end === x.start && x.step === undefined ? x.start % 7 : undefined,
  );
  if (singles.every((s): s is number => s !== undefined)) {
    const set = [...new Set(singles)];
    if (set.length === 2 && set.includes(0) && set.includes(6)) return { kind: 'weekend', text: 'weekends' };
    return { kind: 'days', text: joinList(set.map(dayName)) };
  }
  return { kind: 'other', text: describeField(dow, dayName, 'day') };
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** `YYYY-MM-DDTHH:mm` (local wall time) → ISO-8601 with the local UTC offset. */
export function localInputToIso(local: string): string | undefined {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return undefined;
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

/** ISO-8601 → `YYYY-MM-DDTHH:mm` in local wall time for a datetime-local input. */
export function isoToLocalInput(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Default one-off time: the next full hour. */
function nextFullHourIso(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return localInputToIso(isoToLocalInput(d.toISOString())) ?? d.toISOString();
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

export type ScheduleEditorProps = EditorProps<Schedule>;

const CUSTOM = '__custom__';

export function ScheduleEditor(props: ScheduleEditorProps) {
  const {
    value,
    onChange,
    mode = 'panel',
    readOnly,
    disabled,
    errors,
    label,
    description,
    className,
  } = props;
  const autoId = useId();
  const id = props.id ?? autoId;
  const locked = !!readOnly || !!disabled;
  const kind = value?.kind;

  const setKind = (k: string) => {
    if (k === kind || k === '') return;
    if (k === 'once') onChange({ kind: 'once', runAt: nextFullHourIso() });
    else if (k === 'cron') onChange({ kind: 'cron', cron: CRON_PRESETS[0]?.cron ?? '0 9 * * 1-5' });
  };

  const cron = value?.kind === 'cron' ? value : undefined;
  const cronError = cron ? validateCron(cron.cron) : undefined;
  const presetId = cron ? (CRON_PRESETS.find((p) => p.cron === cron.cron)?.id ?? CUSTOM) : CUSTOM;
  const setCron = (next: string | undefined) => {
    if (!cron) return;
    onChange({ ...cron, cron: next ?? '' });
  };
  const setTimezone = (tz: string | undefined) => {
    if (!cron) return;
    const { timezone: _drop, ...rest } = cron;
    onChange(tz === undefined ? rest : { ...rest, timezone: tz });
  };

  const inline = mode === 'inline';

  return (
    <Field mode={mode} label={label} description={description} errors={errors} id={id} className={className}>
      <div
        className={cn('flex min-w-0 gap-1', inline ? 'flex-row flex-wrap items-center' : 'flex-col gap-2')}
      >
        <ToggleGroup
          type="single"
          variant="outline"
          size={mode === 'panel' ? 'default' : 'sm'}
          value={kind ?? ''}
          disabled={locked}
          aria-label="Schedule kind"
          className="justify-start gap-0"
          onValueChange={setKind}
        >
          <ToggleGroupItem value="once" aria-label="Run once" className="gap-1 rounded-r-none">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            {!inline && 'Once'}
          </ToggleGroupItem>
          <ToggleGroupItem value="cron" aria-label="Recurring" className="-ml-px gap-1 rounded-l-none">
            <Repeat className="h-3.5 w-3.5" aria-hidden />
            {!inline && 'Recurring'}
          </ToggleGroupItem>
        </ToggleGroup>

        {value?.kind === 'once' && (
          <Input
            id={id}
            type="datetime-local"
            aria-label="Run at"
            value={isoToLocalInput(value.runAt)}
            readOnly={readOnly}
            disabled={disabled}
            className={cn(controlSize(mode), 'w-auto font-mono')}
            onChange={(e) => {
              const iso = localInputToIso(e.target.value);
              if (iso) onChange({ kind: 'once', runAt: iso });
            }}
          />
        )}

        {cron && (
          <div className={cn('flex min-w-0 gap-1', inline ? 'flex-row flex-wrap items-center' : 'flex-col')}>
            <div className="flex min-w-0 items-center gap-1">
              <Select
                value={presetId}
                onValueChange={(p) => p !== CUSTOM && setCron(CRON_PRESETS.find((x) => x.id === p)?.cron)}
                disabled={locked}
              >
                <SelectTrigger
                  aria-label="Cron preset"
                  className={cn(controlSize(mode), inline ? 'w-40' : 'w-full')}
                >
                  <SelectValue placeholder="Preset…" />
                </SelectTrigger>
                <SelectContent>
                  {CRON_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM}>Custom…</SelectItem>
                </SelectContent>
              </Select>
              <TextInput
                id={id}
                value={cron.cron}
                onChange={setCron}
                placeholder="min hour dom month dow"
                mode={mode}
                readOnly={readOnly}
                disabled={disabled}
                mono
                className={cn(inline ? 'w-36' : 'w-full')}
              />
              <TextInput
                value={cron.timezone}
                onChange={setTimezone}
                placeholder="Timezone (local)"
                mode={mode}
                readOnly={readOnly}
                disabled={disabled}
                className={cn(inline ? 'w-28' : 'w-40')}
              />
            </div>
            <p
              className={cn('text-2xs', cronError ? 'text-destructive' : 'text-muted-foreground')}
              role={cronError ? 'alert' : 'status'}
              aria-live="polite"
            >
              {cronError ?? describeCron(cron.cron)}
            </p>
          </div>
        )}
      </div>
    </Field>
  );
}
