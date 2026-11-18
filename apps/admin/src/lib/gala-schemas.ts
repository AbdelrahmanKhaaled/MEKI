/**
 * Phase 6E — response schemas for the existing Gala ticketing API (apps/api/src/modules/gala, Phase 5B/5B.1) and the Phase 6E
 * read additions (gala-ops). Money stays a decimal STRING (never a float); a response that does not match is never rendered.
 */
import { z } from "zod";

const iso = z.string();
const isoN = iso.nullable();
const strN = z.string().nullable();
const money = z.string().regex(/^-?\d+(\.\d+)?$/);

export const GalaEventSchema = z.object({ id: z.string(), code: z.string(), slug: z.string(), titleEn: z.string(), titleAr: strN, status: z.string(), startsAt: isoN, timezone: strN });
export type GalaEvent = z.infer<typeof GalaEventSchema>;

export const BOOKING_STATUSES = ["PENDING", "CONFIRMED", "CANCELLED", "REFUND_PENDING", "REFUNDED"] as const;
export const BOOKING_PAYMENT_STATUSES = ["UNPAID", "PENDING", "PAID", "FAILED", "REFUNDED"] as const;
export const TICKET_STATUSES = ["PENDING", "ISSUED", "CHECKED_IN", "REVOKED", "REFUNDED"] as const;
export const JOB_STATUSES = ["PENDING", "RUNNING", "DONE", "FAILED", "SKIPPED"] as const;

export const BookingRowSchema = z.object({
  id: z.string(),
  publicReference: z.string(),
  eventId: z.string(),
  purchaserName: z.string(),
  purchaserEmail: z.string(),
  purchaserPhone: z.string(),
  guestCount: z.number(),
  unitPrice: money,
  totalAmount: money,
  currency: z.string(),
  classification: z.string(),
  bookingStatus: z.string(),
  paymentStatus: z.string(),
  paymentProvider: strN,
  providerReference: strN,
  refundedAmount: money,
  isTest: z.boolean(),
  locale: z.string(),
  paidAt: isoN,
  cancelledAt: isoN,
  cancelReason: strN,
  createdAt: iso,
  updatedAt: iso,
});
export type BookingRow = z.infer<typeof BookingRowSchema>;

export const BookingTicketSchema = z.object({ id: z.string(), ticketNumber: z.string(), status: z.string(), issuedAt: isoN, checkedInAt: isoN, revokedAt: isoN, hasPdf: z.boolean() });
export const BookingGuestSchema = z.object({
  id: z.string(),
  position: z.number(),
  fullName: z.string(),
  email: z.string(),
  phone: z.string(),
  dietaryRequirements: z.string(),
  isPurchaser: z.boolean(),
  ticket: BookingTicketSchema.nullable(),
});
export type BookingGuest = z.infer<typeof BookingGuestSchema>;
export const JobSchema = z.object({ id: z.string(), type: z.string(), template: strN, status: z.string(), attempts: z.number(), nextRunAt: iso, lastError: strN, completedAt: isoN });
export type Job = z.infer<typeof JobSchema>;

export const BookingDetailSchema = BookingRowSchema.extend({
  guests: z.array(BookingGuestSchema),
  attempts: z.array(z.object({ reference: z.string(), provider: z.string(), status: z.string(), amount: money, currency: z.string(), failureCode: strN, initiatedAt: iso, completedAt: isoN })),
  transactions: z.array(z.object({ id: z.string(), type: z.string(), status: z.string(), classification: z.string(), amount: money, currency: z.string(), provider: z.string(), providerTransactionRef: z.string(), occurredAt: iso })),
  jobs: z.array(JobSchema),
});
export type BookingDetail = z.infer<typeof BookingDetailSchema>;

export const GuestRowSchema = z.object({
  ticketId: z.string(),
  bookingId: z.string(),
  bookingReference: z.string(),
  fullName: z.string(),
  email: z.string(),
  phone: z.string(),
  dietaryRequirements: z.string(),
  ticketNumber: z.string(),
  ticketStatus: z.string(),
  paymentStatus: z.string(),
  checkInStatus: z.enum(["CHECKED_IN", "NOT_CHECKED_IN"]),
  checkedInAt: isoN,
  bookingDate: iso,
});
export type GuestRow = z.infer<typeof GuestRowSchema>;

export const TicketSchema = z.object({
  id: z.string(),
  ticketNumber: z.string(),
  status: z.string(),
  issuedAt: isoN,
  checkedInAt: isoN,
  checkedInById: strN,
  revokedAt: isoN,
  revokeReason: strN,
  tokenVersion: z.number(),
  createdAt: iso,
  eventId: z.string(),
  hasPdf: z.boolean(),
  guest: z.object({ id: z.string(), fullName: z.string(), email: z.string(), phone: z.string(), dietaryRequirements: z.string() }),
  booking: z.object({ id: z.string(), publicReference: z.string(), bookingStatus: z.string(), paymentStatus: z.string() }),
});
export type Ticket = z.infer<typeof TicketSchema>;

export const GalaFinancialsSchema = z.object({
  classification: z.literal("EVENT_TICKET_PAYMENT"),
  currency: z.string(),
  grossCaptured: money,
  refunded: money,
  net: money,
  capturedPayments: z.number(),
  refundPayments: z.number(),
  bookingsByStatus: z.record(z.string(), z.number()),
  ticketsByStatus: z.record(z.string(), z.number()),
  includesTestRecords: z.boolean(),
  taxTreatment: z.object({ taxDeductibleAmount: z.null(), fairMarketValueProvided: z.boolean(), note: z.string() }),
});
export type GalaFinancials = z.infer<typeof GalaFinancialsSchema>;

export const TicketConfigSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  ticketNameEn: z.string(),
  ticketPrice: money,
  currency: z.string(),
  salesEnabled: z.boolean(),
  maxTicketsPerBooking: z.number(),
  capacity: z.number().nullable(),
  displayNameEn: z.string(),
  eventDateLabelEn: z.string(),
  venueLabelEn: z.string(),
  checkInNoteEn: strN,
  provenance: z.string(),
  updatedAt: iso,
});
export type TicketConfig = z.infer<typeof TicketConfigSchema>;

/** Public availability (the same view the booking page uses): sales switch AND payment availability. */
export const TicketingInfoSchema = z.object({
  salesOpen: z.boolean(),
  soldOut: z.boolean(),
  checkoutAvailable: z.boolean(),
  maxTicketsPerBooking: z.number(),
  calendar: z.object({ available: z.boolean() }).passthrough(),
});
export type TicketingInfo = z.infer<typeof TicketingInfoSchema>;

/** The parts of the Events record the Gala settings page shows / edits (events.read / events.manage). */
export const EventDetailSchema = z
  .object({
    id: z.string(),
    code: z.string(),
    slug: z.string(),
    titleEn: z.string(),
    titleAr: strN,
    status: z.string(),
    startsAt: isoN,
    endsAt: isoN,
    timezone: strN,
    venueNameEn: strN,
    venueNameAr: strN,
    addressEn: strN,
    addressAr: strN,
    city: strN,
    countryCode: strN,
    approvedAt: isoN.optional(),
  })
  .passthrough();
export type EventDetail = z.infer<typeof EventDetailSchema>;

export const CHECKIN_RESULTS = ["VALID", "ALREADY_CHECKED_IN", "INVALID", "REVOKED", "REFUNDED", "PAYMENT_NOT_CONFIRMED"] as const;
export const CheckInResponseSchema = z.object({
  result: z.enum(CHECKIN_RESULTS),
  ticket: z.object({ ticketNumber: z.string(), guestName: z.string(), bookingReference: z.string(), status: z.string(), checkedInAt: isoN }).optional(),
});
export type CheckInResponse = z.infer<typeof CheckInResponseSchema>;

export const CheckInStatsSchema = z.object({
  validTickets: z.number(),
  checkedIn: z.number(),
  remaining: z.number(),
  percentCheckedIn: z.number(),
  byStatus: z.record(z.string(), z.number()),
});
export type CheckInStats = z.infer<typeof CheckInStatsSchema>;

export const LookupRowSchema = z.object({ ticketId: z.string(), ticketNumber: z.string(), guestName: z.string(), status: z.string(), checkedInAt: isoN, bookingConfirmed: z.boolean() });
export type LookupRow = z.infer<typeof LookupRowSchema>;

export const HistoryRowSchema = z.object({ id: z.string(), at: iso, kind: z.string(), result: z.string(), ticketNumber: strN, actorName: strN });
export type HistoryRow = z.infer<typeof HistoryRowSchema>;

export const JobRowSchema = JobSchema.extend({
  createdAt: iso,
  updatedAt: iso,
  ticketId: strN,
  ticketNumber: strN,
  booking: z.object({ id: z.string(), publicReference: z.string(), bookingStatus: z.string(), paymentStatus: z.string(), isTest: z.boolean() }),
});
export type JobRow = z.infer<typeof JobRowSchema>;
export const JobsPageSchema = z.object({
  items: z.array(JobRowSchema),
  meta: z.object({ page: z.number(), pageSize: z.number(), total: z.number(), totalPages: z.number() }),
  summary: z.record(z.string(), z.number()),
  transport: z.object({ name: z.string(), delivers: z.boolean() }),
});
export type JobsPage = z.infer<typeof JobsPageSchema>;
