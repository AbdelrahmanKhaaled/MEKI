/** Phase 12 — responses of /admin/sdi/* (apps/api sdi.module.ts). Configuration is exposed as booleans only; never values. */
import { z } from "zod";

const iso = z.string();
const isoN = z.string().nullable();
const money = z.string().regex(/^\d+(\.\d+)?$/);

export const REPORT_KINDS = ["RECONCILIATION", "ATTENDEES"] as const;
export const REPORT_STATUSES = ["UPLOADED", "PREVIEWED", "APPLIED", "REJECTED"] as const;
export const ROW_STATUSES = ["MATCHED", "UNMATCHED", "AMBIGUOUS", "INVALID_REFERENCE", "AMOUNT_MISMATCH", "DUPLICATE_ROW", "STALE", "ALREADY_APPLIED", "REQUIRES_REVIEW", "INVALID", "INFO"] as const;
export const ORDER_STATUSES = ["COMPLETED", "PENDING", "FAILED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"] as const;
export const DATE_FORMATS = ["ISO", "MDY", "DMY"] as const;

export const SdiStatusSchema = z.object({
  mode: z.enum(["meki", "zeffy_hosted"]).nullable().optional(),
  galaHostedSalesEnabled: z.boolean(),
  galaFormConfigured: z.boolean(),
  generalGivingEnabled: z.boolean(),
  programmeGivingEnabled: z.boolean(),
  programmeDesignationConfirmed: z.boolean(),
  applyEnabled: z.boolean(),
  zeffyApiConfigured: z.boolean(),
  lastAppliedReport: z.object({ id: z.string(), appliedAt: isoN, periodTo: isoN, isSynthetic: z.boolean() }).nullable(),
  importsAwaitingAction: z.number(),
  rowsRequiringReview: z.number(),
  missingBusinessDays: z.array(z.string()),
});
export type SdiStatus = z.infer<typeof SdiStatusSchema>;

export const ReportImportSchema = z.object({
  id: z.string(),
  source: z.string(),
  kind: z.enum(REPORT_KINDS),
  status: z.enum(REPORT_STATUSES),
  fileName: z.string(),
  fileSha256: z.string(),
  fileSize: z.number(),
  fileType: z.string(),
  headers: z.array(z.string()),
  mapping: z.record(z.string(), z.unknown()).nullable(),
  mappingProfileId: z.string().nullable(),
  isSynthetic: z.boolean(),
  periodFrom: isoN,
  periodTo: isoN,
  rowCount: z.number(),
  acceptedCount: z.number(),
  rejectedCount: z.number(),
  summary: z.record(z.string(), z.unknown()).nullable(),
  supersedesId: z.string().nullable(),
  uploadedById: z.string().nullable(),
  uploadedAt: iso,
  previewedAt: isoN,
  approvedById: z.string().nullable(),
  appliedAt: isoN,
  rejectedById: z.string().nullable(),
  rejectedAt: isoN,
  rejectReason: z.string().nullable(),
  notes: z.string().nullable(),
});
export type ReportImport = z.infer<typeof ReportImportSchema>;
export const UploadedReportSchema = ReportImportSchema.extend({ suggestedMapping: z.record(z.string(), z.unknown()) });

export const ReportRowSchema = z.object({
  id: z.string(),
  rowNumber: z.number(),
  sourceOrderId: z.string().nullable(),
  bookingReferenceRaw: z.string().nullable(),
  bookingReference: z.string().nullable(),
  ticketType: z.string().nullable(),
  lineKind: z.string().nullable(),
  quantity: z.number().nullable(),
  amount: money.nullable(),
  refundedAmount: money.nullable(),
  currency: z.string().nullable(),
  statusRaw: z.string().nullable(),
  status: z.string().nullable(),
  occurredAt: isoN,
  matchStatus: z.enum(ROW_STATUSES),
  matchNote: z.string().nullable(),
  applied: z.boolean(),
  booking: z.object({ id: z.string(), eventId: z.string(), publicReference: z.string() }).nullable(),
});
export type ReportRow = z.infer<typeof ReportRowSchema>;

export const MappingProfileSchema = z.object({
  id: z.string(),
  kind: z.enum(REPORT_KINDS),
  name: z.string(),
  mapping: z.record(z.string(), z.unknown()),
  verifiedAgainstSample: z.boolean(),
  verifiedAt: isoN,
  verificationNote: z.string().nullable(),
  createdById: z.string().nullable(),
});
export type MappingProfile = z.infer<typeof MappingProfileSchema>;

export const AttendeeSchema = z.object({
  id: z.string(),
  rowNumber: z.number(),
  sourceOrderId: z.string().nullable(),
  bookingReference: z.string().nullable(),
  guestName: z.string(),
  ticketType: z.string().nullable(),
  tableLabel: z.string().nullable(),
  answers: z.record(z.string(), z.string()).nullable(),
});
export type Attendee = z.infer<typeof AttendeeSchema>;
export const AttendeeListSchema = z.object({
  import: z.object({ id: z.string(), fileName: z.string(), appliedAt: isoN, isSynthetic: z.boolean() }).nullable(),
  items: z.array(AttendeeSchema),
  meta: z.object({ page: z.number(), pageSize: z.number(), total: z.number(), totalPages: z.number() }),
});
export type AttendeeList = z.infer<typeof AttendeeListSchema>;
