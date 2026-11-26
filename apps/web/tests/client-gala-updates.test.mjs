// Verification tests for MEKI Gala Night — Client Requested Updates Only
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { galaAr, galaEn } from "../src/content/gala.ts";
import { galaCmsFrom } from "../src/lib/gala-cms.ts";

const root = join(import.meta.dirname, "../../..");
const read = (p) => readFileSync(join(root, p), "utf8");

test("1. Ticket Section: Book Now appears directly below ticket price and links to booking flow", () => {
  const galaSections = read("apps/web/src/components/gala/GalaSections.tsx");
  const galaPage = read("apps/web/src/app/[locale]/events/gala-night/page.tsx");

  // Book Now button exists in GalaAttendance directly below ticket price
  assert.match(galaSections, /data-testid="gala-book-now"/);
  assert.match(galaSections, /href=\{bookHref\}/);
  assert.match(galaSections, /btn btn-gold/);

  // GalaAttendance receives bookHref pointing to booking flow
  assert.match(galaPage, /<GalaAttendance g=\{g\} price=\{apiPrice\} bookHref=\{`\/\$\{locale\}\/events\/gala-night\/book`\} \/>/);

  // Inquiries email is NOT inside the Ticket section (GalaAttendance)
  const attendanceSrc = galaSections.slice(galaSections.indexOf("function GalaAttendance"), galaSections.indexOf("function SponsorshipSection"));
  assert.doesNotMatch(attendanceSrc, /mailto:/);
  assert.doesNotMatch(attendanceSrc, /data-testid="gala-contact-email"/);
});

test("2. Sponsors Section: Inquiries email appears in Sponsors section with clickable mailto link, not duplicated in ticket section", () => {
  const galaSections = read("apps/web/src/components/gala/GalaSections.tsx");

  const sponsorshipSrc = galaSections.slice(galaSections.indexOf("function SponsorshipSection"), galaSections.indexOf("function GalaCauses"));
  assert.match(sponsorshipSrc, /data-testid="gala-contact-email"/);
  assert.match(sponsorshipSrc, /href=\{`mailto:\$\{contactEmail\}`\}/);

  // English & Arabic copy has inquiries text in sponsorship
  assert.ok(galaEn.sponsorship.contact?.includes("{email}"));
  assert.ok(galaAr.sponsorship.contact?.includes("{email}"));
});

test("3. Gala Agenda: EVENT_AGENDA CMS section is parsed and reflected dynamically on the Gala page", () => {
  const mockPage = {
    sections: [
      {
        key: "EVENT_AGENDA",
        provenance: "VERIFIED_SOURCE",
        title: "Published Agenda Title",
        eyebrow: "Published Program",
        subtitle: "Published Hours",
        body: "Published Note",
        items: [
          {
            code: "act-1",
            title: "Opening Act",
            text: JSON.stringify({
              label: "Act I",
              time: "3:30 – 5:00 PM",
              items: [
                { time: "3:30 PM", title: "Registration", note: "Front desk", highlight: true },
                { time: "4:30 PM", title: "Opening Remarks" },
              ],
            }),
          },
        ],
      },
    ],
  };

  const cms = galaCmsFrom(mockPage);
  assert.ok(cms.timeline);
  assert.equal(cms.timeline.title, "Published Agenda Title");
  assert.equal(cms.timeline.eyebrow, "Published Program");
  assert.equal(cms.timeline.acts.length, 1);
  assert.equal(cms.timeline.acts[0].label, "Act I");
  assert.equal(cms.timeline.acts[0].title, "Opening Act");
  assert.equal(cms.timeline.acts[0].time, "3:30 – 5:00 PM");
  assert.equal(cms.timeline.acts[0].items.length, 2);
  assert.equal(cms.timeline.acts[0].items[0].time, "3:30 PM");
  assert.equal(cms.timeline.acts[0].items[0].title, "Registration");
  assert.equal(cms.timeline.acts[0].items[0].note, "Front desk");
  assert.equal(cms.timeline.acts[0].items[0].highlight, true);

  // gala-night/page.tsx merges cms.timeline when available
  const pageSrc = read("apps/web/src/app/[locale]/events/gala-night/page.tsx");
  assert.match(pageSrc, /cms\.timeline && cms\.timeline\.acts\.length > 0/);
});

test("4. Gala FAQ: Four confirmed points correctly displayed in English and Arabic without pending status", () => {
  for (const [locale, g] of [["en", galaEn], ["ar", galaAr]]) {
    const items = g.faq.items;

    // Venue Accessibility
    const access = items.find((i) => i.q === (locale === "ar" ? "إمكانية الوصول" : "Accessibility"));
    assert.ok(access, `Accessibility item exists in ${locale}`);
    assert.ok(!access.pending, `Accessibility is confirmed in ${locale}`);
    if (locale === "en") assert.equal(access.a, "The venue is accessible.");
    else assert.match(access.a, /المكان مجهز/);

    // Cancellation Policy
    const cancel = items.find((i) => i.q === (locale === "ar" ? "الإلغاء" : "Cancellations"));
    assert.ok(cancel, `Cancellations item exists in ${locale}`);
    assert.ok(!cancel.pending, `Cancellations is confirmed in ${locale}`);
    if (locale === "en") assert.equal(cancel.a, "No cancellations are allowed.");
    else assert.match(cancel.a, /لا يُسمح بإلغاء الحجوزات/);

    // Booking Confirmation
    const booking = items.find((i) => i.q === (locale === "ar" ? "الحجز" : "Bookings"));
    assert.ok(booking, `Bookings item exists in ${locale}`);
    assert.ok(!booking.pending, `Bookings is confirmed in ${locale}`);
    if (locale === "en") assert.match(booking.a, /^Bookings are confirmed\./);
    else assert.match(booking.a, /^الحجوزات مؤكدة\./);

    // Receipt Confirmation
    const receipts = items.find((i) => i.q === (locale === "ar" ? "الإيصالات" : "Receipts"));
    assert.ok(receipts, `Receipts item exists in ${locale}`);
    assert.ok(!receipts.pending, `Receipts is confirmed in ${locale}`);
    if (locale === "en") assert.equal(receipts.a, "Receipts are confirmed.");
    else assert.equal(receipts.a, "الإيصالات مؤكدة.");
  }
});
