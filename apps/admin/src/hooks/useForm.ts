"use client";

import { useCallback, useMemo, useState } from "react";

/**
 * Minimal controlled-form state for the content editors: current values, the baseline they are compared with (the last
 * server response), and the list of changed fields (drives the save bar and PATCH payloads).
 */
export function useForm<T extends Record<string, unknown>>(initial: T) {
  const [base, setBase] = useState(initial);
  const [values, setValues] = useState(initial);
  const set = useCallback(<K extends keyof T>(k: K, v: T[K]) => setValues((s) => ({ ...s, [k]: v })), []);
  const dirty = useMemo(() => (Object.keys(values) as (keyof T)[]).filter((k) => JSON.stringify(values[k]) !== JSON.stringify(base[k])), [values, base]);
  /** after a successful save: the server's record becomes the new baseline */
  const reset = useCallback((next: T) => {
    setBase(next);
    setValues(next);
  }, []);
  const discard = useCallback(() => setValues(base), [base]);
  return { values, set, dirty, reset, discard, base };
}
