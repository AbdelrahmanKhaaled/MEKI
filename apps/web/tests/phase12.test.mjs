// Phase 12 — SDI / Zeffy hosted forms (docs/47). Run: pnpm --filter @meki/web test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { buildHostedRequest, isTrustedHostedFormUrl, mapSubmitError, newHostedForm, statusView, validateHostedForm } from "../src/lib/booking.ts";
import { bookingAr, bookingEn } from "../src/content/booking.ts";

const src = (p) => readFileSync(join(import.meta.dirname, "../src", p), "utf8");
const hostedFlow = src("components/booking/HostedBookingFlow.tsx");
const flow = src("components/booking/BookingFlow.tsx");
const status = src("components/booking/BookingStatus.tsx");
const gala = src("app/[locale]/events/gala-night/page.tsx");
const donate = src("components/programme/ProgrammeDonate.tsx");
const programmePage = src("app/[locale]/programs/[slug]/page.tsx");

test("hosted form links: only https givebutter.com / zeffy.com URLs returned by the API are ever shown", () => {
  assert.equal(isTrustedHostedFormUrl("https://givebutter.com/c/SDI-Misr-El-Kheir"), true);
  assert.equal(isTrustedHostedFormUrl("https://www.givebutter.com/c/SDI-Misr-El-Kheir"), true);
  assert.equal(isTrustedHostedFormUrl("https://www.zeffy.com/en-US/donation-form/misr-el-kheir-foundation-gala-new-york-donation"), true);
  assert.equal(isTrustedHostedFormUrl("https://zeffy.com/x"), true);
  for (const bad of ["http://givebutter.com/x", "http://www.zeffy.com/x", "https://givebutter.com.evil.example/x", "https://zeffy.com.evil.example/x", "https://evilgivebutter.com/x", "https://evilzeffy.com/x", "https://user:pw@givebutter.com/x", "https://user:pw@www.zeffy.com/x", "javascript:alert(1)", "", null, undefined, "/relative"]) {
    assert.equal(isTrustedHostedFormUrl(bad), false, String(bad));
  }
});

test("hosted request is reference-only: no price, no guest list, no phone, no card data", () => {
  const req = buildHostedRequest({ ...newHostedForm(), quantity: 3, fullName: "  Amira   Hassan ", email: " a@example.org ", consent: true }, "ar");
  assert.deepEqual(req, { purchaser: { fullName: "Amira Hassan", email: "a@example.org" }, ticketCount: 3, locale: "ar", privacyConsent: true });
  assert.deepEqual(validateHostedForm({ ...newHostedForm(), fullName: "", email: "nope" }), { fullName: "required", email: "email" });
  assert.equal(mapSubmitError("HOSTED_BOOKING_DISABLED", 422), "closed");
});

test("the reference is never pre-filled into SDI's form and a redirect never confirms a booking", () => {
  // the form URL is used verbatim from the API: no query string with the reference is ever built
  assert.doesNotMatch(hostedFlow, /formUrl\s*\+|\?ref=|searchParams\.set|reference\)\s*}`/);
  assert.match(hostedFlow, /isTrustedHostedFormUrl\(created\.hosted\.formUrl\)/);
  assert.match(hostedFlow, /navigator\.clipboard\.writeText\(created\.reference\)/);
  assert.match(hostedFlow, /rel="noopener noreferrer"/);
  // status is derived from the API's confirmed flag only
  assert.equal(statusView({ confirmed: false, message: "awaiting_sdi_report" }), "awaiting");
  assert.equal(statusView({ confirmed: true, message: "confirmed_by_sdi" }), "confirmed");
});

test("hosted mode never reaches MEKI checkout; Zeffy-owned bookings show no MEKI tickets, PDFs or pay button", () => {
  assert.doesNotMatch(hostedFlow, /\/checkout/);
  assert.match(flow, /t\.mode === "zeffy_hosted"/);
  assert.match(flow, /t\.hosted\?\.available \? \{ kind: "hosted"/);
  assert.match(status, /const zeffy = data\.ticketIssuer === "ZEFFY";/);
  assert.match(status, /\{!zeffy && \(view === "awaiting" \|\| view === "failed"\)/);
  assert.match(status, /\{!zeffy && view === "confirmed"/);
  assert.match(gala, /hostedMode \? !!ticketing\.hosted\?\.available : ticketing\.checkoutAvailable/);
});

test("programme giving: SDI form only when the API returns an approved URL; programme code shown; otherwise the existing no-payment preview", () => {
  assert.match(programmePage, /fetchPublicContent<PublicHostedForms>\("\/public\/hosted-forms"\)/);
  assert.match(donate, /hosted\?\.available && isTrustedHostedFormUrl\(hosted\.url\) \? hosted\.url : null/);
  assert.match(donate, /p\.donate\.code/);
});

test("EN/AR copy parity for the hosted flow and SDI status (no empty strings)", () => {
  const walk = (a, b, path) => {
    for (const k of Object.keys(a)) {
      assert.ok(k in b, `${path}.${k} missing in Arabic`);
      if (typeof a[k] === "string") assert.ok(a[k].trim() && b[k].trim(), `${path}.${k} empty`);
      else walk(a[k], b[k], `${path}.${k}`);
    }
  };
  walk(bookingEn.hosted, bookingAr.hosted, "hosted");
  walk(bookingEn.status.sdi, bookingAr.status.sdi, "status.sdi");
  assert.equal(bookingEn.hosted.instructions.length, bookingAr.hosted.instructions.length);
  assert.ok(bookingEn.hosted.instructions.some((l) => l.includes("{question}")));
  assert.ok(bookingAr.hosted.instructions.some((l) => l.includes("{question}")));
});
