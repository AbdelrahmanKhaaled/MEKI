/** Phase 12 — SDI report reconciliation endpoints (apps/api sdi.module.ts). No component calls the network directly. */
import { z } from "zod";
import { apiDownload, apiGet, apiList, apiPost, apiPut, apiUpload, type Query } from "@/lib/api";
import { AttendeeListSchema, MappingProfileSchema, ReportImportSchema, ReportRowSchema, SdiStatusSchema, UploadedReportSchema } from "@/lib/sdi-schemas";

const id = (s: string) => encodeURIComponent(s);

export const getSdiStatus = () => apiGet("/admin/sdi/status", SdiStatusSchema);
export const listReports = (q: Query) => apiList("/admin/sdi/reports", ReportImportSchema, q);
export const getReport = (rid: string) => apiGet(`/admin/sdi/reports/${id(rid)}`, ReportImportSchema);
export const listReportRows = (rid: string, q: Query) => apiList(`/admin/sdi/reports/${id(rid)}/rows`, ReportRowSchema, q);

export function uploadReport(file: File, kind: "RECONCILIATION" | "ATTENDEES", isSynthetic: boolean, notes: string, onProgress?: (f: number) => void) {
  const form = new FormData();
  form.append("kind", kind);
  form.append("isSynthetic", String(isSynthetic));
  if (notes.trim()) form.append("notes", notes.trim());
  form.append("file", file);
  return apiUpload("/admin/sdi/reports", form, UploadedReportSchema, onProgress);
}

export type PreviewBody = { mapping?: Record<string, unknown>; mappingProfileId?: string; periodFrom?: string; periodTo?: string };
export const previewReport = (rid: string, body: PreviewBody) => apiPost(`/admin/sdi/reports/${id(rid)}/preview`, ReportImportSchema, body);
export const applyReport = (rid: string) => apiPost(`/admin/sdi/reports/${id(rid)}/apply`, ReportImportSchema);
export const rejectReport = (rid: string, reason: string) => apiPost(`/admin/sdi/reports/${id(rid)}/reject`, ReportImportSchema, { reason });
export const exportReport = (rid: string) => apiDownload(`/admin/sdi/reports/${id(rid)}/export`, undefined, "sdi-reconciliation.csv");

export const listMappings = (kind?: string) => apiGet("/admin/sdi/mappings", z.array(MappingProfileSchema), kind ? { kind } : undefined);
export type MappingBody = { kind: "RECONCILIATION" | "ATTENDEES"; name: string; mapping: Record<string, unknown>; headers: string[] };
export const createMapping = (body: MappingBody) => apiPost("/admin/sdi/mappings", MappingProfileSchema, body);
export const updateMapping = (mid: string, body: MappingBody) => apiPut(`/admin/sdi/mappings/${id(mid)}`, MappingProfileSchema, body);
export const verifyMapping = (mid: string, note: string) => apiPost(`/admin/sdi/mappings/${id(mid)}/verify`, MappingProfileSchema, { note });

export const listAttendees = (q: Query) => apiGet("/admin/sdi/attendees", AttendeeListSchema, q);
