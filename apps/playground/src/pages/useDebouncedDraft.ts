import { useEffect, useRef, useState } from 'react';

/**
 * Keeps a local draft of an object while the user types and commits one
 * JSON Patch per pause (default 400 ms) instead of one per keystroke. When
 * the store echoes our own commit the draft is kept (newer keystrokes may
 * already be pending); any other store change (undo, assistant, another
 * editor) discards the draft. Pending edits are flushed on unmount.
 */
export function useDebouncedDraft<T>(
  current: T | undefined,
  commit: (prev: T, next: T) => void,
  delay = 400,
) {
  const [draft, setDraft] = useState<T | undefined>();
  const [seen, setSeen] = useState(current);
  const [committed, setCommitted] = useState<string | undefined>(undefined);
  const [hasPending, setHasPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<{ prev: T; next: T } | undefined>(undefined);
  if (current !== seen) {
    setSeen(current);
    const own = committed !== undefined && JSON.stringify(current) === committed;
    if (!own || !hasPending) setDraft(undefined);
    if (!own) setHasPending(false);
  }
  // Ref bookkeeping stays out of render: an external change cancels pending edits.
  useEffect(() => {
    if (hasPending) return;
    pending.current = undefined;
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
  }, [hasPending]);
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
    const p = pending.current;
    pending.current = undefined;
    setHasPending(false);
    if (p) {
      setCommitted(JSON.stringify(p.next));
      commit(p.prev, p.next);
    }
  };
  const update = (next: T) => {
    const base = pending.current?.prev ?? (draft !== undefined ? seen : current);
    if (base === undefined) return;
    setDraft(next);
    pending.current = { prev: base, next };
    setHasPending(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  };
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => () => flushRef.current(), []);
  return [draft ?? current, update, flush] as const;
}
