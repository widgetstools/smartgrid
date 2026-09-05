import type { DateFormat, DisplayFormat, NumberFormat, NumberPreset, StringFormat } from '@smartgrid/schema';

export interface FormatContext {
  columnHeader: string;
  rowData?: Record<string, unknown>;
  locale?: string;
  /** Host-registered custom formatters by id. */
  customFormatters?: Record<string, (value: unknown, options: Record<string, unknown> | undefined, ctx: FormatContext) => string>;
}

export type ValueFormatterFn = (value: unknown, ctx: FormatContext) => string;

/** Preset → NumberFormat options, mirroring AdapTable's 15 presets. */
export const NUMBER_PRESET_OPTIONS: Record<NumberPreset, Partial<NumberFormat>> = {
  Dollar: { prefix: '$', fractionDigits: 2, integerSeparator: ',' },
  Sterling: { prefix: '£', fractionDigits: 2, integerSeparator: ',' },
  Euro: { prefix: '€', fractionDigits: 2, integerSeparator: ',' },
  Yen: { prefix: '¥', fractionDigits: 0, integerSeparator: ',' },
  Bitcoin: { prefix: '₿', fractionDigits: 8 },
  K: { multiplier: 0.001, fractionDigits: 1, suffix: 'K' },
  M: { multiplier: 0.000001, fractionDigits: 2, suffix: 'M' },
  B: { multiplier: 0.000000001, fractionDigits: 2, suffix: 'B' },
  Integer: { fractionDigits: 0, integerSeparator: ',' },
  Decimal: { fractionDigits: 2, integerSeparator: ',' },
  Percentage: { multiplier: 100, fractionDigits: 2, suffix: '%' },
  Scientific: { notation: 'scientific', fractionDigits: 2 },
  Accounting: { fractionDigits: 2, integerSeparator: ',', parentheses: true },
  FXRate: { fractionDigits: 4 },
  BasisPoints: { multiplier: 10000, fractionDigits: 1, suffix: 'bp' },
};

function resolveTemplate(template: string, value: unknown, ctx: FormatContext, display: string): string {
  return template.replace(/\[(value|column|rowData\.[\w.]+)\]/g, (_, token: string) => {
    if (token === 'value') return display;
    if (token === 'column') return ctx.columnHeader;
    const path = token.slice('rowData.'.length).split('.');
    let cur: unknown = ctx.rowData;
    for (const p of path) cur = cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[p] : undefined;
    return cur === undefined || cur === null ? '' : String(cur);
  });
}

function numberFormatter(f: NumberFormat): ValueFormatterFn {
  const o: NumberFormat = { ...(f.preset ? NUMBER_PRESET_OPTIONS[f.preset] : {}), ...stripUndefined(f), kind: 'number' };
  const fraction = o.fractionDigits ?? 2;
  return (value, ctx) => {
    if (value === null || value === undefined || value === '') return o.empty === false ? '' : '';
    let n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return String(value);
    if (o.multiplier !== undefined) n *= o.multiplier;
    if (o.abs) n = Math.abs(n);
    const factor = 10 ** fraction;
    switch (o.rounding) {
      case 'ceiling':
        n = Math.ceil(n * factor) / factor;
        break;
      case 'floor':
        n = Math.floor(n * factor) / factor;
        break;
      case 'truncate':
        n = Math.trunc(n * factor) / factor;
        break;
      default:
        break;
    }
    if (n === 0 && o.zeroDisplay !== undefined) return o.zeroDisplay;
    const negative = n < 0;
    const abs = Math.abs(n);
    let body: string;
    if (o.notation === 'scientific') {
      body = abs.toExponential(fraction);
    } else if (o.notation === 'compact') {
      body = new Intl.NumberFormat(ctx.locale, { notation: 'compact', maximumFractionDigits: fraction }).format(abs);
    } else {
      body = new Intl.NumberFormat(ctx.locale, {
        minimumFractionDigits: fraction,
        maximumFractionDigits: fraction,
        minimumIntegerDigits: o.integerDigits && o.integerDigits > 0 ? o.integerDigits : 1,
        useGrouping: o.integerSeparator !== undefined && o.integerSeparator !== '',
      }).format(abs);
      if (o.integerSeparator !== undefined || o.fractionSeparator !== undefined) {
        const parts = new Intl.NumberFormat(ctx.locale).formatToParts(12345.6);
        const grp = parts.find((p) => p.type === 'group')?.value ?? ',';
        const dec = parts.find((p) => p.type === 'decimal')?.value ?? '.';
        body = body
          .split(dec)
          .map((seg, i) => (i === 0 && o.integerSeparator !== undefined ? seg.split(grp).join(o.integerSeparator) : seg))
          .join(o.fractionSeparator ?? dec);
      }
    }
    let out = `${o.prefix ?? ''}${body}${o.suffix ?? ''}`;
    if (negative) out = o.parentheses ? `(${out})` : `-${out}`;
    if (o.content) out = resolveTemplate(o.content, value, ctx, out);
    return out;
  };
}

function stringFormatter(f: StringFormat): ValueFormatterFn {
  return (value, ctx) => {
    if (value === null || value === undefined) return '';
    let s = String(value);
    if (f.trim) s = s.trim();
    switch (f.case) {
      case 'upper':
        s = s.toUpperCase();
        break;
      case 'lower':
        s = s.toLowerCase();
        break;
      case 'sentence':
        s = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
        break;
      case 'title':
        s = s.replace(/\b\w/g, (c) => c.toUpperCase());
        break;
      default:
        break;
    }
    let out = `${f.prefix ?? ''}${s}${f.suffix ?? ''}`;
    if (f.content) out = resolveTemplate(f.content, value, ctx, out);
    return out;
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'] as const;
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? 'th'}`;
};

/**
 * Small Unicode TR35 formatter covering the tokens AdapTable's presets use:
 * yyyy yy MMMM MMM MM M dd d do EEEE EEE HH H hh h mm ss SSS a. Literal text
 * goes in single quotes.
 */
export function formatDatePattern(date: Date, pattern: string): string {
  const H = date.getHours();
  const h12 = H % 12 === 0 ? 12 : H % 12;
  const tokens: Record<string, () => string> = {
    yyyy: () => String(date.getFullYear()),
    yy: () => pad(date.getFullYear() % 100),
    MMMM: () => MONTHS[date.getMonth()]!,
    MMM: () => MONTHS[date.getMonth()]!.slice(0, 3),
    MM: () => pad(date.getMonth() + 1),
    M: () => String(date.getMonth() + 1),
    dd: () => pad(date.getDate()),
    do: () => ordinal(date.getDate()),
    d: () => String(date.getDate()),
    EEEE: () => DAYS[date.getDay()]!,
    EEE: () => DAYS[date.getDay()]!.slice(0, 3),
    HH: () => pad(H),
    H: () => String(H),
    hh: () => pad(h12),
    h: () => String(h12),
    mm: () => pad(date.getMinutes()),
    ss: () => pad(date.getSeconds()),
    SSS: () => pad(date.getMilliseconds(), 3),
    a: () => (H < 12 ? 'AM' : 'PM'),
  };
  return pattern.replace(/'([^']*)'|yyyy|yy|MMMM|MMM|MM|M|dd|do|d|EEEE|EEE|HH|H|hh|h|mm|ss|SSS|a/g, (m, literal?: string) =>
    literal !== undefined ? literal : (tokens[m]?.() ?? m),
  );
}

function dateFormatter(f: DateFormat): ValueFormatterFn {
  return (value) => {
    if (value === null || value === undefined || value === '') return '';
    const d = value instanceof Date ? value : new Date(value as string | number);
    if (Number.isNaN(d.getTime())) return String(value);
    return formatDatePattern(d, f.pattern);
  };
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Build a value formatter for a DisplayFormat. Unknown kinds fall back to String(value). */
export function buildValueFormatter(format: DisplayFormat): ValueFormatterFn {
  switch (format.kind) {
    case 'number':
      return numberFormatter(format);
    case 'string':
      return stringFormatter(format);
    case 'date':
      return dateFormatter(format);
    case 'template':
      return (value, ctx) => resolveTemplate(format.template, value, ctx, value === null || value === undefined ? '' : String(value));
    case 'custom':
      return (value, ctx) => {
        const fn = ctx.customFormatters?.[format.formatterId];
        return fn ? fn(value, format.options, ctx) : value === null || value === undefined ? '' : String(value);
      };
    case 'excel':
    case 'tick':
      // Ported SSF and tick formatters land with the formatting module in M2.
      return (value) => (value === null || value === undefined ? '' : String(value));
  }
}
