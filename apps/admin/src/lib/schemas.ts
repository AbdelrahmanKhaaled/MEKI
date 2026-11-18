/**
 * Response schemas for the admin API (hand-written from the backend implementation — OpenAPI does not describe admin
 * response bodies, see docs/23 gap G8). Validation happens at the API boundary: a response that does not match is rejected
 * (shown as an error state) instead of rendering wrong numbers. Money is ALWAYS a decimal string.
 */
import { z } from "zod";

const money = z.string().regex(/^-?\d+(\.\d+)?$/);
const cur = z.string().regex(/^[A-Z]{3}$/);

export const AuthUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  isSuperAdmin: z.boolean(),
  mustChangePassword: z.boolean(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

export const LoginSchema = z.object({ user: AuthUserSchema, csrfToken: z.string(), expiresAt: z.string() });
export const CsrfSchema = z.object({ csrfToken: z.string() });

export const SummarySchema = z.object({
  confirmed: z.array(z.object({ currency: cur, count: z.number(), gross: money, refunded: money, net: money })),
  byFrequency: z.array(z.object({ frequency: z.string(), currency: cur, count: z.number(), gross: money, net: money })),
  donationsByStatus: z.array(z.object({ status: z.string(), paymentStatus: z.string(), count: z.number() })),
});
export type Summary = z.infer<typeof SummarySchema>;

export const ByDateSchema = z.array(z.object({ date: z.string(), currency: cur, count: z.number(), gross: money, net: money }));
export type ByDateRow = z.infer<typeof ByDateSchema>[number];

export const ByCampaignSchema = z.array(
  z.object({
    designation: z.enum(["GENERAL_FUND", "CAMPAIGN", "PROGRAMME"]),
    campaign: z.object({ slug: z.string(), titleEn: z.string() }).nullable(),
    programme: z.object({ slug: z.string(), nameEn: z.string() }).nullable(),
    currency: cur,
    count: z.number(),
    gross: money,
    net: money,
  }),
);
export type ByCampaignRow = z.infer<typeof ByCampaignSchema>[number];

export const PageMetaSchema = z.object({ page: z.number(), pageSize: z.number(), total: z.number(), totalPages: z.number() });
export type PageMeta = z.infer<typeof PageMetaSchema>;

export const DonationRowSchema = z.object({
  id: z.string(),
  reference: z.string(),
  amount: money,
  refundedAmount: money,
  netAmount: money,
  currency: cur,
  frequency: z.string(),
  status: z.string(),
  paymentStatus: z.string(),
  isAnonymous: z.boolean(),
  isTest: z.boolean(),
  confirmedAt: z.string().nullable(),
  createdAt: z.string(),
  allocations: z.array(
    z.object({
      designation: z.string(),
      campaign: z.object({ titleEn: z.string() }).nullable(),
      programme: z.object({ nameEn: z.string() }).nullable(),
    }),
  ),
  /** present only for admins holding donors.read */
  donor: z.object({ firstName: z.string(), lastName: z.string(), organizationName: z.string().nullable().optional() }).optional(),
});
export type DonationRow = z.infer<typeof DonationRowSchema>;

export const CampaignRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  titleEn: z.string(),
  status: z.string(),
  currency: cur,
  /** only an MEKI-approved figure is ever stored; null = no approved target */
  targetAmount: money.nullable().optional(),
});
export type CampaignRow = z.infer<typeof CampaignRowSchema>;

export const AuditRowSchema = z.object({
  id: z.string(),
  actorEmail: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  createdAt: z.string(),
});
export type AuditRow = z.infer<typeof AuditRowSchema>;

export const EventRowSchema = z.object({ id: z.string(), code: z.string(), slug: z.string(), titleEn: z.string() });

export const GalaFinancialsSchema = z.object({
  classification: z.literal("EVENT_TICKET_PAYMENT"),
  currency: cur,
  grossCaptured: money,
  refunded: money,
  net: money,
  capturedPayments: z.number(),
  refundPayments: z.number(),
  bookingsByStatus: z.record(z.string(), z.number()),
  ticketsByStatus: z.record(z.string(), z.number()),
});
export type GalaFinancials = z.infer<typeof GalaFinancialsSchema>;

export const GalaConfigSchema = z.object({ capacity: z.number().nullable(), currency: cur });
export const CheckInStatsSchema = z.object({ validTickets: z.number(), checkedIn: z.number(), remaining: z.number(), percentCheckedIn: z.number() });
export type CheckInStats = z.infer<typeof CheckInStatsSchema>;
