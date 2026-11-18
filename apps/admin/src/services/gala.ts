/** Phase 6E — one function per existing Gala endpoint (apps/api gala.controllers.ts + gala-ops.controller.ts). No component calls the network. */
import { z } from "zod";
import { apiDownload, apiGet, apiList, apiPatch, apiPost, type Query } from "@/lib/api";
import {
  BookingDetailSchema, BookingRowSchema, CheckInResponseSchema, CheckInStatsSchema, EventDetailSchema, GalaEventSchema, GalaFinancialsSchema, GuestRowSchema, HistoryRowSchema,
  JobsPageSchema, LookupRowSchema, TicketConfigSchema, TicketingInfoSchema, TicketSchema,
} from "@/lib/gala-schemas";

const e = (id: string) => `/admin/events/${encodeURIComponent(id)}`;
const id = encodeURIComponent;
export type Body = Record<string, unknown>;

// event resolution (any gala.* read permission or events.read)
export const listGalaEvents = () => apiGet("/admin/gala/events", z.array(GalaEventSchema));

// overview / config
export const getFinancials = (ev: string, includeTest: boolean) => apiGet(`${e(ev)}/financials`, GalaFinancialsSchema, { includeTest: includeTest ? "true" : undefined });
export const getTicketConfig = (ev: string) => apiGet(`${e(ev)}/ticketing`, TicketConfigSchema);
export const updateTicketConfig = (ev: string, b: Body) => apiPatch(`${e(ev)}/ticketing`, TicketConfigSchema, b);
export const getEvent = (ev: string) => apiGet(e(ev), EventDetailSchema);
export const updateEvent = (ev: string, b: Body) => apiPatch(e(ev), EventDetailSchema, b);
export const getTicketingInfo = (slug: string) => apiGet(`/public/events/${id(slug)}/ticketing`, TicketingInfoSchema);

// bookings
export const listBookings = (ev: string, q: Query) => apiList(`${e(ev)}/bookings`, BookingRowSchema, q);
export const getBooking = (ev: string, b: string) => apiGet(`${e(ev)}/bookings/${id(b)}`, BookingDetailSchema);
export const updateBooking = (ev: string, b: string, body: Body) => apiPatch(`${e(ev)}/bookings/${id(b)}`, BookingDetailSchema, body);
export const cancelBooking = (ev: string, b: string, reason: string) => apiPost(`${e(ev)}/bookings/${id(b)}/cancel`, BookingDetailSchema, { reason });
export const regenerateTickets = (ev: string, b: string) => apiPost(`${e(ev)}/bookings/${id(b)}/regenerate-tickets`, z.unknown());
export const resendBooking = (ev: string, b: string) => apiPost(`${e(ev)}/bookings/${id(b)}/resend`, z.object({ requeued: z.number() }).passthrough());

// guests / exports
export const listGuests = (ev: string, q: Query) => apiList(`${e(ev)}/guests`, GuestRowSchema, q);
export const exportGuests = (ev: string, q: Query) => apiDownload(`${e(ev)}/guests/export`, q, `guests.${q.format === "xlsx" ? "xlsx" : "csv"}`);

// tickets
export const listTickets = (ev: string, q: Query) => apiList(`${e(ev)}/tickets`, TicketSchema, q);
export const getTicket = (ev: string, t: string) => apiGet(`${e(ev)}/tickets/${id(t)}`, TicketSchema);
export const downloadTicketPdf = (ev: string, t: string, ticketNumber: string) => apiDownload(`${e(ev)}/tickets/${id(t)}/pdf`, undefined, `${ticketNumber}.pdf`);
export const revokeTicket = (ev: string, t: string, reason: string) => apiPost(`${e(ev)}/tickets/${id(t)}/revoke`, z.unknown(), { reason });
export const reissueTicket = (ev: string, t: string, reason: string) => apiPost(`${e(ev)}/tickets/${id(t)}/reissue`, z.unknown(), { reason });

// check-in
export const validateScan = (ev: string, token: string, verifyOnly = false) => apiPost(`${e(ev)}/check-in/validate`, CheckInResponseSchema, { token, ...(verifyOnly ? { verifyOnly: true } : {}) });
export const checkInStats = (ev: string) => apiGet(`${e(ev)}/check-in/statistics`, CheckInStatsSchema);
export const doorLookup = (ev: string, q: string) => apiGet(`${e(ev)}/check-in/lookup`, z.array(LookupRowSchema), { q });
export const checkInHistory = (ev: string, q: Query) => apiList(`${e(ev)}/check-in/history`, HistoryRowSchema, q);
export const manualCheckIn = (ev: string, t: string) => apiPost(`${e(ev)}/tickets/${id(t)}/check-in`, z.object({ ticketNumber: z.string(), status: z.string() }));
export const undoCheckIn = (ev: string, t: string, reason: string) => apiPost(`${e(ev)}/tickets/${id(t)}/undo-check-in`, z.object({ ticketNumber: z.string(), status: z.string() }), { reason });

// communications
export const listJobs = (ev: string, q: Query) => apiGet(`${e(ev)}/jobs`, JobsPageSchema, q);
