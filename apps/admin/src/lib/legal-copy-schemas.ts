/** Nov 19 2026 — /admin/events/:eventId/legal-copy (apps/api fundraising/legal-copy.ts): SDI-gated Gala legal wording. */
import { z } from "zod";

const isoN = z.string().nullable().optional();
const strN = z.string().nullable().optional();
const moneyN = z.string().regex(/^\d+\.\d{2}$/).nullable().optional();

export const LEGAL_KINDS = ["TICKET_PURCHASE_DISCLOSURE", "TICKET_RECEIPT", "WEBSITE_DISCLOSURE"] as const;
export type LegalKind = (typeof LEGAL_KINDS)[number];

export const LegalCopySchema = z.object({
  kind: z.enum(LEGAL_KINDS),
  textEn: strN,
  textAr: strN,
  ticketPrice: moneyN,
  fairMarketValue: moneyN,
  deductibleAmount: moneyN,
  sourceNote: strN,
  sdiApprovedAt: isoN,
  sdiApprovalNote: strN,
  publishedAt: isoN,
  updatedById: strN,
  publishable: z.boolean(),
});
export type LegalCopy = z.infer<typeof LegalCopySchema>;
export const LegalCopyListSchema = z.object({ liveTicketPrice: z.string().nullable(), items: z.array(LegalCopySchema) });

/** Mirrors the API rule: all three amounts or none, and fair market value + deductible = price. */
export function amountsProblem(price: string, fmv: string, deductible: string): "incomplete" | "inconsistent" | null {
  const vals = [price, fmv, deductible].map((v) => v.trim());
  const filled = vals.filter(Boolean).length;
  if (filled === 0) return null;
  if (filled !== 3) return "incomplete";
  const cents = vals.map((v) => Math.round(Number(v) * 100));
  if (cents.some((c) => !Number.isFinite(c))) return "inconsistent";
  return cents[1] + cents[2] === cents[0] ? null : "inconsistent";
}

/** Publishing needs SDI approval, a publishable kind, and (when a price is stated) the live ticket price. */
export function publishBlocker(c: LegalCopy, livePrice: string | null): "receipt" | "notApproved" | "priceMismatch" | null {
  if (!c.publishable) return "receipt";
  if (!c.sdiApprovedAt) return "notApproved";
  if (c.ticketPrice && c.ticketPrice !== livePrice) return "priceMismatch";
  return null;
}
