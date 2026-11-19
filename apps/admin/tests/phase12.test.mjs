// Phase 12 — SDI report reconciliation + Zeffy-owned bookings in the admin (docs/47, docs/48). Run: pnpm --filter @meki/admin test
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test, { describe } from "node:test";
import { ar, en } from "../src/lib/i18n.ts";
import { visibleNav } from "../src/lib/navigation.ts";
import { BookingDetailSchema } from "../src/lib/gala-schemas.ts";
import { AttendeeListSchema, ReportImportSchema, ReportRowSchema, ROW_STATUSES, SdiStatusSchema } from "../src/lib/sdi-schemas.ts";
import { attendeeBody, canApprove, parseStatusMap, reconBody, reconFromSaved, reconProblems, suggestRecon, uploadProblem } from "../src/lib/sdi.ts";

const here = import.meta.dirname;
const read = (p) => readFileSync(join(here, "../src", p), "utf8");
const keys = (...permissions) => visibleNav({ permissions, isSuperAdmin: false }).flatMap((g) => g.items.map((i) => i.key));

describe("navigation and permissions", () => {
  test("reconciliation needs sdi.reports.upload; attendee list needs gala.guests.read; door staff see neither", () => {
    assert.ok(keys("sdi.reports.upload").includes("sdiReconciliation"));
    assert.ok(!keys("payments.read", "donations.read").includes("sdiReconciliation"));
    assert.ok(keys("gala.guests.read").includes("sdiAttendees"));
    const door = keys("gala.checkin.validate");
    assert.ok(!door.includes("sdiReconciliation") && !door.includes("sdiAttendees"));
    for (const p of ["payments/sdi-reconciliation/page.tsx", "payments/sdi-reconciliation/[id]/page.tsx", "gala/sdi-attendees/page.tsx"]) assert.ok(existsSync(join(here, "../src/app/[locale]/(dashboard)", p)), p);
  });
});

describe("column mapping helpers (no invented schema)", () => {
  test("suggestions are header matches only; nothing is guessed when headers do not match", () => {
    const s = suggestRecon(["Order ID", "MEKI Booking Reference", "Amount", "Status", "Date"]);
    assert.equal(s.orderId, "Order ID");
    assert.equal(s.bookingReference, "MEKI Booking Reference");
    assert.equal(s.quantity, "");
    const none = suggestRecon(["Col A", "Col B"]);
    assert.deepEqual([none.orderId, none.amount, none.status, none.date], ["", "", "", ""]);
    assert.deepEqual(reconProblems(none).filter((p) => p.startsWith("missing:")).sort(), ["missing:amount", "missing:date", "missing:orderId", "missing:status"]);
  });
  test("status map lines must be 'value = KNOWN_STATUS'; bad lines are reported, never coerced", () => {
    const { map, badLines } = parseStatusMap("Succeeded = COMPLETED\nrefunded=REFUNDED\nweird = PAID\n\nnope");
    assert.deepEqual(map, { succeeded: "COMPLETED", refunded: "REFUNDED" });
    assert.deepEqual(badLines, [3, 5]);
  });
  test("body omits unmapped columns; the same column cannot be used twice; saved mappings never point at absent headers", () => {
    const f = { ...suggestRecon(["Order", "Amount", "Status", "Date"]), dateFormat: "MDY", donationTicketTypes: " Donation , Gift " };
    const b = reconBody(f);
    assert.equal(b.bookingReference, undefined);
    assert.deepEqual(b.donationTicketTypes, ["Donation", "Gift"]);
    assert.equal(b.dateFormat, "MDY");
    assert.ok(reconProblems({ ...f, amount: "Order" }).includes("duplicateColumn"));
    const restored = reconFromSaved({ orderId: "Gone", amount: "Amount", statusMap: { paid: "COMPLETED" } }, ["Amount"]);
    assert.equal(restored.orderId, "");
    assert.equal(restored.statusMap, "paid = COMPLETED");
    assert.deepEqual(attendeeBody({ guestName: "Name", ticketType: "", tableLabel: "Table", orderId: "", bookingReference: "", answers: ["Diet"] }), { answers: ["Diet"], guestName: "Name", tableLabel: "Table" });
  });
  test("upload pre-check: .csv/.xlsx only, 1 B – 5 MB", () => {
    assert.equal(uploadProblem(null), "none");
    assert.equal(uploadProblem({ name: "report.pdf", size: 10 }), "type");
    assert.equal(uploadProblem({ name: "report.CSV", size: 0 }), "size");
    assert.equal(uploadProblem({ name: "r.xlsx", size: 5 * 1024 * 1024 + 1 }), "size");
    assert.equal(uploadProblem({ name: "r.xlsx", size: 2048 }), null);
  });
  test("four-eyes in the UI: the uploader cannot approve; only PREVIEWED reports; permission required", () => {
    assert.equal(canApprove({ status: "PREVIEWED", uploadedById: "u1" }, "u2", true), true);
    assert.equal(canApprove({ status: "PREVIEWED", uploadedById: "u1" }, "u1", true), false);
    assert.equal(canApprove({ status: "UPLOADED", uploadedById: "u1" }, "u2", true), false);
    assert.equal(canApprove({ status: "PREVIEWED", uploadedById: "u1" }, "u2", false), false);
    assert.equal(canApprove({ status: "PREVIEWED", uploadedById: "u1" }, undefined, true), false);
  });
});

describe("contract (zod) — shapes returned by the Phase 12 API", () => {
  test("status exposes booleans and counts only (no URLs or secrets)", () => {
    const s = SdiStatusSchema.parse({ mode: "zeffy_hosted", galaHostedSalesEnabled: false, galaFormConfigured: true, generalGivingEnabled: false, programmeGivingEnabled: false, programmeDesignationConfirmed: false, applyEnabled: false, zeffyApiConfigured: false, lastAppliedReport: null, importsAwaitingAction: 0, rowsRequiringReview: 2, missingBusinessDays: ["2026-11-17"] });
    assert.equal(JSON.stringify(s).includes("http"), false);
  });
  test("import, rows, attendees and booking detail (Zeffy-owned) parse", () => {
    const imp = { id: "sdi1", source: "SDI", kind: "RECONCILIATION", status: "PREVIEWED", fileName: "SYNTHETIC.csv", fileSha256: "a".repeat(64), fileSize: 10, fileType: "csv", headers: ["A"], mapping: null, mappingProfileId: null, isSynthetic: true, periodFrom: null, periodTo: null, rowCount: 1, acceptedCount: 1, rejectedCount: 0, summary: { MATCHED: 1 }, supersedesId: null, uploadedById: "u1", uploadedAt: "2026-11-19T00:00:00Z", previewedAt: null, approvedById: null, appliedAt: null, rejectedById: null, rejectedAt: null, rejectReason: null, notes: null };
    assert.equal(ReportImportSchema.parse({ ...imp, storageKey: "x" }).storageKey, undefined); // never surfaced
    ReportRowSchema.parse({ id: "r", rowNumber: 2, sourceOrderId: "O", bookingReferenceRaw: "eb-1", bookingReference: null, ticketType: null, lineKind: "TICKET", quantity: 1, amount: "750.00", refundedAmount: "0.00", currency: "USD", statusRaw: "succeeded", status: "COMPLETED", occurredAt: null, matchStatus: "INVALID_REFERENCE", matchNote: "x", applied: false, booking: null });
    AttendeeListSchema.parse({ import: null, items: [], meta: { page: 1, pageSize: 50, total: 0, totalPages: 1 } });
    assert.equal(ROW_STATUSES.length, 11);
  });
  test("booking detail tolerates pre-Phase-12 responses (issuer defaults to MEKI) and reads SDI orders", () => {
    const base = { id: "b", publicReference: "EB-ABCDEFGHJKMN", eventId: "e", purchaserName: "A", purchaserEmail: "a@example.org", purchaserPhone: "", guestCount: 1, unitPrice: "750.00", totalAmount: "750.00", currency: "USD", classification: "EVENT_TICKET_PAYMENT", bookingStatus: "PENDING", paymentStatus: "UNPAID", paymentProvider: null, providerReference: null, refundedAmount: "0.00", isTest: true, locale: "en", paidAt: null, cancelledAt: null, cancelReason: null, createdAt: "2026-11-19T00:00:00Z", updatedAt: "2026-11-19T00:00:00Z", guests: [], attempts: [], transactions: [], jobs: [] };
    assert.equal(BookingDetailSchema.parse(base).ticketIssuer, "MEKI");
    const z = BookingDetailSchema.parse({ ...base, ticketIssuer: "ZEFFY", reportedTicketCount: 2, sdi: { orders: [{ orderId: "O1", status: "COMPLETED", amount: "1500.00", refundedAmount: "0.00", currency: "USD", matchStatus: "CONFIRMED", linked: true, reportedAt: "2026-11-19T00:00:00Z" }], reportRows: [] } });
    assert.equal(z.sdi.orders[0].linked, true);
  });
});

describe("static guards", () => {
  const detail = read("features/gala/bookings/BookingDetailPage.tsx");
  const reportPage = read("features/finance/sdi/SdiReportDetailPage.tsx");
  const attendees = read("features/finance/sdi/SdiAttendeesPage.tsx");
  test("Zeffy-owned bookings: no resend / regenerate / PDF / guest-ticket actions are rendered", () => {
    assert.match(detail, /const zeffy = b\.ticketIssuer === "ZEFFY";/);
    assert.match(detail, /\{!zeffy && <button[^\n]*setDialog\("resend"\)/);
    assert.match(detail, /\{!zeffy && <button[^\n]*setDialog\("regenerate"\)/);
    assert.match(detail, /\{!zeffy && \(\n\s*<Card labelledBy="bd-g">/); // the MEKI guest/ticket/PDF card
  });
  test("no unrestricted 'mark as paid': the only way to change a booking is an approved report (apply needs approver + not uploader)", () => {
    for (const src of [detail, reportPage, read("features/finance/sdi/SdiReportsPage.tsx")]) assert.doesNotMatch(src, /mark ?as ?paid|markPaid|confirmBooking\(/i);
    assert.match(reportPage, /const mayApply = canApprove\(imp, user\?\.id, approver\);/);
    assert.match(reportPage, /disabled=\{!mayApply\}/);
  });
  test("synthetic fixtures are always labelled; attendee list is read-only with no export or ticket actions", () => {
    assert.match(reportPage, /\{imp\.isSynthetic && <SyntheticBadge \/>\}/);
    assert.doesNotMatch(attendees, /apiDownload|exportReport|QrCode|checkIn|useMutation/);
  });
  test("EN/AR parity for the SDI dictionary, no empty strings", () => {
    const walk = (a, b, path) => {
      for (const k of Object.keys(a)) {
        assert.ok(k in b, `${path}.${k} missing in Arabic`);
        if (typeof a[k] === "string") assert.ok(a[k].trim() && b[k].trim(), `${path}.${k} empty`);
        else walk(a[k], b[k], `${path}.${k}`);
      }
    };
    walk(en.sdi, ar.sdi, "sdi");
    for (const s of ROW_STATUSES) assert.ok(en.sdi.rowStatuses[s] && ar.sdi.rowStatuses[s], s);
    assert.ok(en.nav.items.sdiReconciliation && ar.nav.items.sdiReconciliation && en.nav.items.sdiAttendees && ar.nav.items.sdiAttendees);
  });
});
