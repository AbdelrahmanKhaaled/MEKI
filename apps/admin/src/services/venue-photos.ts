/**
 * Phase 13B — Gala venue photographs. One function per EXISTING event landing-page endpoint (events.module.ts:
 * GET :id/page · POST :id/sections · POST :id/sections/:sid/items · PATCH :id/items/:iid · DELETE :id/items/:iid ·
 * POST :id/sections/:sid/publish|unpublish). The website shows the published EVENT_VENUE items only while the event is public.
 */
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { ItemWriteSchema, PageDetailSchema, SectionSchema } from "@/lib/cms-schemas";

const id = (s: string) => encodeURIComponent(s);
type Body = Record<string, unknown>;

export const VENUE_KEY = "EVENT_VENUE";
export const getEventPage = (eventId: string) => apiGet(`/admin/events/${id(eventId)}/page`, PageDetailSchema);
export const createVenueSection = (eventId: string) => apiPost(`/admin/events/${id(eventId)}/sections`, SectionSchema, { key: VENUE_KEY, provenance: "PROPOSED" });
export const addVenuePhoto = (eventId: string, sectionId: string) => apiPost(`/admin/events/${id(eventId)}/sections/${id(sectionId)}/items`, ItemWriteSchema, { titleEn: "", provenance: "PROPOSED" });
export const updateVenuePhoto = (eventId: string, itemId: string, b: Body) => apiPatch(`/admin/events/${id(eventId)}/items/${id(itemId)}`, ItemWriteSchema, b);
export const deleteVenuePhoto = (eventId: string, itemId: string) => apiDelete(`/admin/events/${id(eventId)}/items/${id(itemId)}`);
export const setVenueSectionStatus = (eventId: string, sectionId: string, publish: boolean) =>
  apiPost(`/admin/events/${id(eventId)}/sections/${id(sectionId)}/${publish ? "publish" : "unpublish"}`, SectionSchema);
