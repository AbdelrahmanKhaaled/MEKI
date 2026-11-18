"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Query } from "@/lib/api";
import * as svc from "@/services/content";

/**
 * Stable query keys ["content", resource, params]. `enabled` mirrors the user's permission (UI only — the API decides).
 * Every mutation invalidates the whole "content" namespace (programmes ↔ causes ↔ campaigns ↔ media reference each other)
 * plus the dashboard caches that read campaigns/programmes.
 */
export const contentKeys = {
  all: ["content"] as const,
  programmes: (q: Query) => ["content", "programmes", q] as const,
  programme: (id: string) => ["content", "programme", id] as const,
  causes: (q: object) => ["content", "causes", q] as const,
  cause: (id: string) => ["content", "cause", id] as const,
  campaigns: (q: Query) => ["content", "campaigns", q] as const,
  campaign: (id: string) => ["content", "campaign", id] as const,
  campaignTotals: (id: string) => ["content", "campaign-totals", id] as const,
  totalsBySlug: ["content", "totals-by-slug"] as const,
  live: (id: string) => ["content", "live-campaigns", id] as const,
  media: (q: Query) => ["content", "media", q] as const,
  mediaOne: (id: string) => ["content", "media-one", id] as const,
  payments: (settings: boolean) => ["content", "payments", settings] as const,
  audit: (type: string, id: string) => ["fin", "audit", type, id] as const, // same cache as Phase 6B entity audit
};

const list = { placeholderData: keepPreviousData };

export const useProgrammes = (q: Query, enabled = true) => useQuery({ queryKey: contentKeys.programmes(q), queryFn: () => svc.listProgrammes(q), enabled, ...list });
export const useProgramme = (id: string, enabled = true) => useQuery({ queryKey: contentKeys.programme(id), queryFn: () => svc.getProgramme(id), enabled });
/** All programmes for selects (12 records today; 100 is the API's page maximum). */
export const useProgrammeOptions = (enabled = true) =>
  useQuery({ queryKey: contentKeys.programmes({ pageSize: 100, sort: "sortOrder:asc" }), queryFn: () => svc.listProgrammes({ pageSize: 100, sort: "sortOrder:asc" }), enabled, staleTime: 60_000 });
export const useCauses = (q: { programmeId?: string; search?: string; provenance?: string }, enabled = true) => useQuery({ queryKey: contentKeys.causes(q), queryFn: () => svc.listCauses(q), enabled, ...list });
export const useCause = (id: string, enabled = true) => useQuery({ queryKey: contentKeys.cause(id), queryFn: () => svc.getCause(id), enabled });
export const useCampaigns = (q: Query, enabled = true) => useQuery({ queryKey: contentKeys.campaigns(q), queryFn: () => svc.listCampaigns(q), enabled, ...list });
export const useCampaign = (id: string, enabled = true) => useQuery({ queryKey: contentKeys.campaign(id), queryFn: () => svc.getCampaign(id), enabled });
export const useCampaignTotals = (id: string, enabled: boolean) => useQuery({ queryKey: contentKeys.campaignTotals(id), queryFn: () => svc.campaignTotals(id), enabled });
export const useTotalsBySlug = (enabled: boolean) => useQuery({ queryKey: contentKeys.totalsBySlug, queryFn: svc.campaignTotalsBySlug, enabled });
export const useLiveCampaigns = (programmeId: string, enabled: boolean) => useQuery({ queryKey: contentKeys.live(programmeId), queryFn: () => svc.liveCampaignCount(programmeId), enabled });
export const useMediaList = (q: Query, enabled = true) => useQuery({ queryKey: contentKeys.media(q), queryFn: () => svc.listMedia(q), enabled, ...list });
export const useMedia = (id: string, enabled = true) => useQuery({ queryKey: contentKeys.mediaOne(id), queryFn: () => svc.getMedia(id), enabled });
/**
 * Platform payment state for the "open donations" gate: `paymentsEffective` from GET /admin/settings/donation (exactly what the
 * API checks) when the user may read settings, else the public donation config. Never assumed true.
 */
export const usePaymentsState = (canSettings: boolean) =>
  useQuery({
    queryKey: contentKeys.payments(canSettings),
    queryFn: async () => {
      const pub = await svc.publicDonationConfig();
      const effective = canSettings ? (await svc.donationSettings()).paymentsEffective : pub.paymentsEnabled;
      return { effective, testMode: pub.testMode, currencies: pub.currencies };
    },
  });

// ── mutations: the UI changes only after the API answered ──

export function useContentMutation<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // Invalidation is started but NOT awaited: awaiting it would refetch first, and after a delete that refetch (404)
    // unmounts the editor before the caller's per-call onSuccess (e.g. navigate back to the list) could run — TanStack
    // Query skips per-call callbacks of unmounted observers. Callers always use the server's response, never the cache.
    onSuccess: () => {
      void Promise.all([
        qc.invalidateQueries({ queryKey: contentKeys.all }),
        qc.invalidateQueries({ queryKey: ["fin", "audit"] }),
        qc.invalidateQueries({ queryKey: ["campaigns-published"] }), // dashboard campaign progress
        qc.invalidateQueries({ queryKey: ["programme-count"] }), // dashboard KPI
      ]);
    },
  });
}
