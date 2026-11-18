"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  fetchActivity,
  fetchByCampaign,
  fetchByDate,
  fetchCampaigns,
  fetchDonations,
  fetchDonors,
  fetchGala,
  fetchPublishedProgrammes,
  fetchSummary,
  type DonationQuery,
} from "@/services/dashboard";
import type { Range } from "@/lib/metrics";

/** Query keys include every parameter that changes the result; `enabled` mirrors the user's permission (UI only — the API decides). */
const k = (r: Range) => [r.from ?? "all", r.to ?? "all"] as const;

export const useSummary = (range: Range, currency: string | null, enabled: boolean) => useQuery({ queryKey: ["summary", ...k(range), currency], queryFn: () => fetchSummary(range, currency), enabled });
/** All-time status mix (the API filters status counts by confirmation date, so a period would hide pending/failed intents). */
export const useStatusMix = (currency: string | null, enabled: boolean) => useQuery({ queryKey: ["status-mix", currency], queryFn: () => fetchSummary({}, currency), enabled });
export const useByDate = (range: Range, currency: string | null, enabled: boolean) => useQuery({ queryKey: ["by-date", ...k(range), currency], queryFn: () => fetchByDate(range, currency), enabled });
export const useByCampaign = (range: Range, currency: string | null, enabled: boolean) => useQuery({ queryKey: ["by-campaign", ...k(range), currency], queryFn: () => fetchByCampaign(range, currency), enabled });
export const useDonorCount = (enabled: boolean) => useQuery({ queryKey: ["donor-count"], queryFn: fetchDonors, enabled });
export const useProgrammeCount = (enabled: boolean) => useQuery({ queryKey: ["programme-count"], queryFn: fetchPublishedProgrammes, enabled });
export const useCampaigns = (enabled: boolean) => useQuery({ queryKey: ["campaigns-published"], queryFn: fetchCampaigns, enabled });
export const useDonations = (q: DonationQuery, enabled: boolean) => useQuery({ queryKey: ["donations", q], queryFn: () => fetchDonations(q), enabled, placeholderData: keepPreviousData });
export const useActivity = (enabled: boolean) => useQuery({ queryKey: ["activity"], queryFn: fetchActivity, enabled });
export const useGala = (checkin: boolean, enabled: boolean) => useQuery({ queryKey: ["gala", checkin], queryFn: () => fetchGala({ checkin }), enabled });
