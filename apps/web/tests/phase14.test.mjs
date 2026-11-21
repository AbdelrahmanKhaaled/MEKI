// Phase 14 — hosted giving on the public website (docs/59–62). Run: pnpm --filter @meki/web test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test, { describe } from "node:test";
import { buildIntentRequest, IntentKeeper, intentTypeFor, mapIntentError, newGivingForm, normaliseAmount, preselect, stageIndex, validateDetails, validateGift, DONATION_REFERENCE } from "../src/lib/giving.ts";
import { givingAr, givingEn } from "../src/content/giving.ts";

const src = (p) => readFileSync(join(import.meta.dirname, "../src", p), "utf8");
const limits = { min: "1.00", max: "100000.00" };

describe("intent building", () => {
  test("three flows map to three intent types; a programme gift never names an event and a Gala gift never names a programme", () => {
    assert.equal(intentTypeFor("general", ""), "GENERAL_DONATION");
    assert.equal(intentTypeFor("general", "health"), "PROGRAM_DONATION");
    assert.equal(intentTypeFor("gala", "health"), "GALA_DONATION");
    const f = { ...newGivingForm("health"), classification: "SADAQAH", amount: "1,250.50", fullName: "  Amina   Hassan ", email: " a@example.org " };
    const p = buildIntentRequest("general", f, "ar");
    assert.deepEqual(p, { intentType: "PROGRAM_DONATION", programmeSlug: "health", amount: "1250.50", currency: "USD", classification: "SADAQAH", donor: { fullName: "Amina Hassan", email: "a@example.org" }, acceptTerms: true, locale: "ar" });
    const g = buildIntentRequest("gala", f, "en");
    assert.equal(g.intentType, "GALA_DONATION");
    assert.equal(g.eventSlug, "gala-night");
    assert.ok(!("programmeSlug" in g));
    assert.ok(!("eventSlug" in buildIntentRequest("general", { ...f, destination: "" }, "en")));
  });

  test("programme preselection accepts only a published slug", () => {
    assert.equal(preselect("health", ["health", "wash"]), "health");
    assert.equal(preselect(["wash"], ["health", "wash"]), "wash");
    assert.equal(preselect("unknown", ["health"]), "");
    assert.equal(preselect("../x", ["../x"]), "");
    assert.equal(preselect(undefined, ["health"]), "");
  });

  test("validation: Zakat refused where the server says it is unavailable; amounts in USD with limits; Arabic digits accepted", () => {
    const base = { ...newGivingForm(), amount: "50" };
    assert.deepEqual(validateGift({ ...base, classification: "ZAKAT" }, limits, false), { classification: "zakatUnavailable" });
    assert.deepEqual(validateGift({ ...base, classification: "ZAKAT" }, limits, true), {});
    assert.deepEqual(validateGift({ ...base, classification: "" }, limits, true), { classification: "required" });
    assert.equal(validateGift({ ...base, classification: "SADAQAH", amount: "0.50" }, limits, true).amount, "amountMin");
    assert.equal(validateGift({ ...base, classification: "SADAQAH", amount: "12.345" }, limits, true).amount, "amountInvalid");
    assert.equal(normaliseAmount("١٠٠"), "100");
    assert.equal(normaliseAmount("-5"), null);
    assert.deepEqual(validateDetails({ ...base, fullName: "A", email: "nope" }), { fullName: "required", email: "email" });
  });

  test("retries of the same payload reuse the Idempotency-Key; a changed payload gets a new one (no duplicate references)", () => {
    let n = 0;
    const k = new IntentKeeper(() => `key-${++n}`);
    const req = buildIntentRequest("general", { ...newGivingForm(), classification: "SADAQAH", amount: "5", fullName: "A B", email: "a@b.co" }, "en");
    assert.equal(k.keyFor(req), k.keyFor({ ...req }));
    assert.notEqual(k.keyFor(req), k.keyFor({ ...req, amount: "6" }));
  });

  test("error mapping and donor stages: review / not-completed are never displayed as verified", () => {
    assert.equal(mapIntentError("GIVING_CHANNEL_DISABLED", 409), "closed");
    assert.equal(mapIntentError("ZAKAT_NOT_ALLOWED", 422), "zakat");
    assert.equal(mapIntentError("AMOUNT_BELOW_MINIMUM", 422), "amount");
    assert.equal(mapIntentError("X", 0), "network");
    assert.equal(stageIndex("PENDING_EXTERNAL"), 1);
    assert.equal(stageIndex("NEEDS_REVIEW"), 1);
    assert.equal(stageIndex("NOT_COMPLETED"), 1);
    assert.equal(stageIndex("VERIFIED"), 2);
    assert.equal(stageIndex("ALLOCATED"), 3);
    assert.ok(DONATION_REFERENCE.test("DN-7K3QX9M2PA4T") && !DONATION_REFERENCE.test("EB-7K3QX9M2PA4T"));
  });
});

describe("components", () => {
  const form = src("components/giving/GivingForm.tsx");
  const status = src("components/giving/IntentStatus.tsx");
  const donate = src("components/programme/ProgrammeDonate.tsx");
  const galaPage = src("app/[locale]/events/gala-night/page.tsx");
  const givePage = src("app/[locale]/give/page.tsx");

  test("a closed channel is a preview: no submit path, no contact step, nothing posted", () => {
    assert.match(form, /const preview = !available;/);
    assert.match(form, /if \(preview \|\| lock\.current\) return;/);
    assert.match(form, /setStep\(preview \? 2 : 1\)/); // the contact step is skipped in a preview
    assert.match(form, /\{step === 1 && !preview && \(/);
    assert.match(form, /data-testid="giving-closed"/);
  });

  test("availability, Zakat and the form URL come only from the API; the reference is never pre-filled", () => {
    assert.match(form, /available = props\.gala\.available;/);
    assert.match(form, /const route = resolveRoute\(props\.options, form\.destination, form\.acceptGala/);
    assert.match(form, /available = route\.available;/);
    assert.match(form, /const disabled = k === "ZAKAT" && !zakat\.allowed;/);
    assert.match(form, /isTrustedHostedFormUrl\(created\.handoff\.formUrl\)/);
    assert.match(form, /c\.reference\.noPrefill/);
    assert.doesNotMatch(form, /\?(?:reference|ref|meki)=/i);
  });

  test("the donor token stays in this tab (never in a URL); the status page never confirms a payment", () => {
    assert.match(form, /rememberGift\(r\.reference, r\.accessToken\)/);
    assert.match(form, /href=\{`\/\$\{locale\}\/give\/status\/\$\{created\.reference\}`\}/);
    assert.match(status, /clientApi<PublicDonationIntentStatus>\(`\/public\/donation-intents\/\$\{reference\}\/status\?locale=\$\{locale\}`, \{ token \}\)/);
    assert.doesNotMatch(status, /method: "POST"/);
    assert.match(status, /s\.verifying/);
  });

  test("programme page: hosted giving goes through the MEKI intent flow (reference first), never a direct Zeffy link", () => {
    const hosted = donate.slice(donate.indexOf("{hostedUrl ? ("), donate.indexOf(") : (", donate.indexOf("{hostedUrl ? (")));
    assert.match(hosted, /href=\{`\/\$\{locale\}\/give\?programme=\$\{encodeURIComponent\(slug\)\}#prepare`\}/);
    assert.doesNotMatch(hosted, /href=\{hostedUrl\}|target="_blank"/);
    const closed = donate.slice(donate.indexOf("function ProgrammeGivingClosed"), donate.indexOf("function ProgrammeDonateForm"));
    assert.match(closed, /programme-intent-preview/);
    assert.doesNotMatch(closed, /type="submit"|<button|target="_blank"/);
  });

  test("Gala page: every donation passes through the MEKI reference journey, with a preview while disabled", () => {
    assert.match(galaPage, /const intentHref = `\/\$\{locale\}\/events\/gala-night\/donate`;/);
    assert.match(galaPage, /href: intentHref, internal: true/);
    assert.doesNotMatch(galaPage, /href: giveUrl/);
    assert.match(givePage, /fetchPublicContent<PublicGivingOptions>\(`\/public\/giving\/options\?locale=\$\{locale\}`\)/);
  });

  test("new transactional pages are never indexed", () => {
    for (const p of ["app/[locale]/events/gala-night/donate/page.tsx", "app/[locale]/give/status/[reference]/page.tsx"]) {
      assert.match(src(p), /robots: \{ index: false, follow: false \}/);
      assert.match(src(p), /dynamic = "force-dynamic"/);
    }
  });
});

describe("copy", () => {
  test("EN/AR parity (no empty strings); Zakat copy makes no religious ruling", () => {
    const walk = (a, b, path) => {
      for (const k of Object.keys(a)) {
        assert.ok(k in b, `${path}.${k} missing in Arabic`);
        if (typeof a[k] === "string") assert.ok(a[k].trim() && b[k].trim(), `${path}.${k} empty`);
        else walk(a[k], b[k], `${path}.${k}`);
      }
    };
    walk(givingEn, givingAr, "giving");
    assert.match(givingEn.form.zakat.text, /ask your scholar/);
    assert.doesNotMatch(JSON.stringify(givingEn), /is Zakat-eligible|qualifies for Zakat|guaranteed/i);
    assert.match(givingEn.reference.receipts, /MEKI does not issue tax receipts/);
    assert.match(givingEn.status.verifying, /being verified/);
    assert.match(givingEn.gala.intro, /not admission/);
  });
});
