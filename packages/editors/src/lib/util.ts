/** Set a key on an object value, dropping the key when `v` is undefined; returns undefined when the object becomes empty. */
export function setKey<T extends object, K extends keyof T>(
  obj: T | undefined,
  key: K,
  v: T[K] | undefined,
): T | undefined {
  const next = { ...(obj ?? {}) } as T;
  if (v === undefined) delete next[key];
  else next[key] = v;
  return Object.keys(next).length === 0 ? undefined : next;
}

export function humanize(id: string): string {
  return id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

let counter = 0;
export function uid(prefix = 'sg'): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}
