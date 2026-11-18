"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Query } from "@/lib/api";
import * as svc from "@/services/cms";

/** Stable keys ["cms", resource, params]. `enabled` mirrors the user's permission (UI only — the API decides). */
export const cmsKeys = {
  all: ["cms"] as const,
  pages: ["cms", "pages"] as const,
  page: (slug: string) => ["cms", "page", slug] as const,
  faqs: (q: Query) => ["cms", "faqs", q] as const,
  faq: (id: string) => ["cms", "faq", id] as const,
  stats: (q: Query) => ["cms", "stats", q] as const,
  site: ["cms", "site"] as const,
};

export const usePages = (enabled = true) => useQuery({ queryKey: cmsKeys.pages, queryFn: svc.listPages, enabled });
export const usePage = (slug: string, enabled = true) => useQuery({ queryKey: cmsKeys.page(slug), queryFn: () => svc.getPage(slug), enabled });
export const useFaqs = (q: Query, enabled = true) => useQuery({ queryKey: cmsKeys.faqs(q), queryFn: () => svc.listFaqs(q), enabled, placeholderData: keepPreviousData });
export const useFaq = (id: string, enabled = true) => useQuery({ queryKey: cmsKeys.faq(id), queryFn: () => svc.getFaq(id), enabled });
export const useStats = (q: Query, enabled = true) => useQuery({ queryKey: cmsKeys.stats(q), queryFn: () => svc.listStats(q), enabled, placeholderData: keepPreviousData });
export const useSite = (enabled = true) => useQuery({ queryKey: cmsKeys.site, queryFn: svc.getSite, enabled });

/**
 * Mutations: the UI reflects only what the API answered. Invalidation is started without awaiting it, so per-call
 * success handlers (navigation, form reset) always run — the same rule as Phase 6C (see docs/26 §9).
 */
export function useCmsMutation<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void Promise.all([qc.invalidateQueries({ queryKey: cmsKeys.all }), qc.invalidateQueries({ queryKey: ["fin", "audit"] })]);
    },
  });
}
