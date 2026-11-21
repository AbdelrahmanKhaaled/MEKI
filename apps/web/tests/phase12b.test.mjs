// Phase 12B — SDI agreement alignment on the public site (docs/50). Run: pnpm --filter @meki/web test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { galaAr, galaEn } from "../src/content/gala.ts";
import { getPages } from "../src/content/pages.ts";

const src = (p) => readFileSync(join(import.meta.dirname, "../src", p), "utf8");
const donate = src("components/programme/ProgrammeDonate.tsx");
const galaPage = src("app/[locale]/events/gala-night/page.tsx");
const sections = src("components/gala/GalaSections.tsx");
const give = src("app/[locale]/give/page.tsx");

test("programme pages: informational state unless programme-restricted giving is authorized by the API", () => {
  assert.match(donate, /const programmeAuthorized = !!hostedUrl \|\| \(!!config\?\.paymentsEnabled && config\.designations\.includes\("PROGRAMME"\)\);/);
  assert.match(donate, /if \(!programmeAuthorized\) return <ProgrammeGivingClosed/);
  const closed = donate.slice(donate.indexOf("function ProgrammeGivingClosed"), donate.indexOf("function ProgrammeDonateForm"));
  // no amounts, no submit/payment button, no external payment link in the closed state
  assert.doesNotMatch(closed, /type="submit"|<button|amounts|open\(|target="_blank"/);
  assert.match(closed, /events\/gala-night/); // information link only
});

test("Gala page: project named, SDI donation form linked and refund wording shown only when the API approves each", () => {
  assert.match(galaPage, /fetchPublicContent<PublicEventFundraising>\(`\/public\/events\/gala-night\/fundraising\?locale=\$\{locale\}`\)/);
  assert.match(galaPage, /const giveUrl = fr\?\.giving\.available && isTrustedHostedFormUrl\(fr\.giving\.formUrl\) \? fr\.giving\.formUrl : null;/);
  assert.match(galaPage, /fr\?\.project\?\.name \?/);
  assert.match(galaPage, /fr\?\.donationRefundNotice === "NON_REFUNDABLE" \? \[base\.faq\.donationRefund\] : \[\]/);
  assert.match(galaPage, /fr\?\.ticketRefundPolicy && it\.q === base\.faq\.cancellationsQ/);
  assert.match(sections, /href && external \? \(/);
  assert.match(sections, /target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"/);
});

test("copy: donation refund wording is SDI's (donations only — never tickets); give text is the Gala campaign, not general MEKI work", () => {
  for (const g of [galaEn, galaAr]) {
    assert.ok(g.faq.donationRefund.q && g.faq.donationRefund.a);
    assert.doesNotMatch(g.faq.donationRefund.a, /ticket|تذكر/i);
    assert.ok(g.faq.items.some((i) => i.q === g.faq.cancellationsQ), "cancellations item must exist to receive the approved ticket policy");
    assert.ok(g.booking.give.projectText.includes("{project}"));
    for (const k of ["openStatus", "closedStatus", "newTab"]) assert.ok(g.booking.give[k].trim(), k);
  }
  assert.doesNotMatch(galaEn.booking.give.text, /MEKI's work/);
  assert.doesNotMatch(getPages("en").give.availabilityTitle, /opens soon/i);
  for (const l of ["en", "ar"]) {
    const d = getPages(l).programDetail.donate;
    for (const k of ["scopeTitle", "scopeText", "galaLink"]) assert.ok(d[k].trim(), `${l}.${k}`);
    assert.ok(getPages(l).give.galaLink.trim());
  }
});

test("/give stays a no-payment page: the Gala link is information, not a checkout", () => {
  assert.match(give, /events\/gala-night#booking/);
  assert.doesNotMatch(give, /\/checkout|zeffy\.com|<form[ >]|type="submit"/i);
});
