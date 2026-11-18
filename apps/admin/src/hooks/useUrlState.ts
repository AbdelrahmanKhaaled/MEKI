"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * List filters live in the URL query (`?page=2&status=PENDING`), so "Back" from a detail page restores the same filtered
 * page and a filtered view can be shared with a colleague. Only the given keys are read; unknown params are ignored.
 * Changing any filter other than `page` resets to page 1.
 *
 * `router.replace` commits asynchronously, so two quick changes (e.g. "from" then "to" date) would otherwise both be built from
 * the same stale query and the first would be lost. Writes therefore compose on the last query we asked for until the router
 * has caught up.
 */
export function useUrlState<K extends string>(keys: readonly K[]) {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const pending = useRef<string | null>(null);
  const current = params.toString();

  useEffect(() => {
    if (pending.current === current) pending.current = null; // the router caught up
  }, [current]);

  const values = useMemo(() => {
    const v = {} as Record<K, string>;
    for (const k of keys) v[k] = params.get(k) ?? "";
    return v;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keys is a static list per page
  }, [params]);

  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);

  const go = useCallback(
    (next: URLSearchParams) => {
      const s = next.toString();
      pending.current = s;
      router.replace(s ? `${path}?${s}` : path, { scroll: false });
    },
    [path, router],
  );

  const write = useCallback(
    (patch: Partial<Record<K | "page", string | number>>) => {
      const next = new URLSearchParams(pending.current ?? current);
      const resetsPage = Object.keys(patch).some((k) => k !== "page");
      for (const [k, v] of Object.entries(patch)) {
        if (v === "" || v === undefined || v === null || (k === "page" && Number(v) <= 1)) next.delete(k);
        else next.set(k, String(v));
      }
      if (resetsPage && !("page" in patch)) next.delete("page");
      go(next);
    },
    [current, go],
  );

  const clear = useCallback(() => {
    const next = new URLSearchParams(pending.current ?? current);
    for (const k of keys) next.delete(k);
    next.delete("page");
    go(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keys is a static list per page
  }, [current, go]);

  const active = keys.filter((k) => values[k] !== "" && k !== ("tab" as K)).length;
  return { values, page, set: write, clear, active };
}
