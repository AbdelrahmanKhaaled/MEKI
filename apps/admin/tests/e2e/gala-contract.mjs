// Validates the Phase 6E (Gala operations) response schemas against a RUNNING API on a *_test database. READ-ONLY (GET only).
// Usage: API_URL=http://localhost:4100 ADMIN_EMAIL=… STAFF_EMAIL=… FINANCE_EMAIL=… PASSWORD=… EVENT_ID=… node tests/e2e/gala-contract.mjs
import { z } from "zod";
import {
  BookingDetailSchema, BookingRowSchema, CheckInStatsSchema, EventDetailSchema, GalaEventSchema, GalaFinancialsSchema, GuestRowSchema, HistoryRowSchema, JobsPageSchema, LookupRowSchema,
  TicketConfigSchema, TicketSchema,
} from "../../src/lib/gala-schemas.ts";

const API = `${process.env.API_URL ?? "http://localhost:4100"}/api/v1`;
async function session(email) {
  const r = await fetch(`${API}/admin/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: process.env.PASSWORD }) });
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  console.log("login", email.split("-")[1], r.status);
  return async (path) => {
    const res = await fetch(API + path, { headers: { Cookie: cookie, Accept: "application/json" } });
    return { status: res.status, json: await res.json().catch(() => null), headers: res.headers };
  };
}
let ok = 0, fail = 0;
const tally = (pass, label) => { if (pass) ok++; else fail++; console.log(pass ? "OK  " : "FAIL", label); };
const check = (name, schema, data) => {
  const p = schema.safeParse(data);
  tally(p.success, `${name}${p.success ? "" : ` ${JSON.stringify(p.error.issues.slice(0, 3))}`}`);
  return p.success ? p.data : null;
};

const admin = await session(process.env.ADMIN_EMAIL);
const staff = await session(process.env.STAFF_EMAIL);
const finance = await session(process.env.FINANCE_EMAIL);
const EV = process.env.EVENT_ID;
const e = `/admin/events/${EV}`;

const events = check("gala events", z.array(GalaEventSchema), (await admin("/admin/gala/events")).json?.data) ?? [];
tally(events.some((x) => x.id === EV), "fixture event listed");
const gala = events.find((x) => x.code === "EVT-GALA-NIGHT");
console.log("     Gala Night event present:", gala ? "yes" : "no");

const fin = check("financials (includeTest)", GalaFinancialsSchema, (await admin(`${e}/financials?includeTest=true`)).json?.data);
tally(fin?.classification === "EVENT_TICKET_PAYMENT" && fin?.taxTreatment.taxDeductibleAmount === null, "financials: ticket class only, no tax-deductible value");
const finReal = check("financials (default: test excluded)", GalaFinancialsSchema, (await admin(`${e}/financials`)).json?.data);
tally(finReal?.grossCaptured === "0.00", "test-provider money excluded by default");
check("ticket config", TicketConfigSchema, (await admin(`${e}/ticketing`)).json?.data);
check("event detail", EventDetailSchema, (await admin(e)).json?.data);

const bookings = (await admin(`${e}/bookings?includeTest=true&pageSize=50`)).json;
const rows = check(`bookings[] (${bookings?.data?.length})`, z.array(BookingRowSchema), bookings?.data) ?? [];
tally((await admin(`${e}/bookings`)).json?.meta?.total === 0, "bookings: test-provider bookings hidden by default");
if (rows[0]) {
  const d = check("booking detail", BookingDetailSchema, (await admin(`${e}/bookings/${rows[0].id}`)).json?.data);
  tally(d && !JSON.stringify(d).match(/accessToken|qrToken|TokenHash|pdfStorageKey/), "booking detail exposes no token / hash / storage key");
}
const guests = check("guests[]", z.array(GuestRowSchema), (await admin(`${e}/guests?includeTest=true&pageSize=50`)).json?.data) ?? [];
tally(guests.length > 0 && guests.every((g) => g.ticketId && g.bookingId), "guest rows carry ticketId + bookingId");
const tickets = check("tickets[]", z.array(TicketSchema), (await admin(`${e}/tickets?pageSize=50`)).json?.data) ?? [];
if (tickets[0]) check("ticket detail", TicketSchema, (await admin(`${e}/tickets/${tickets[0].id}`)).json?.data);
tally(!JSON.stringify(tickets).match(/qrTokenHash|pdfStorageKey|mkt_/), "tickets expose no QR hash / storage key");
const jobs = check("jobs page", JobsPageSchema, (await admin(`${e}/jobs`)).json?.data);
tally(jobs && jobs.items.length > 0 && typeof jobs.transport.delivers === "boolean", `jobs + transport (${jobs?.transport.name})`);
check("check-in statistics (staff)", CheckInStatsSchema, (await staff(`${e}/check-in/statistics`)).json?.data);
check("door lookup (staff)", z.array(LookupRowSchema), (await staff(`${e}/check-in/lookup?q=Layla`)).json?.data);
check("check-in history (staff)", z.array(HistoryRowSchema), (await staff(`${e}/check-in/history`)).json?.data);

// least privilege
const st = async (s, p) => (await s(p)).status;
tally((await st(staff, "/admin/gala/events")) === 200, "staff: can resolve the event");
for (const p of [`${e}/guests`, `${e}/bookings`, `${e}/financials`, `${e}/tickets`, `${e}/jobs`, `${e}/guests/export`]) tally((await st(staff, p)) === 403, `staff: 403 on ${p.replace(e, "")}`);
tally((await st(finance, `${e}/guests/export`)) === 403, "finance: no guest export (gala.guests.export)");
tally((await st(finance, `${e}/check-in/lookup?q=Layla`)) === 403, "finance: no door lookup (gala.checkin.validate)");
tally((await st(finance, `${e}/financials`)) === 200 && (await st(finance, `${e}/guests`)) === 200, "finance: reads bookings figures and guests");
if (gala) {
  check("Gala Night financials", GalaFinancialsSchema, (await admin(`/admin/events/${gala.id}/financials`)).json?.data);
  const cfg = await admin(`/admin/events/${gala.id}/ticketing`);
  if (cfg.status === 200) {
    const c = check("Gala Night ticket config", TicketConfigSchema, cfg.json?.data);
    console.log("     Gala Night: price", c?.ticketPrice, c?.currency, "sales", c?.salesEnabled ? "OPEN" : "closed", "capacity", c?.capacity);
  } else console.log("     Gala Night ticketing not configured in this database:", cfg.status);
}

console.log(`\n${ok} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
