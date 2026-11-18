/**
 * Phase 6C content services — one function per EXISTING backend endpoint (programmes.module.ts, campaigns.module.ts,
 * media.module.ts, settings, public donation config, reports). No component calls the network directly.
 * Internal mapping: the admin's "Causes" are the API's `projects`.
 */
import { z } from "zod";
import { apiDelete, apiGet, apiList, apiPatch, apiPost, apiPut, apiUpload, type Query } from "@/lib/api";
import {
  CampaignSchema,
  CampaignTotalsSchema,
  DonationSettingsSchema,
  MediaDetailSchema,
  MediaSchema,
  ProgrammeSchema,
  ProjectDetailSchema,
  ProjectSchema,
  ProjectWriteSchema,
  PublicDonationConfigSchema,
} from "@/lib/content-schemas";
import type { CampaignAction } from "@/lib/content";

const id = (s: string) => encodeURIComponent(s);
export type Body = Record<string, unknown>;

// ── programmes (programmes.read / .manage / .publish) ──
export const listProgrammes = (q: Query) => apiList("/admin/programmes", ProgrammeSchema, q);
export const getProgramme = (pid: string) => apiGet(`/admin/programmes/${id(pid)}`, ProgrammeSchema);
export const createProgramme = (b: Body) => apiPost("/admin/programmes", ProgrammeSchema, b);
export const updateProgramme = (pid: string, b: Body) => apiPatch(`/admin/programmes/${id(pid)}`, ProgrammeSchema, b);
export const setProgrammeGallery = (pid: string, mediaIds: string[]) => apiPut(`/admin/programmes/${id(pid)}/gallery`, ProgrammeSchema, { mediaIds });
export const publishProgramme = (pid: string, publish: boolean) => apiPost(`/admin/programmes/${id(pid)}/${publish ? "publish" : "unpublish"}`, ProgrammeSchema);
export const deleteProgramme = (pid: string) => apiDelete(`/admin/programmes/${id(pid)}`);

// ── causes = projects (programmes.read / .manage) ──
export const listCauses = (q: { programmeId?: string; search?: string; provenance?: string }) => apiGet("/admin/projects", z.array(ProjectSchema), q);
export const getCause = (cid: string) => apiGet(`/admin/projects/${id(cid)}`, ProjectDetailSchema);
export const createCause = (b: Body) => apiPost("/admin/projects", ProjectWriteSchema, b);
export const updateCause = (cid: string, b: Body) => apiPatch(`/admin/projects/${id(cid)}`, ProjectWriteSchema, b);

// ── campaigns (campaigns.read / .manage / .publish / .approve) ──
export const listCampaigns = (q: Query) => apiList("/admin/campaigns", CampaignSchema, q);
export const getCampaign = (cid: string) => apiGet(`/admin/campaigns/${id(cid)}`, CampaignSchema);
export const createCampaign = (b: Body) => apiPost("/admin/campaigns", CampaignSchema, b);
export const updateCampaign = (cid: string, b: Body) => apiPatch(`/admin/campaigns/${id(cid)}`, CampaignSchema, b);
export const setCampaignGallery = (cid: string, mediaIds: string[]) => apiPut(`/admin/campaigns/${id(cid)}/gallery`, CampaignSchema, { mediaIds });
export const transitionCampaign = (cid: string, action: CampaignAction) => apiPost(`/admin/campaigns/${id(cid)}/${action}`, CampaignSchema);
export const approveCampaign = (cid: string, note: string) => apiPost(`/admin/campaigns/${id(cid)}/approve`, CampaignSchema, { note });
export const revokeCampaignApproval = (cid: string) => apiPost(`/admin/campaigns/${id(cid)}/revoke-approval`, CampaignSchema);
export const setCampaignDonations = (cid: string, open: boolean) => apiPatch(`/admin/campaigns/${id(cid)}/donations`, CampaignSchema, { open });
export const deleteCampaign = (cid: string) => apiDelete(`/admin/campaigns/${id(cid)}`);
/** Collected per currency (reports.read) — verified payments, test records excluded. */
export const campaignTotals = (cid: string) => apiGet(`/admin/reports/campaigns/${id(cid)}`, CampaignTotalsSchema);
/** All campaigns' collected totals in one call (reports.read), joined by slug on the list page. */
export const campaignTotalsBySlug = () =>
  apiGet(
    "/admin/reports/donations/by-campaign",
    z.array(z.object({ designation: z.string(), campaign: z.object({ slug: z.string() }).nullable(), currency: z.string(), net: z.string() })),
  );

// ── payments availability (for the "open donations" gate) ──
export const donationSettings = () => apiGet("/admin/settings/donation", DonationSettingsSchema); // settings.read
export const publicDonationConfig = () => apiGet("/public/donations/config", PublicDonationConfigSchema); // no permission

// ── media (media.read / .upload / .delete) ──
export const listMedia = (q: Query) => apiList("/admin/media", MediaSchema, q);
export const getMedia = (mid: string) => apiGet(`/admin/media/${id(mid)}`, MediaDetailSchema);
export const updateMedia = (mid: string, b: Body) => apiPatch(`/admin/media/${id(mid)}`, MediaSchema, b);
export const deleteMedia = (mid: string) => apiDelete(`/admin/media/${id(mid)}`);
export function uploadMedia(file: File, meta: Record<string, string>, onProgress?: (f: number) => void) {
  const form = new FormData();
  for (const [k, v] of Object.entries(meta)) if (v) form.append(k, v);
  form.append("file", file); // the API's FileInterceptor('file')
  return apiUpload("/admin/media", form, MediaSchema, onProgress);
}

/** Live (PUBLISHED or PAUSED) campaigns of a programme — the unpublish guard (PROGRAMME_HAS_LIVE_CAMPAIGNS). */
export async function liveCampaignCount(programmeId: string) {
  const [pub, paused] = await Promise.all([
    apiList("/admin/campaigns", CampaignSchema, { programmeId, status: "PUBLISHED", page: 1, pageSize: 1 }),
    apiList("/admin/campaigns", CampaignSchema, { programmeId, status: "PAUSED", page: 1, pageSize: 1 }),
  ]);
  return pub.total + paused.total;
}
