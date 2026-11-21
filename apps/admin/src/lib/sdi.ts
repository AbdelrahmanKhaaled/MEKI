/**
 * Phase 12 — pure helpers for the SDI report importer. SDI has not supplied a sample file, so nothing here assumes column
 * names: suggestions are header-name matches only and the importer confirms every column before preview. The server
 * re-validates everything (columns exist, statuses known, formats).
 */
import { ORDER_STATUSES } from "./sdi-schemas.ts";

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const REPORT_TYPES = ["GALA_TICKETS", "GALA_DONATIONS", "GENERAL_DONATIONS", "PROGRAMME_DONATIONS"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export type ReconForm = {
  /** Phase 12B: Gala ticket form (booking references) or Gala standalone donation form */
  reportType: ReportType;
  orderId: string; bookingReference: string; ticketType: string; quantity: string; amount: string; refundedAmount: string; currency: string; status: string; date: string;
  /** Phase 12B (SDI sample layout): separate time column, report time zone, fund + recurring columns */
  time: string; fund: string; recurring: string;
  timeZone: string;
  /** comma-separated fund name(s) of the approved Gala project */
  galaFunds: string;
  dateFormat: "ISO" | "MDY" | "DMY";
  /** one "raw value = STATUS" per line */
  statusMap: string;
  /** comma-separated ticket types that are Gala donation lines */
  donationTicketTypes: string;
  /** Phase 14: SDI custom questions on donation forms */
  donationReference: string; donationType: string; designation: string;
  /** one "answer = ZAKAT|SADAQAH" per line (empty = the server's reviewed defaults) */
  donationTypeMap: string;
  /** one "report value = GENERAL | GALA_PROJECT | programme:<slug>" per line */
  designationMap: string;
};
export type AttendeeForm = { guestName: string; ticketType: string; tableLabel: string; orderId: string; bookingReference: string; answers: string[] };

export const RECON_FIELDS = ["orderId", "bookingReference", "ticketType", "quantity", "amount", "refundedAmount", "currency", "status", "date", "time", "fund", "recurring", "donationReference", "donationType", "designation"] as const;
/** Columns that only make sense for the Gala TICKET form (hidden for a donation report). */
export const TICKET_ONLY_FIELDS: readonly string[] = ["bookingReference", "ticketType", "quantity"];
/** Phase 14: columns that only exist on donation forms (MEKI Donation Reference, Donation Type, Program/Fund). */
export const DONATION_ONLY_FIELDS: readonly string[] = ["donationReference", "donationType", "designation"];
export const reconFieldsFor = (t: ReportType) => RECON_FIELDS.filter((k) => (t === "GALA_TICKETS" ? !DONATION_ONLY_FIELDS.includes(k) : !TICKET_ONLY_FIELDS.includes(k)));
export const isDonationReport = (t: ReportType) => t !== "GALA_TICKETS";
export const RECON_REQUIRED: readonly string[] = ["orderId", "amount", "status", "date"];
export const ATTENDEE_FIELDS = ["guestName", "ticketType", "tableLabel", "orderId", "bookingReference"] as const;

/** Convenience defaults only (same list as the API); each line can be edited; unknown values always go to review. */
export const DEFAULT_STATUS_LINES = [
  "completed = COMPLETED", "succeeded = COMPLETED", "paid = COMPLETED", "approved = COMPLETED", "pending = PENDING", "processing = PENDING",
  "failed = FAILED", "declined = FAILED", "cancelled = CANCELLED", "canceled = CANCELLED", "voided = CANCELLED",
  "refunded = REFUNDED", "fully refunded = REFUNDED", "partially refunded = PARTIALLY_REFUNDED", "partial refund = PARTIALLY_REFUNDED",
  "abandoned = FAILED",
].join("\n");

const key = (h: string) => h.toLowerCase().replace(/[^a-z]/g, "");
// exact header match first; then a header that STARTS with the name (e.g. "Payment Date (America/New_York)")
const finder = (headers: string[]) => (...names: string[]) => headers.find((h) => names.includes(key(h))) ?? headers.find((h) => names.some((n) => n.length >= 4 && key(h).startsWith(n))) ?? "";
/** IANA zone stated in a header, e.g. "Payment Date (America/New_York)" → "America/New_York". */
export const zoneFromHeaders = (headers: string[]) => headers.map((h) => /\(([A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?)\)/.exec(h)?.[1]).find(Boolean) ?? "UTC";

export function suggestRecon(headers: string[]): ReconForm {
  const f = finder(headers);
  return {
    orderId: f("orderid", "order", "ordernumber", "paymentid", "transactionid"), bookingReference: f("mekibookingreference", "bookingreference", "reference"),
    ticketType: f("tickettype", "ticket", "rate", "item"), quantity: f("quantity", "qty", "tickets"), amount: f("amount", "total", "totalamount"),
    refundedAmount: f("refundedamount", "refunded", "refundamount"), currency: f("currency"), status: f("status", "paymentstatus", "orderstatus"),
    date: f("date", "orderdate", "createdat", "paymentdate"), dateFormat: "ISO", statusMap: DEFAULT_STATUS_LINES, donationTicketTypes: "",
    reportType: "GALA_TICKETS", time: f("paymenttime", "time", "ordertime"), fund: f("fund", "designation"), recurring: f("recurringstatus", "recurring", "frequency"), timeZone: zoneFromHeaders(headers), galaFunds: "",
    donationReference: f("mekidonationreference", "donationreference"), donationType: f("donationtype", "typeofdonation"), designation: f("program", "programme", "programfund", "approvedprogram"),
    donationTypeMap: "", designationMap: "",
  };
}

export function suggestAttendees(headers: string[]): AttendeeForm {
  const f = finder(headers);
  return { guestName: f("guestname", "attendeename", "name", "fullname"), ticketType: f("tickettype", "ticket", "rate"), tableLabel: f("table", "tablenumber"), orderId: f("orderid", "order", "paymentid"), bookingReference: f("mekibookingreference", "bookingreference"), answers: [] };
}

/** Parses the status-map text. Returns the map, or the 1-based line numbers that are not "value = KNOWN_STATUS". */
export function parseStatusMap(text: string): { map: Record<string, OrderStatus>; badLines: number[] } {
  const map: Record<string, OrderStatus> = {};
  const badLines: number[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const m = /^(.{1,60}?)\s*=\s*([A-Z_]+)\s*$/.exec(line.trim());
    if (!m || !(ORDER_STATUSES as readonly string[]).includes(m[2])) return void badLines.push(i + 1);
    map[m[1].trim().toLowerCase()] = m[2] as OrderStatus;
  });
  return { map, badLines };
}

export const statusMapToText = (m: Record<string, string>) => Object.entries(m).map(([k, v]) => `${k} = ${v}`).join("\n");

/** Phase 14: "answer = ZAKAT|SADAQAH" lines. Same rules as the status map (unknown answers always go to review). */
export function parseTypeMap(text: string): { map: Record<string, string>; badLines: number[] } {
  return parseLines(text, (v) => v === "ZAKAT" || v === "SADAQAH");
}
/** Phase 14: "report value = GENERAL | GALA_PROJECT | programme:<slug>" lines. */
export function parseDesignationMap(text: string): { map: Record<string, string>; badLines: number[] } {
  return parseLines(text, (v) => /^(?:GENERAL|GALA_PROJECT|programme:[a-z0-9-]{2,100})$/.test(v));
}
function parseLines(text: string, ok: (v: string) => boolean) {
  const map: Record<string, string> = {};
  const badLines: number[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const m = /^(.{1,120}?)\s*=\s*(\S+)\s*$/.exec(line.trim());
    if (!m || !ok(m[2])) return void badLines.push(i + 1);
    map[m[1].trim().toLowerCase()] = m[2];
  });
  return { map, badLines };
}

/** Form → API mapping body. Empty optional columns are omitted (never guessed). */
export function reconBody(f: ReconForm) {
  const out: Record<string, unknown> = {
    reportType: f.reportType, dateFormat: f.dateFormat, timeZone: f.timeZone.trim() || "UTC", statusMap: parseStatusMap(f.statusMap).map,
    donationTicketTypes: f.donationTicketTypes.split(",").map((s) => s.trim()).filter(Boolean), galaFunds: f.galaFunds.split(",").map((s) => s.trim()).filter(Boolean),
  };
  for (const k of reconFieldsFor(f.reportType)) if (f[k]) out[k] = f[k];
  if (isDonationReport(f.reportType)) {
    if (f.donationTypeMap.trim()) out.donationTypeMap = parseTypeMap(f.donationTypeMap).map;
    if (f.designationMap.trim()) out.designationMap = parseDesignationMap(f.designationMap).map;
  }
  return out;
}
export function attendeeBody(f: AttendeeForm) {
  const out: Record<string, unknown> = { answers: f.answers };
  for (const k of ATTENDEE_FIELDS) if (f[k]) out[k] = f[k];
  return out;
}

/** Saved mapping (from a profile or an earlier preview) → form; falls back to header suggestions for anything missing. */
export function reconFromSaved(m: Record<string, unknown> | null | undefined, headers: string[]): ReconForm {
  const base = suggestRecon(headers);
  if (!m) return base;
  const s = (k: string) => (typeof m[k] === "string" && headers.includes(m[k] as string) ? (m[k] as string) : "");
  return {
    orderId: s("orderId"), bookingReference: s("bookingReference"), ticketType: s("ticketType"), quantity: s("quantity"), amount: s("amount"), refundedAmount: s("refundedAmount"), currency: s("currency"), status: s("status"), date: s("date"),
    time: s("time"), fund: s("fund"), recurring: s("recurring"), reportType: (REPORT_TYPES as readonly string[]).includes(m.reportType as string) ? (m.reportType as ReportType) : "GALA_TICKETS",
    donationReference: s("donationReference"), donationType: s("donationType"), designation: s("designation"),
    donationTypeMap: m.donationTypeMap && typeof m.donationTypeMap === "object" ? statusMapToText(m.donationTypeMap as Record<string, string>) : "",
    designationMap: m.designationMap && typeof m.designationMap === "object" ? statusMapToText(m.designationMap as Record<string, string>) : "",
    timeZone: typeof m.timeZone === "string" && m.timeZone ? m.timeZone : "UTC", galaFunds: Array.isArray(m.galaFunds) ? (m.galaFunds as string[]).join(", ") : "",
    dateFormat: m.dateFormat === "MDY" || m.dateFormat === "DMY" ? m.dateFormat : "ISO",
    statusMap: m.statusMap && typeof m.statusMap === "object" ? statusMapToText(m.statusMap as Record<string, string>) : base.statusMap,
    donationTicketTypes: Array.isArray(m.donationTicketTypes) ? (m.donationTicketTypes as string[]).join(", ") : "",
  };
}
export function attendeeFromSaved(m: Record<string, unknown> | null | undefined, headers: string[]): AttendeeForm {
  if (!m) return suggestAttendees(headers);
  const s = (k: string) => (typeof m[k] === "string" && headers.includes(m[k] as string) ? (m[k] as string) : "");
  return { guestName: s("guestName"), ticketType: s("ticketType"), tableLabel: s("tableLabel"), orderId: s("orderId"), bookingReference: s("bookingReference"), answers: Array.isArray(m.answers) ? (m.answers as string[]).filter((a) => headers.includes(a)) : [] };
}

/** Client-side pre-check (the server is authoritative): required columns chosen, no column used twice, status map well-formed. */
export function reconProblems(f: ReconForm): string[] {
  const p: string[] = [];
  for (const k of RECON_REQUIRED) if (!f[k as keyof ReconForm]) p.push(`missing:${k}`);
  const used = reconFieldsFor(f.reportType).map((k) => f[k]).filter(Boolean);
  if (f.fund && !f.galaFunds.trim()) p.push("galaFunds");
  if (f.timeZone.trim() && !/^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){1,2})$/.test(f.timeZone.trim())) p.push("timeZone");
  if (new Set(used).size !== used.length) p.push("duplicateColumn");
  if (parseStatusMap(f.statusMap).badLines.length) p.push("statusMap");
  // Phase 14: general / programme reports can only be reconciled against MEKI donation references
  if ((f.reportType === "GENERAL_DONATIONS" || f.reportType === "PROGRAMME_DONATIONS") && !f.donationReference) p.push("missing:donationReference");
  if (f.reportType === "PROGRAMME_DONATIONS" && !f.designation) p.push("missing:designation");
  if (isDonationReport(f.reportType) && parseTypeMap(f.donationTypeMap).badLines.length) p.push("donationTypeMap");
  if (isDonationReport(f.reportType) && parseDesignationMap(f.designationMap).badLines.length) p.push("designationMap");
  return p;
}

export const ALLOWED_UPLOAD = /\.(csv|xlsx)$/i;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export function uploadProblem(file: { name: string; size: number } | null): "none" | "type" | "size" | null {
  if (!file) return "none";
  if (!ALLOWED_UPLOAD.test(file.name)) return "type";
  if (file.size > MAX_UPLOAD_BYTES || file.size === 0) return "size";
  return null;
}

/** Four-eyes in the UI mirrors the server: the uploader cannot approve their own report. */
export const canApprove = (imp: { status: string; uploadedById: string | null }, userId: string | undefined, hasPermission: boolean) =>
  hasPermission && imp.status === "PREVIEWED" && !!userId && imp.uploadedById !== userId;
