// Phase 6E unit tests (Gala operations) — run with: pnpm --filter @meki/admin test   (Node built-in runner, native TS type stripping)
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test, { describe } from "node:test";
import {
  GALA_CODE, LABEL, PRICE, QR_TOKEN, attendance, bookingKpis, cancelGate, capacityError, createScanGuard, galaTone, labelError, lookupError, looksLikeToken, manualCheckInGate,
  maxPerBookingError, normalizeScan, pdfGate, pickGalaEvent, reasonError, regenerateGate, registeredGuests, reissueGate, resendGate, revokeGate, salesGate, ticketIssuance, ticketKpis, undoCheckInGate,
} from "../src/lib/gala.ts";
import {
  BOOKING_PAYMENT_STATUSES, BOOKING_STATUSES, BookingDetailSchema, CHECKIN_RESULTS, CheckInResponseSchema, GalaFinancialsSchema, GuestRowSchema, JOB_STATUSES, JobsPageSchema, LookupRowSchema, TICKET_STATUSES,
} from "../src/lib/gala-schemas.ts";
import { ar, en } from "../src/lib/i18n.ts";
import { NAV, isDoorStaffOnly, visibleNav } from "../src/lib/navigation.ts";

const here = import.meta.dirname;
const read = (p) => readFileSync(p, "utf8");
const api = (p) => read(join(here, "../../api/src/modules/gala", p));

describe("event resolution", () => {
  const evs = [{ id: "a", code: "EVT-T51-X" }, { id: "g", code: GALA_CODE }, { id: "b", code: "EVT-OTHER" }];
  test("the explicitly chosen event wins, then Gala Night, then a single event; otherwise none", () => {
    assert.equal(pickGalaEvent(evs, "b").id, "b");
    assert.equal(pickGalaEvent(evs, null).id, "g");
    assert.equal(pickGalaEvent(evs, "missing").id, "g");
    assert.equal(pickGalaEvent([{ id: "x", code: "EVT-X" }]).id, "x");
    assert.equal(pickGalaEvent([{ id: "x", code: "EVT-X" }, { id: "y", code: "EVT-Y" }]), null);
    assert.equal(pickGalaEvent([]), null);
  });
});

describe("KPIs never invent a figure", () => {
  test("attendance percentage only with a real denominator (issued + checked in)", () => {
    assert.deepEqual(attendance({}), { expected: 0, checkedIn: 0, remaining: 0, percent: null });
    assert.deepEqual(attendance({ ISSUED: 3, CHECKED_IN: 1, REVOKED: 5, PENDING: 2 }), { expected: 4, checkedIn: 1, remaining: 3, percent: 25 });
    assert.equal(attendance({ CHECKED_IN: 3 }).percent, 100);
  });
  test("booking and ticket KPIs from the API's grouped counts", () => {
    assert.deepEqual(bookingKpis({ CONFIRMED: 2, PENDING: 1, CANCELLED: 1, REFUND_PENDING: 1 }), { total: 5, confirmed: 2, pending: 1, cancelled: 1, refundPending: 1, refunded: 0 });
    assert.deepEqual(ticketKpis({ ISSUED: 4, CHECKED_IN: 2, PENDING: 3, REVOKED: 1, REFUNDED: 1 }), { issued: 6, pendingIssue: 3, checkedIn: 2, notCheckedIn: 4, void: 2 });
    assert.equal(registeredGuests({ ISSUED: 4, CHECKED_IN: 2, PENDING: 3, REVOKED: 1 }), 10);
  });
  test("issuance follows the booking state (tickets are issued inside the verified-payment transaction)", () => {
    assert.equal(ticketIssuance({ bookingStatus: "CONFIRMED", paymentStatus: "PAID" }), "issued");
    assert.equal(ticketIssuance({ bookingStatus: "PENDING", paymentStatus: "PENDING" }), "awaitingPayment");
    assert.equal(ticketIssuance({ bookingStatus: "REFUND_PENDING", paymentStatus: "PAID" }), "revoked");
    assert.equal(ticketIssuance({ bookingStatus: "REFUNDED", paymentStatus: "REFUNDED" }), "refunded");
  });
  test("every status has a tone and an EN + AR label", () => {
    const sets = { booking: BOOKING_STATUSES, bookingPayment: BOOKING_PAYMENT_STATUSES, ticket: TICKET_STATUSES, job: JOB_STATUSES, checkin: CHECKIN_RESULTS };
    for (const [kind, list] of Object.entries(sets)) {
      for (const s of list) {
        assert.notEqual(galaTone(kind, s), undefined);
        assert.ok(en.gala.statuses[kind][s] && ar.gala.statuses[kind][s], `${kind}.${s}`);
      }
    }
    assert.equal(galaTone("checkin", "VALID"), "ok");
    assert.equal(galaTone("checkin", "ALREADY_CHECKED_IN"), "warn");
    for (const r of ["INVALID", "REVOKED", "REFUNDED", "PAYMENT_NOT_CONFIRMED"]) assert.equal(galaTone("checkin", r), "danger");
  });
});

describe("gates mirror the backend", () => {
  const paid = { bookingStatus: "CONFIRMED", paymentStatus: "PAID" };
  test("cancel: permission, not already cancelled, no checked-in guest", () => {
    assert.equal(cancelGate({ ...paid, guests: [{ ticket: { status: "ISSUED" } }] }, true).allowed, true);
    assert.deepEqual(cancelGate({ bookingStatus: "REFUND_PENDING", guests: [{ ticket: { status: "CHECKED_IN" } }] }, false).reasons, ["permission", "alreadyCancelled", "checkedInGuests"]);
  });
  test("resend only for confirmed+paid; regenerate only when a PDF is missing (no duplicate tickets)", () => {
    assert.equal(resendGate(paid, true).allowed, true);
    assert.deepEqual(resendGate({ bookingStatus: "PENDING", paymentStatus: "UNPAID" }, true).reasons, ["notConfirmed"]);
    assert.deepEqual(regenerateGate({ ...paid, guests: [{ ticket: { status: "ISSUED", hasPdf: true } }] }, true).reasons, ["allPdfsPresent"]);
    assert.equal(regenerateGate({ ...paid, guests: [{ ticket: { status: "ISSUED", hasPdf: false } }] }, true).allowed, true);
  });
  test("tickets: pdf / revoke / re-issue", () => {
    assert.deepEqual(pdfGate({ hasPdf: false }, true).reasons, ["noPdf"]);
    assert.deepEqual(revokeGate({ status: "CHECKED_IN" }, true).reasons, ["notRevocable"]);
    assert.equal(revokeGate({ status: "ISSUED" }, true).allowed, true);
    assert.deepEqual(reissueGate({ status: "REVOKED" }, false).reasons, ["permission", "notIssued"]);
  });
  test("manual check-in / undo (gala.checkin.manage) and the sales switch (events.approve)", () => {
    assert.equal(manualCheckInGate({ status: "ISSUED", bookingConfirmed: true }, true).allowed, true);
    assert.deepEqual(manualCheckInGate({ status: "CHECKED_IN", bookingConfirmed: true }, true).reasons, ["alreadyCheckedIn"]);
    assert.deepEqual(manualCheckInGate({ status: "REVOKED", bookingConfirmed: false }, false).reasons, ["permission", "notIssued", "notConfirmed"]);
    assert.deepEqual(undoCheckInGate({ status: "ISSUED" }, true).reasons, ["notCheckedIn"]);
    assert.deepEqual(salesGate(false).reasons, ["approvePermission"]);
    for (const k of ["permission", "alreadyCancelled", "checkedInGuests", "notConfirmed", "allPdfsPresent", "noPdf", "notRevocable", "notIssued", "alreadyCheckedIn", "notCheckedIn", "approvePermission"]) assert.ok(en.gala.gate[k] && ar.gala.gate[k], k);
  });
  test("reason: 3–500 characters, like the API's ReasonDto", () => {
    assert.equal(reasonError("ok"), "reason");
    assert.equal(reasonError("  typo  "), null);
    assert.equal(reasonError("x".repeat(501)), "reason");
  });
});

describe("check-in input", () => {
  test("QR token pattern and ticket-label/price rules are the API's", () => {
    assert.equal(QR_TOKEN.source, api("gala.rules.ts").match(/QR_TOKEN_PATTERN = \/(.+)\/;/)[1]);
    assert.equal(PRICE.source, api("ticket-config.service.ts").match(/const PRICE = \/(.+)\/;/)[1]);
    assert.ok(looksLikeToken(`  mkt_${"A".repeat(43)}\n`));
    assert.equal(looksLikeToken("TK-ABC"), false);
    assert.equal(normalizeScan(" x \r\n"), "x");
    assert.equal(lookupError("ab"), "lookupShort");
    assert.equal(lookupError("Omar"), null);
  });
  test("scan guard: one request at a time and no repeat of the same code within the window", () => {
    const g = createScanGuard(2500);
    assert.equal(g.tryStart("A", 0), true);
    assert.equal(g.tryStart("B", 10), false); // busy
    g.done();
    assert.equal(g.tryStart("A", 100), false); // same code again too soon (camera sees it every frame)
    assert.equal(g.tryStart("B", 200), true);
    g.done();
    assert.equal(g.tryStart("A", 3000), true); // later rescans are sent — the server answers ALREADY_CHECKED_IN
  });
  test("settings validation", () => {
    assert.equal(labelError("Every Light Counts"), null);
    assert.equal(labelError("ليلة"), "latin");
    assert.equal(labelError(" "), "required");
    assert.ok(LABEL.test("Café 583 Park Avenue"));
    assert.equal(capacityError(""), null);
    assert.equal(capacityError("0"), "capacity");
    assert.equal(maxPerBookingError("51"), "maxPerBooking");
    assert.ok(PRICE.test("750") && PRICE.test("750.00") && !PRICE.test("750.001") && !PRICE.test("0"));
  });
});

describe("schemas", () => {
  const job = { id: "j", type: "EMAIL", template: "ticket.delivery", status: "SKIPPED", attempts: 1, nextRunAt: "2026-11-18T00:00:00Z", lastError: null, completedAt: null };
  test("financials: EVENT_TICKET_PAYMENT only, no tax-deductible value accepted", () => {
    const f = { classification: "EVENT_TICKET_PAYMENT", currency: "USD", grossCaptured: "1500.00", refunded: "0.00", net: "1500.00", capturedPayments: 1, refundPayments: 0, bookingsByStatus: {}, ticketsByStatus: {}, includesTestRecords: false, taxTreatment: { taxDeductibleAmount: null, fairMarketValueProvided: false, note: "n" } };
    assert.ok(GalaFinancialsSchema.safeParse(f).success);
    assert.equal(GalaFinancialsSchema.safeParse({ ...f, classification: "CHARITABLE_DONATION" }).success, false);
    assert.equal(GalaFinancialsSchema.safeParse({ ...f, taxTreatment: { ...f.taxTreatment, taxDeductibleAmount: "100.00" } }).success, false);
    assert.equal(GalaFinancialsSchema.safeParse({ ...f, grossCaptured: 1500 }).success, false); // money stays a decimal string
  });
  test("check-in results are the backend's set; lookup and guest rows carry no token", () => {
    assert.deepEqual([...CHECKIN_RESULTS], api("gala.rules.ts").match(/export type CheckInResult = ([^;]+);/)[1].match(/'(\w+)'/g).map((s) => s.slice(1, -1)));
    assert.equal(CheckInResponseSchema.safeParse({ result: "VALID", ticket: { ticketNumber: "TK-1", guestName: "A", bookingReference: "EB-1", status: "CHECKED_IN", checkedInAt: null } }).success, true);
    assert.equal(CheckInResponseSchema.safeParse({ result: "OK" }).success, false);
    assert.deepEqual(Object.keys(LookupRowSchema.shape).sort(), ["bookingConfirmed", "checkedInAt", "guestName", "status", "ticketId", "ticketNumber"]);
    for (const s of [LookupRowSchema, GuestRowSchema]) assert.ok(!Object.keys(s.shape).some((k) => /token|hash/i.test(k)));
  });
  test("booking detail and jobs page", () => {
    assert.equal(BookingDetailSchema.safeParse({}).success, false);
    assert.ok(JobsPageSchema.safeParse({ items: [], meta: { page: 1, pageSize: 25, total: 0, totalPages: 1 }, summary: {}, transport: { name: "none", delivers: false } }).success);
    assert.ok(JobsPageSchema.shape.items.element.safeParse({ ...job, createdAt: "x", updatedAt: "x", ticketId: null, ticketNumber: null, booking: { id: "b", publicReference: "EB-1", bookingStatus: "CONFIRMED", paymentStatus: "PAID", isTest: false } }).success);
  });
});

describe("permissions, routes, localization and static guards", () => {
  const keys = (u) => visibleNav(u).flatMap((g) => g.items.map((i) => i.key));
  const user = (...permissions) => ({ permissions, isSuperAdmin: false });
  const gala = ["galaOverview", "bookings", "guests", "tickets", "checkin", "galaExports", "galaComms", "galaSettings"];
  test("least privilege in the navigation (the API enforces the same permissions)", () => {
    assert.deepEqual(keys(user("gala.checkin.validate")), ["dashboard", "checkin"]);
    assert.ok(isDoorStaffOnly(user("gala.checkin.validate")));
    // finance role: gala.bookings.read + gala.guests.read + gala.tickets.read (no export, no check-in)
    assert.deepEqual(keys(user("gala.bookings.read", "gala.guests.read", "gala.tickets.read")).filter((k) => gala.includes(k)), ["galaOverview", "bookings", "guests", "tickets", "galaComms", "galaSettings"]);
    // content / campaign managers hold events.read only → no booking, guest or financial page
    assert.deepEqual(keys(user("events.read", "content.read", "campaigns.read")).filter((k) => gala.includes(k)), []);
  });
  test("every Gala route has a page file", () => {
    for (const r of ["gala", "gala/bookings", "gala/bookings/[id]", "gala/guests", "gala/tickets", "gala/check-in", "gala/check-in/history", "gala/exports", "gala/communications", "gala/settings"]) {
      assert.ok(existsSync(join(here, "../src/app/[locale]/(dashboard)", r, "page.tsx")), r);
    }
    for (const i of NAV.flatMap((g) => g.items).filter((x) => x.href)) assert.ok(existsSync(join(here, "../src/app/[locale]/(dashboard)", i.href, "page.tsx")), i.key);
  });
  const deepKeys = (o, p = []) => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? deepKeys(v, [...p, k]) : [[...p, k]]));
  const get = (o, path) => path.reduce((a, k) => a?.[k], o);
  test("every Gala string exists in Arabic with the same placeholders", () => {
    for (const k of deepKeys(en.gala)) {
      const a = get(ar.gala, k);
      assert.ok(typeof a === "string" && a.trim(), k.join("."));
      const ph = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      assert.equal(ph(a), ph(get(en.gala, k)), k.join("."));
    }
    for (const k of gala) assert.ok(en.nav.items[k] && ar.nav.items[k], k);
  });
  const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
  const root = join(here, "../src");
  const files = [...walk(join(root, "features/gala")), join(root, "services/gala.ts"), join(root, "hooks/useGalaData.ts"), join(root, "lib/gala.ts"), join(root, "lib/gala-schemas.ts")];
  test("no fake data, no network outside lib/api.ts, no browser storage", () => {
    for (const f of files) {
      const s = read(f);
      assert.doesNotMatch(s, /mockData|fakeData|lorem|Math\.random/i, f);
      assert.doesNotMatch(s, /\bfetch\(|new XMLHttpRequest/, f);
      assert.doesNotMatch(s, /localStorage|sessionStorage|document\.cookie/, f);
    }
  });
  test("financial separation: Gala screens never read donation reports nor add ticket money to donations", () => {
    for (const f of files) {
      const s = read(f);
      assert.doesNotMatch(s, /reports\/donations|services\/finance|services\/dashboard|addMoney|subMoney/, f);
    }
    assert.match(read(join(root, "lib/gala-schemas.ts")), /classification: z\.literal\("EVENT_TICKET_PAYMENT"\)/);
  });
  test("Gala gate reasons use the Gala texts (never the content-module notice that would print raw keys)", () => {
    for (const f of files) assert.doesNotMatch(read(f), /ContentGateNotice/, f);
  });
  test("the QR secret is never rendered; the camera is always released", () => {
    const page = read(join(root, "features/gala/checkin/CheckInPage.tsx"));
    assert.match(page, /type="password"/);
    assert.doesNotMatch(page, /\{token\}|value=\{token/);
    const scanner = read(join(root, "features/gala/checkin/QRScanner.tsx"));
    assert.match(scanner, /getTracks\(\)\.forEach\(\(tr\) => tr\.stop\(\)\)/);
    assert.match(scanner, /useEffect\(\(\) => stop, \[stop\]\)/);
    assert.doesNotMatch(scanner, /rawValue\}|>\{code/);
  });
  test("every Gala mutation goes through a confirmation (ConfirmDialog / ReasonDialog) or an explicit save", () => {
    for (const f of walk(join(root, "features/gala"))) {
      const s = read(f);
      if (/\.mutate\(/.test(s) && !/checkin\/CheckInPage/.test(f.replace(/\\/g, "/"))) assert.match(s, /ConfirmDialog|ReasonDialog|SaveBar|Modal/, f);
    }
    // opening sales needs typing OPEN
    assert.match(read(join(root, "features/gala/settings/GalaSettingsPage.tsx")), /confirmDisabled=\{opening && typed !== "OPEN"\}/);
  });
});
