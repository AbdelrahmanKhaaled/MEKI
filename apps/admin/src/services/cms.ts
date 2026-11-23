/**
 * Phase 6D CMS services — one function per EXISTING endpoint (cms.module.ts, faq.module.ts, statistics.module.ts,
 * settings.module.ts) plus the two additive 6D endpoints (create page, delete section). No component calls the network.
 */
import { z } from "zod";
import { apiDelete, apiGet, apiList, apiPatch, apiPost, apiPostOutcome, apiPut, type Query } from "@/lib/api";
import { FaqSchema, ItemWriteSchema, PageDetailSchema, PageRowSchema, SectionSchema, SiteSettingsSchema, StatisticSchema } from "@/lib/cms-schemas";

const id = (s: string) => encodeURIComponent(s);
export type Body = Record<string, unknown>;

// ── pages & sections (content.read / .manage / .publish) ──
export const listPages = () => apiGet("/admin/cms/pages", z.array(PageRowSchema));
export const getPage = (slug: string) => apiGet(`/admin/cms/pages/${id(slug)}`, PageDetailSchema);
export const createPage = (b: Body) => apiPost("/admin/cms/pages", PageDetailSchema, b);
export const updatePage = (slug: string, b: Body) => apiPatch(`/admin/cms/pages/${id(slug)}`, PageDetailSchema, b);
export const setPageStatus = (slug: string, publish: boolean) => apiPost(`/admin/cms/pages/${id(slug)}/${publish ? "publish" : "unpublish"}`, PageDetailSchema);
export const createSection = (slug: string, b: Body) => apiPost(`/admin/cms/pages/${id(slug)}/sections`, SectionSchema, b);
export const reorderSections = (slug: string, ids: string[]) => apiPut(`/admin/cms/pages/${id(slug)}/sections/order`, PageDetailSchema, { ids });
export const updateSection = (sid: string, b: Body) => apiPatch(`/admin/cms/sections/${id(sid)}`, SectionSchema, b);
export const setSectionStatus = (sid: string, publish: boolean) => apiPost(`/admin/cms/sections/${id(sid)}/${publish ? "publish" : "unpublish"}`, SectionSchema);
export const deleteSection = (sid: string) => apiDelete(`/admin/cms/sections/${id(sid)}`);
/** Publish / unpublish with the live-website refresh outcome (revalidated | pending | disabled). */
export const publishSectionOutcome = (sid: string, publish: boolean) => apiPostOutcome(`/admin/cms/sections/${id(sid)}/${publish ? "publish" : "unpublish"}`, SectionSchema);

// ── CMS live publishing: website cache refresh status / retry (content.read / content.publish) ──
export const RevalidationStatusSchema = z.object({
  enabled: z.boolean(),
  state: z.enum(["ok", "pending", "disabled"]),
  pendingTags: z.array(z.string()),
  consecutiveFailures: z.number(),
  lastSuccessAt: z.string().nullable(),
  lastFailureAt: z.string().nullable(),
  lastError: z.string().nullable(),
  nextRetryAt: z.string().nullable(),
});
export type RevalidationStatus = z.infer<typeof RevalidationStatusSchema>;
export const getRevalidationStatus = () => apiGet("/admin/cms/revalidation", RevalidationStatusSchema);
export const retryRevalidation = (all = false) => apiPost(`/admin/cms/revalidation/retry${all ? "?all=true" : ""}`, RevalidationStatusSchema);
export const createItem = (sid: string, b: Body) => apiPost(`/admin/cms/sections/${id(sid)}/items`, ItemWriteSchema, b);
export const updateItem = (iid: string, b: Body) => apiPatch(`/admin/cms/items/${id(iid)}`, ItemWriteSchema, b);
export const deleteItem = (iid: string) => apiDelete(`/admin/cms/items/${id(iid)}`);
export const reorderItems = (sid: string, ids: string[]) => apiPut(`/admin/cms/sections/${id(sid)}/items/order`, SectionSchema, { ids });

// ── FAQs (faq.read / .manage / .publish) ──
export const listFaqs = (q: Query) => apiList("/admin/faqs", FaqSchema, q);
export const getFaq = (fid: string) => apiGet(`/admin/faqs/${id(fid)}`, FaqSchema);
export const createFaq = (b: Body) => apiPost("/admin/faqs", FaqSchema, b);
export const updateFaq = (fid: string, b: Body) => apiPatch(`/admin/faqs/${id(fid)}`, FaqSchema, b);
export const setFaqStatus = (fid: string, publish: boolean) => apiPost(`/admin/faqs/${id(fid)}/${publish ? "publish" : "unpublish"}`, FaqSchema);
export const deleteFaq = (fid: string) => apiDelete(`/admin/faqs/${id(fid)}`);
export const reorderFaqs = (ids: string[]) => apiPut("/admin/faqs/order", z.unknown(), { ids });

// ── statistics (statistics.read / .manage / .verify / .publish) ──
export const listStats = (q: Query) => apiList("/admin/statistics", StatisticSchema, q);
export const createStat = (b: Body) => apiPost("/admin/statistics", StatisticSchema, b);
export const updateStat = (sid: string, b: Body) => apiPatch(`/admin/statistics/${id(sid)}`, StatisticSchema, b);
export const verifyStat = (sid: string, verificationStatus: "VERIFIED" | "REJECTED") => apiPost(`/admin/statistics/${id(sid)}/verify`, StatisticSchema, { verificationStatus });
export const setStatStatus = (sid: string, publish: boolean) => apiPost(`/admin/statistics/${id(sid)}/${publish ? "publish" : "unpublish"}`, StatisticSchema);
export const deleteStat = (sid: string) => apiDelete(`/admin/statistics/${id(sid)}`);

// ── site settings (settings.read / .manage) ──
export const getSite = () => apiGet("/admin/settings/site", SiteSettingsSchema);
export const updateSite = (b: Body) => apiPatch("/admin/settings/site", SiteSettingsSchema, b);
