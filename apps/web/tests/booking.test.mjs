// Run with: pnpm --filter @meki/web test   (Node's built-in runner; Node >= 22.18 strips TypeScript types natively)
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test, { describe } from "node:test";
import {
  IdempotencyKeeper,
  buildRequest,
  clampQuantity,
  displayTotal,
  effectiveGuests,
  hasErrors,
  isBookingReference,
  isPrintableName,
  isTrustedCheckoutUrl,
  mapSubmitError,
  newForm,
  recallBooking,
  rememberBooking,
  setQuantity,
  statusView,
  validateEmail,
  validateForm,
  validateName,
  validatePhone,
} from "../src/lib/booking.ts";
import { bookingAr, bookingEn, fill } from "../src/content/booking.ts";

const filled = (n = 1) => {
  let f = newForm();
  f = setQuantity(f, n, 10);
  f.purchaser = { fullName: "Amira Hassan", email: "amira@example.org", phone: "+1 212 555 0100" };
  f.guests = f.guests.map((g, i) => ({ ...g, fullName: `Guest ${i}`, email: `g${i}@example.org`, phone: "+1 212 555 0111", dietary: "None" }));
  f.consent = true;
  return f;
};

describe("ticket selection", () => {
  test("defaults to one ticket and clamps to 1..max from the backend", () => {
    assert.equal(newForm().quantity, 1);
    assert.equal(clampQuantity(0, 10), 1);
    assert.equal(clampQuantity(-4, 10), 1);
    assert.equal(clampQuantity(99, 10), 10);
    assert.equal(clampQuantity(Number.NaN, 10), 1);
    assert.equal(clampQuantity(3.9, 10), 3);
  });
  test("guest forms follow the quantity and keep typed data when shrinking/growing", () => {
    let f = filled(3);
    assert.equal(f.guests.length, 3);
    f = setQuantity(f, 2, 10);
    assert.equal(f.guests.length, 2);
    assert.equal(f.guests[1].fullName, "Guest 1");
    f = setQuantity(f, 4, 10);
    assert.equal(f.guests.length, 4);
    assert.equal(f.guests[0].fullName, "Guest 0");
    assert.equal(f.guests[3].fullName, "");
  });
  test("display total is exact decimal arithmetic from the API price string", () => {
    assert.equal(displayTotal("750.00", 1), "750");
    assert.equal(displayTotal("750.00", 2), "1500");
    assert.equal(displayTotal("750.00", 3), "2250");
    assert.equal(displayTotal("0.10", 3), "0.30");
    assert.equal(displayTotal("12.50", 3), "37.50");
  });
});

describe("guest validation", () => {
  test("required fields, e-mail and phone rules mirror the API", () => {
    assert.equal(validateName(""), "required");
    assert.equal(validateEmail(""), "required");
    assert.equal(validateEmail("nope"), "email");
    assert.equal(validateEmail("a@b.co"), null);
    assert.equal(validatePhone("12345"), "phone");
    assert.equal(validatePhone("abc"), "phone");
    assert.equal(validatePhone("+1 212 555 0100"), null);
    assert.equal(validatePhone("(212) 555-0100"), null);
  });
  test("valid Arabic, Latin, mixed and accented names are accepted", () => {
    for (const n of ["محمد عبد الرحمن", "أميرة Hassan السيد", "Amira Hassan El-Sayed", "Zoë O'Brien-Łukasz", "Smith III", "سارة (الابنة)".replace("(", "").replace(")", "")]) {
      assert.equal(validateName(n), null, n);
    }
  });
  test("names with unsupported scripts, emoji or control characters get a respectful, specific error", () => {
    for (const n of ["李小龍", "Alex 😀", "Evil‮name"]) assert.ok(["unsupportedName", "name"].includes(validateName(n)), n);
    assert.equal(validateName("李小龍"), "unsupportedName");
    assert.equal(isPrintableName("محمد"), true);
    assert.equal(isPrintableName("Здравствуй"), false); // Cyrillic: not covered by the ticket fonts — same rule as the API
    assert.equal(validateName("=cmd|x"), "name");
  });
  test("every guest needs a distinct e-mail; the dietary field is required (may be 'None')", () => {
    const f = filled(2);
    f.guests[1].email = f.guests[0].email.toUpperCase();
    f.purchaserAttends = false;
    const e = validateForm(f);
    assert.equal(e.guests[1].email, "duplicateEmail");
    const g = filled(1);
    g.guests[0].dietary = "";
    assert.equal(validateForm(g).guests[0].dietary, "required");
    g.guests[0].dietary = "x".repeat(501);
    assert.equal(validateForm(g).guests[0].dietary, "dietaryLong");
    assert.equal(hasErrors(validateForm(filled(3))), false);
  });
});

describe("purchaser vs attendee", () => {
  test("when the purchaser attends, guest 1 is the purchaser (isPurchaser=true) and is validated once", () => {
    const f = filled(2);
    f.purchaserAttends = true;
    const g = effectiveGuests(f);
    assert.equal(g[0].fullName, "Amira Hassan");
    assert.equal(g[0].email, "amira@example.org");
    const req = buildRequest(f, "en");
    assert.equal(req.guests[0].isPurchaser, true);
    assert.equal(req.guests[1].isPurchaser, undefined);
    f.purchaser.email = "bad";
    const e = validateForm(f);
    assert.equal(e.purchaser.email, "email");
    assert.equal(e.guests[0].email, undefined);
  });
  test("a purchaser who is not attending is independent of every guest", () => {
    const f = filled(1);
    f.purchaserAttends = false;
    const req = buildRequest(f, "ar");
    assert.equal(req.purchaser.email, "amira@example.org");
    assert.equal(req.guests[0].email, "g0@example.org");
    assert.equal(req.guests[0].isPurchaser, undefined);
    assert.equal(req.locale, "ar");
  });
});

describe("request contract and idempotency", () => {
  test("the request never carries a price, total, currency or amount", () => {
    const json = JSON.stringify(buildRequest(filled(3), "en"));
    for (const k of ["price", "total", "amount", "currency", "unitPrice"]) assert.ok(!json.toLowerCase().includes(k.toLowerCase()), k);
    const req = buildRequest(filled(3), "en");
    assert.equal(req.ticketCount, 3);
    assert.equal(req.privacyConsent, true);
    assert.deepEqual(Object.keys(req).sort(), ["guests", "locale", "privacyConsent", "purchaser", "ticketCount"]);
  });
  test("the same payload reuses its Idempotency-Key; any material change gets a new one", () => {
    let n = 0;
    const keeper = new IdempotencyKeeper(() => `key-${++n}`);
    const a = buildRequest(filled(1), "en");
    assert.equal(keeper.keyFor(a), "key-1");
    assert.equal(keeper.keyFor(buildRequest(filled(1), "en")), "key-1"); // retry after a network failure
    const f = filled(1);
    f.guests[0].dietary = "Vegetarian";
    assert.equal(keeper.keyFor(buildRequest(f, "en")), "key-2");
    assert.equal(keeper.keyFor(buildRequest(filled(2), "en")), "key-3");
  });
  test("real UUID keys satisfy the API's 16-80 char [A-Za-z0-9_-] rule", () => {
    const k = new IdempotencyKeeper().keyFor(buildRequest(filled(1), "en"));
    assert.match(k, /^[A-Za-z0-9_-]{16,80}$/);
  });
});

describe("API errors map to stable, non-leaky UI keys", () => {
  const cases = [
    [["", 0], "network"],
    [["TICKET_SALES_CLOSED", 422], "closed"],
    [["PAYMENTS_UNAVAILABLE", 503], "unavailable"],
    [["UNKNOWN", 503], "unavailable"],
    [["TOO_MANY_TICKETS", 422], "tooMany"],
    [["INSUFFICIENT_CAPACITY", 422], "capacity"],
    [["DUPLICATE_GUEST", 422], "duplicateGuest"],
    [["UNSUPPORTED_NAME_CHARACTERS", 422], "unsupportedName"],
    [["X", 429], "rateLimited"],
    [["X", 404], "notFound"],
    [["IDEMPOTENCY_KEY_REUSED", 409], "conflict"],
    [["VALIDATION_ERROR", 400], "invalid"],
    [["X", 500], "unknown"],
  ];
  for (const [[code, status], expected] of cases) test(`${code || "no response"} (${status}) → ${expected}`, () => assert.equal(mapSubmitError(code, status), expected));
  test("every key has copy in English and Arabic", () => {
    for (const [, key] of cases) {
      assert.ok(bookingEn.submitErrors[key], key);
      assert.ok(bookingAr.submitErrors[key], key);
    }
  });
});

describe("checkout redirect trust", () => {
  const env = { allowedHosts: "zeffy.com, pay.example.org", production: true, apiOrigin: "https://api.meki.example" };
  test("only https URLs on the configured hosts (or their subdomains) are followed", () => {
    assert.equal(isTrustedCheckoutUrl("https://www.zeffy.com/en-US/ticketing/x", { isTest: false }, env), true);
    assert.equal(isTrustedCheckoutUrl("https://pay.example.org/c/1", { isTest: false }, env), true);
    for (const bad of ["http://zeffy.com/x", "https://evil.com/?zeffy.com", "https://zeffy.com.evil.com/x", "https://user:pw@zeffy.com/x", "javascript:alert(1)", "//zeffy.com/x", "not a url", "", null, undefined]) {
      assert.equal(isTrustedCheckoutUrl(bad, { isTest: false }, env), false, String(bad));
    }
  });
  test("nothing is trusted when no host is configured (no hard-coded provider)", () => {
    assert.equal(isTrustedCheckoutUrl("https://zeffy.com/x", { isTest: false }, { ...env, allowedHosts: "" }), false);
  });
  test("test/mock sessions are refused in production and limited to the platform's own API origin otherwise", () => {
    assert.equal(isTrustedCheckoutUrl("https://api.meki.example/api/v1/dev/mock-checkout/s", { isTest: true }, env), false);
    const dev = { ...env, production: false };
    assert.equal(isTrustedCheckoutUrl("https://api.meki.example/api/v1/dev/mock-checkout/s", { isTest: true }, dev), true);
    assert.equal(isTrustedCheckoutUrl("https://evil.com/mock", { isTest: true }, dev), false);
  });
});

describe("booking status is derived only from verified backend data", () => {
  test("confirmed only when the API says confirmed=true", () => {
    assert.equal(statusView({ confirmed: true, message: "confirmed" }), "confirmed");
    assert.equal(statusView({ confirmed: false, message: "confirmed" }), "awaiting"); // a message alone never counts
    assert.equal(statusView({ confirmed: false, message: "processing" }), "processing");
    assert.equal(statusView({ confirmed: false, message: "awaiting_payment" }), "awaiting");
    assert.equal(statusView({ confirmed: false, message: "payment_failed" }), "failed");
    assert.equal(statusView({ confirmed: false, message: "cancelled" }), "cancelled");
    assert.equal(statusView({ confirmed: false, message: "refund_pending" }), "refundPending");
    assert.equal(statusView({ confirmed: false, message: "refunded" }), "refunded");
    assert.equal(statusView({ confirmed: false, message: "anything-else" }), "awaiting");
  });
  test("references have a fixed shape", () => {
    assert.equal(isBookingReference("EB-7K3QX9M2PA4T"), true);
    for (const bad of ["EB-short", "DN-7K3QX9M2PA4T", "../x", null, "eb-7k3qx9m2pa4t"]) assert.equal(isBookingReference(bad), false);
  });
  test("tab storage keeps the access token only — never personal data — and ignores malformed references", () => {
    const mem = new Map();
    const store = { setItem: (k, v) => mem.set(k, v), getItem: (k) => mem.get(k) ?? null };
    rememberBooking("EB-7K3QX9M2PA4T", "tok", store);
    rememberBooking("bad-ref", "tok2", store);
    assert.deepEqual([...mem.keys()], ["meki:booking:EB-7K3QX9M2PA4T"]);
    assert.deepEqual([...mem.values()], ["tok"]);
    assert.equal(recallBooking("EB-7K3QX9M2PA4T", store), "tok");
    assert.equal(recallBooking("EB-AAAAAAAAAAAA", store), null);
    assert.equal(recallBooking("bad", store), null);
  });
});

describe("localization", () => {
  const keys = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
  test("English and Arabic have identical keys and no empty strings", () => {
    assert.deepEqual(keys(bookingEn).sort(), keys(bookingAr).sort());
    const flat = (o) => Object.values(o).flatMap((v) => (typeof v === "string" ? [v] : Array.isArray(v) ? v : flat(v)));
    for (const s of flat(bookingAr)) assert.ok(s.trim().length > 0);
    assert.equal(bookingAr.steps.length, bookingEn.steps.length);
  });
  test("placeholders survive translation and fill() works", () => {
    for (const k of ["stepOf"]) assert.deepEqual(bookingAr[k].match(/\{\w+\}/g).sort(), bookingEn[k].match(/\{\w+\}/g).sort());
    assert.deepEqual(bookingAr.tickets.max.match(/\{\w+\}/g), ["{max}"]);
    assert.deepEqual(bookingAr.guests.guestTitle.match(/\{\w+\}/g), ["{n}"]);
    assert.equal(fill(bookingAr.stepOf, { n: 2, total: 3 }).includes("{"), false);
  });
  test("Arabic copy actually contains Arabic text, English copy does not", () => {
    assert.match(bookingAr.title, /[؀-ۿ]/);
    assert.match(bookingAr.unavailable.title, /[؀-ۿ]/);
    assert.doesNotMatch(bookingEn.title, /[؀-ۿ]/);
  });
  test("copy makes no tax-deductibility claim and no false payment promise", () => {
    const all = JSON.stringify(bookingEn).toLowerCase();
    assert.ok(!all.includes("tax-deductible"));
    assert.ok(!all.includes("pay now"));
    assert.ok(all.includes("not a charitable donation"));
  });
});

describe("static security guards on the booking UI source", () => {
  const files = [
    ...readdirSync(join(import.meta.dirname, "../src/components/booking")).map((f) => join(import.meta.dirname, "../src/components/booking", f)),
    join(import.meta.dirname, "../src/lib/booking.ts"),
    join(import.meta.dirname, "../src/content/booking.ts"),
  ];
  const src = files.map((f) => readFileSync(f, "utf8")).join("\n");
  test("no mock checkout, hard-coded provider URL, card fields or persistent guest storage", () => {
    assert.doesNotMatch(src, /mock-checkout|\/dev\//i);
    assert.doesNotMatch(src, /https?:\/\/[^\s"'`]*zeffy/i);
    assert.doesNotMatch(src, /cardnumber|cc-number|cvv|autocomplete="cc-/i);
    assert.doesNotMatch(src, /localStorage/);
    assert.doesNotMatch(src, /document\.cookie/);
  });
  test("redirects go only through the trust check; the booking token never goes into a URL", () => {
    const assigns = src.match(/location\.assign\([^)]*\)/g) ?? [];
    for (const a of assigns) assert.ok(/checkoutUrl|base \+ notice/.test(a), a);
    assert.doesNotMatch(src, /[?&]token=\$\{/);
    assert.doesNotMatch(src, /\.href\s*=\s*[^;]*checkoutUrl/);
  });
});
