/** Dashboard data services: one function per existing backend endpoint (docs/23 §6). No component calls the network directly. */
import { apiCount, apiGet, apiList, apiPost, setCsrfToken } from "@/lib/api";
import {
  AuditRowSchema,
  AuthUserSchema,
  ByCampaignSchema,
  ByDateSchema,
  CampaignRowSchema,
  CheckInStatsSchema,
  CsrfSchema,
  DonationRowSchema,
  EventRowSchema,
  GalaConfigSchema,
  GalaFinancialsSchema,
  LoginSchema,
  SummarySchema,
} from "@/lib/schemas";
import type { Range } from "@/lib/metrics";
import { z } from "zod";

// ── auth (existing contract: cookie session + CSRF header) ──
export async function login(email: string, password: string) {
  const r = await apiPost("/admin/auth/login", LoginSchema, { email, password });
  setCsrfToken(r.csrfToken); // memory only
  return r.user;
}
export const fetchMe = () => apiGet("/admin/auth/me", AuthUserSchema);
export async function refreshCsrf() {
  const r = await apiGet("/admin/auth/csrf", CsrfSchema);
  setCsrfToken(r.csrfToken);
}
export async function logout() {
  await apiPost("/admin/auth/logout", z.object({ loggedOut: z.boolean() }));
  setCsrfToken(null);
}

// ── donation reporting (reports.read) — per currency, test records excluded by the API's default ──
const rangeQ = (r: Range) => ({ from: r.from, to: r.to });
export const fetchSummary = (r: Range, currency?: string | null) => apiGet("/admin/reports/donations/summary", SummarySchema, { ...rangeQ(r), currency: currency ?? undefined });
export const fetchByDate = (r: Range, currency?: string | null) => apiGet("/admin/reports/donations/by-date", ByDateSchema, { ...rangeQ(r), currency: currency ?? undefined });
export const fetchByCampaign = (r: Range, currency?: string | null) => apiGet("/admin/reports/donations/by-campaign", ByCampaignSchema, { ...rangeQ(r), currency: currency ?? undefined });

// ── lists / counts ──
export const fetchDonors = () => apiCount("/admin/donors"); // donors.read
export const fetchPublishedProgrammes = () => apiCount("/admin/programmes", { status: "PUBLISHED", kind: "PROGRAMME" }); // programmes.read
export async function fetchCampaigns() {
  return (await apiList("/admin/campaigns", CampaignRowSchema, { status: "PUBLISHED", pageSize: 50 })).items; // campaigns.read
}
export interface DonationQuery {
  page: number;
  search?: string;
  paymentStatus?: string;
}
export const fetchDonations = (q: DonationQuery) => apiList("/admin/donations", DonationRowSchema, { page: q.page, pageSize: 8, sort: "createdAt:desc", search: q.search, paymentStatus: q.paymentStatus }); // donations.read
export async function fetchActivity() {
  return (await apiList("/admin/audit-logs", AuditRowSchema, { pageSize: 6 })).items; // audit.read (newest first)
}

// ── Gala ticketing — separate financial class (EVENT_TICKET_PAYMENT) ──
const GALA_CODE = "EVT-GALA-NIGHT";
export async function fetchGala(opts: { checkin: boolean }) {
  const events = await apiList("/admin/events", EventRowSchema, { search: GALA_CODE, pageSize: 5 }); // events.read
  const gala = events.items.find((e) => e.code === GALA_CODE);
  if (!gala) return null;
  const [financials, config, stats] = await Promise.all([
    apiGet(`/admin/events/${gala.id}/financials`, GalaFinancialsSchema), // gala.bookings.read
    apiGet(`/admin/events/${gala.id}/ticketing`, GalaConfigSchema).catch(() => null), // 404 when not configured
    opts.checkin ? apiGet(`/admin/events/${gala.id}/check-in/statistics`, CheckInStatsSchema).catch(() => null) : Promise.resolve(null), // gala.checkin.validate
  ]);
  return { financials, capacity: config?.capacity ?? null, stats };
}
