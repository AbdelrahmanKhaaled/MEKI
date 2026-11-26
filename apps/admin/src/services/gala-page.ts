/**
 * MEKI client edits (22 Nov 2026) — Gala page photos, host, sponsorship link, partner logos and contact email. One function per
 * EXISTING event landing-page endpoint (events.module.ts: GET :id/page · POST :id/sections · PATCH :id/sections/:sid ·
 * POST :id/sections/:sid/items · PATCH :id/items/:iid · DELETE :id/items/:iid · POST :id/sections/:sid/publish|unpublish).
 * Every write is audited and permission-checked by the API (events.manage / events.publish); publishing triggers the existing
 * on-demand website refresh (@RevalidatesPublic('events')). The website reads only PUBLISHED sections of the PUBLISHED event.
 */
import { apiDelete, apiPatch, apiPost, apiPut } from "@/lib/api";
import { ItemWriteSchema, SectionSchema } from "@/lib/cms-schemas";

const id = (s: string) => encodeURIComponent(s);
type Body = Record<string, unknown>;

export { getEventPage } from "./venue-photos";
export const createSection = (eventId: string, key: string) => apiPost(`/admin/events/${id(eventId)}/sections`, SectionSchema, { key, provenance: "PROPOSED" });
export const updateSection = (eventId: string, sectionId: string, b: Body) => apiPatch(`/admin/events/${id(eventId)}/sections/${id(sectionId)}`, SectionSchema, b);
export const addItem = (eventId: string, sectionId: string, b: Body = {}) => apiPost(`/admin/events/${id(eventId)}/sections/${id(sectionId)}/items`, ItemWriteSchema, { titleEn: "", provenance: "PROPOSED", ...b });
export const updateItem = (eventId: string, itemId: string, b: Body) => apiPatch(`/admin/events/${id(eventId)}/items/${id(itemId)}`, ItemWriteSchema, b);
export const deleteItem = (eventId: string, itemId: string) => apiDelete(`/admin/events/${id(eventId)}/items/${id(itemId)}`);
export const reorderItems = (eventId: string, sectionId: string, ids: string[]) =>
  apiPut(`/admin/events/${id(eventId)}/sections/${id(sectionId)}/items/order`, SectionSchema, { ids });
export const setSectionStatus = (eventId: string, sectionId: string, publish: boolean) =>
  apiPost(`/admin/events/${id(eventId)}/sections/${id(sectionId)}/${publish ? "publish" : "unpublish"}`, SectionSchema);
