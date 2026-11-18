// Phase 6C unit tests — run with: pnpm --filter @meki/admin test   (Node built-in runner, native TS type stripping)
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test, { describe } from "node:test";
import {
  ACTION_PERMISSION, CAMPAIGN_TRANSITIONS, MAX_UPLOAD_BYTES, amountError, amountToApi, amountToInput, approveGate, availableActions, campaignActionGate, campaignDeleteGate, campaignEditGate,
  causeProgrammeLocked, causesOf, codeError, dateOrderError, dayToIso, diff, donationsGate, financialChangeEffect, formatBytes, hierarchyMismatch, isoToDay, mediaDeleteGate, minMaxError,
  parseSuggested, previewSrc, programmeDeleteGate, programmePublishGate, programmeUnpublishGate, publishChecklist, revokeGate, slugError, uploadError,
} from "../src/lib/content.ts";
import { CampaignSchema, MediaDetailSchema, MediaSchema, ProgrammeSchema, ProjectDetailSchema, ProjectSchema } from "../src/lib/content-schemas.ts";
import { NAV, visibleNav } from "../src/lib/navigation.ts";
import { ar, en } from "../src/lib/i18n.ts";

const media = { id: "m1", code: null, storageDriver: "LOCAL", storageKey: "uploads/2026/11/abc.jpg", originalName: "abc.jpg", mimeType: "image/jpeg", sizeBytes: 1000, width: 10, height: 10, category: "CAMPAIGN", altEn: null, altAr: null, captionEn: null, captionAr: null, credit: null, sourceFolder: null, consentStatus: "UNKNOWN", provenance: "PROPOSED", createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", url: "http://localhost:4000/media/uploads/2026/11/abc.jpg", checksum: "x" };
const campaignFacts = (o = {}) => ({ status: "DRAFT", provenance: "PROPOSED", approvedAt: "2026-11-02T00:00:00Z", titleEn: "Winter", summaryEn: "Summary", programmeId: "p1", programme: { status: "PUBLISHED" }, startsAt: null, endsAt: null, ...o });
const all = () => true;

describe("programme gates mirror programmes.service.ts", () => {
  const p = { status: "DRAFT", provenance: "VERIFIED_SOURCE", nameEn: "Education", shortDescEn: "Short", slug: "education", _count: { campaigns: 0 } };
  test("publish requires permission, non-DEMO, English name, summary and slug", () => {
    assert.deepEqual(programmePublishGate(p, true), { allowed: true, reasons: [] });
    assert.deepEqual(programmePublishGate({ ...p, provenance: "DEMO", shortDescEn: "  ", slug: "" }, false).reasons, ["permission", "demo", "missingShortDescEn", "missingSlug"]);
    assert.ok(programmePublishGate({ ...p, status: "PUBLISHED" }, true).reasons.includes("alreadyPublished"));
  });
  test("unpublish is blocked by live campaigns; unknown count is never treated as zero", () => {
    assert.equal(programmeUnpublishGate({ status: "PUBLISHED" }, 0, true).allowed, true);
    assert.ok(programmeUnpublishGate({ status: "PUBLISHED" }, 2, true).reasons.includes("liveCampaigns"));
    assert.ok(programmeUnpublishGate({ status: "PUBLISHED" }, null, true).reasons.includes("unknownLive"));
  });
  test("delete: never published, never with campaigns", () => {
    assert.equal(programmeDeleteGate(p, true).allowed, true);
    assert.ok(programmeDeleteGate({ ...p, status: "PUBLISHED" }, true).reasons.includes("unpublishFirst"));
    assert.ok(programmeDeleteGate({ ...p, _count: { campaigns: 3 } }, true).reasons.includes("hasCampaigns"));
  });
});

describe("campaign lifecycle mirrors campaign.rules.ts", () => {
  test("transition table is the backend's", () => {
    assert.deepEqual(CAMPAIGN_TRANSITIONS.publish.from, ["DRAFT", "IN_REVIEW"]);
    assert.deepEqual(CAMPAIGN_TRANSITIONS.archive.from, ["DRAFT", "IN_REVIEW", "PAUSED", "COMPLETED"]);
    assert.deepEqual(availableActions("DRAFT"), ["submit", "publish", "archive"]);
    assert.deepEqual(availableActions("PUBLISHED"), ["pause", "complete", "unpublish"]);
    assert.deepEqual(availableActions("PAUSED"), ["resume", "complete", "unpublish", "archive"]);
    assert.deepEqual(availableActions("COMPLETED"), ["archive"]);
    assert.deepEqual(availableActions("ARCHIVED"), []);
    assert.equal(ACTION_PERMISSION.submit, "campaigns.manage");
    assert.equal(ACTION_PERMISSION.publish, "campaigns.publish");
  });
  test("publishing checklist = backend blockers (approval, DEMO, title, summary, programme published, dates)", () => {
    const now = Date.parse("2026-11-17T00:00:00Z");
    assert.ok(publishChecklist(campaignFacts(), now).every((i) => i.ok));
    const bad = publishChecklist(campaignFacts({ approvedAt: null, provenance: "DEMO", summaryEn: "", programme: { status: "DRAFT" }, startsAt: "2026-12-10T00:00:00Z", endsAt: "2026-12-01T00:00:00Z" }), now);
    assert.deepEqual(bad.filter((i) => !i.ok).map((i) => i.key), ["approved", "notDemo", "summaryEn", "programmePublished", "dateOrder"]);
    assert.ok(!publishChecklist(campaignFacts({ endsAt: "2026-11-01T00:00:00Z" }), now).find((i) => i.key === "notEnded").ok);
    assert.ok(!publishChecklist(campaignFacts({ programmeId: null, programme: null }), now).find((i) => i.key === "programme").ok);
  });
  test("publish gate combines permission, state and checklist; other actions ignore the checklist", () => {
    assert.equal(campaignActionGate("publish", campaignFacts(), all).allowed, true);
    assert.deepEqual(campaignActionGate("publish", campaignFacts({ approvedAt: null }), all).reasons, ["check.approved"]);
    assert.ok(campaignActionGate("publish", campaignFacts(), (p) => p !== "campaigns.publish").reasons.includes("permission"));
    assert.ok(campaignActionGate("pause", campaignFacts(), all).reasons.includes("wrongState"));
    assert.equal(campaignActionGate("submit", campaignFacts({ approvedAt: null, provenance: "DEMO" }), all).allowed, true);
  });
  test("approval: never DEMO, not closed; revoke only when approved and not live", () => {
    assert.equal(approveGate({ provenance: "PROPOSED", status: "DRAFT" }, true).allowed, true);
    assert.ok(approveGate({ provenance: "DEMO", status: "DRAFT" }, true).reasons.includes("demo"));
    assert.ok(approveGate({ provenance: "PROPOSED", status: "COMPLETED" }, true).reasons.includes("closed"));
    assert.ok(approveGate({ provenance: "PROPOSED", status: "DRAFT" }, false).reasons.includes("permission"));
    assert.equal(revokeGate({ approvedAt: "x", status: "DRAFT" }, true).allowed, true);
    assert.ok(revokeGate({ approvedAt: "x", status: "PUBLISHED" }, true).reasons.includes("unpublishFirst"));
    assert.ok(revokeGate({ approvedAt: null, status: "DRAFT" }, true).reasons.includes("notApproved"));
  });
  test("donations: open only when published AND platform payments effective; unknown payments block", () => {
    const pub = { status: "PUBLISHED", donationsOpen: false };
    assert.equal(donationsGate(true, pub, true, true).allowed, true);
    assert.ok(donationsGate(true, pub, false, true).reasons.includes("paymentsDisabled"));
    assert.ok(donationsGate(true, pub, null, true).reasons.includes("paymentsUnknown"));
    assert.ok(donationsGate(true, { ...pub, status: "DRAFT" }, true, true).reasons.includes("notPublished"));
    assert.ok(donationsGate(true, pub, true, false).reasons.includes("permission"));
    assert.equal(donationsGate(false, { status: "PAUSED", donationsOpen: true }, false, true).allowed, true, "closing never needs payments");
  });
  test("delete/edit guards and financial-change effect", () => {
    assert.ok(campaignDeleteGate({ status: "PAUSED" }, true).reasons.includes("unpublishFirst"));
    assert.equal(campaignDeleteGate({ status: "COMPLETED" }, true).allowed, true);
    assert.ok(campaignEditGate({ status: "ARCHIVED" }, true).reasons.includes("archived"));
    assert.equal(financialChangeEffect({ status: "DRAFT", approvedAt: "x" }, { targetAmount: true }), "resetsApproval");
    assert.equal(financialChangeEffect({ status: "PUBLISHED", approvedAt: "x" }, { currency: true }), "blockedLive");
    assert.equal(financialChangeEffect({ status: "DRAFT", approvedAt: null }, { provenance: true }), "none");
    assert.equal(financialChangeEffect({ status: "PUBLISHED", approvedAt: "x" }, {}), "none");
  });
});

describe("hierarchy: Program → Cause (project) → Campaign", () => {
  const causes = [{ id: "c1", programmeId: "p1" }, { id: "c2", programmeId: "p2" }, { id: "c3", programmeId: null }];
  test("only causes of the chosen program are offered", () => {
    assert.deepEqual(causesOf(causes, "p1").map((c) => c.id), ["c1"]);
    assert.deepEqual(causesOf(causes, ""), []);
  });
  test("mismatch mirrors PROJECT_PROGRAMME_MISMATCH; legacy causes without a program never constrain", () => {
    assert.equal(hierarchyMismatch("p1", causes[0]), false);
    assert.equal(hierarchyMismatch("p2", causes[0]), true);
    assert.equal(hierarchyMismatch(null, causes[0]), true);
    assert.equal(hierarchyMismatch("p1", causes[2]), false);
    assert.equal(hierarchyMismatch("p1", undefined), false);
  });
  test("a cause with campaigns cannot change program (PROJECT_HAS_CAMPAIGNS)", () => {
    assert.equal(causeProgrammeLocked(0), false);
    assert.equal(causeProgrammeLocked(2), true);
  });
});

describe("exact decimal amounts (Decimal(14,2))", () => {
  test("validation", () => {
    for (const ok of ["1", "1500", "1500.5", "1500.50", "999999999999.99"]) assert.equal(amountError(ok), null, ok);
    for (const bad of ["1.555", "-5", "1e3", "12,000", "abc", "1234567890123"]) assert.equal(amountError(bad), "amountFormat", bad);
    assert.equal(amountError("0"), "amountPositive");
    assert.equal(amountError(""), null);
    assert.equal(amountError("", { required: true }), "required");
  });
  test("transport keeps the exact value (≤ 14 significant digits) and round-trips the API's decimal strings", () => {
    assert.equal(amountToApi("999999999999.99"), 999999999999.99);
    assert.equal(String(amountToApi("0.1")), "0.1");
    assert.equal(amountToApi(""), null);
    assert.equal(amountToInput("1500.5"), "1500.5");
    assert.equal(amountToInput(null), "");
  });
  test("min/max and suggested amounts", () => {
    assert.equal(minMaxError("100", "50"), "minAboveMax");
    assert.equal(minMaxError("50", "50"), null);
    assert.deepEqual(parseSuggested("100, 25,50"), { values: [25, 50, 100] });
    assert.deepEqual(parseSuggested(""), { values: [] });
    assert.deepEqual(parseSuggested("1,2,3,4,5,6,7,8,9"), { error: "tooManyAmounts" });
    assert.deepEqual(parseSuggested("25, 25.00"), { error: "duplicateAmounts" });
    assert.deepEqual(parseSuggested("25, -1"), { error: "amountFormat" });
  });
  test("dates, codes and slugs follow the DTO patterns", () => {
    assert.equal(dayToIso("2027-01-31"), "2027-01-31T00:00:00.000Z");
    assert.equal(dayToIso("31/01/2027"), null);
    assert.equal(isoToDay("2027-01-31T00:00:00.000Z"), "2027-01-31");
    assert.equal(dateOrderError("2027-02-01", "2027-01-01"), "endBeforeStart");
    assert.equal(dateOrderError("2027-01-01", ""), null);
    assert.equal(codeError("CMP-WINTER", 60), null);
    assert.equal(codeError("cmp winter", 60), "codeFormat");
    assert.equal(slugError("winter-relief"), null);
    assert.equal(slugError("Winter Relief"), "slugFormat");
    assert.equal(slugError(""), null);
  });
  test("only changed fields are sent (no accidental approval reset)", () => {
    assert.deepEqual(diff({ a: "1", b: [1], c: "x" }, { a: "1", b: [1, 2], c: "y" }), { b: [1, 2], c: "y" });
  });
});

describe("media", () => {
  test("client pre-checks: JPEG/PNG/WebP up to 10 MB", () => {
    assert.equal(MAX_UPLOAD_BYTES, 10 * 1024 * 1024);
    assert.equal(uploadError({ type: "image/png", size: 1 }), null);
    assert.equal(uploadError({ type: "image/webp", size: MAX_UPLOAD_BYTES }), null);
    assert.equal(uploadError({ type: "image/png", size: MAX_UPLOAD_BYTES + 1 }), "fileSize");
    assert.equal(uploadError({ type: "image/svg+xml", size: 10 }), "fileType");
    assert.equal(uploadError({ type: "image/gif", size: 10 }), "fileType");
    assert.equal(uploadError({ type: "image/jpeg", size: 0 }), "fileEmpty");
  });
  test("previews of uploads go through the same-origin /media proxy; curated images keep their URL", () => {
    assert.equal(previewSrc(media), "/media/uploads/2026/11/abc.jpg");
    assert.equal(previewSrc({ storageDriver: "WEB_STATIC", storageKey: "/images/x.webp", url: "http://web/images/x.webp" }), "http://web/images/x.webp");
  });
  test("delete gate mirrors MEDIA_IN_USE and the curated-asset rule", () => {
    assert.equal(mediaDeleteGate({ storageDriver: "LOCAL", usage: { total: 0 } }, true).allowed, true);
    assert.ok(mediaDeleteGate({ storageDriver: "LOCAL", usage: { total: 2 } }, true).reasons.includes("mediaInUse"));
    assert.ok(mediaDeleteGate({ storageDriver: "WEB_STATIC", usage: { total: 0 } }, true).reasons.includes("curated"));
    assert.ok(mediaDeleteGate({ storageDriver: "LOCAL", usage: { total: 0 } }, false).reasons.includes("permission"));
    assert.equal(formatBytes(1536), "1.5 KB");
    assert.equal(formatBytes(10 * 1024 * 1024), "10.0 MB");
  });
});

describe("response mapping (zod, written from the NestJS services)", () => {
  const programme = { id: "p1", code: "PRG-01", slug: "s", kind: "PROGRAMME", number: 1, nameEn: "Social Solidarity & Household Resilience", nameAr: null, altNameEn: null, altNameAr: null, shortDescEn: "x", shortDescAr: null, mandateEn: null, mandateAr: null, descriptionEn: null, descriptionAr: null, focusAreasEn: ["a"], focusAreasAr: null, icon: "hands", coverMediaId: "m1", coverMedia: media, gallery: [{ sortOrder: 0, media }], projects: [], sortOrder: 10, isFeatured: true, status: "PUBLISHED", provenance: "VERIFIED_SOURCE", sourceRef: "Brand p.24", seoTitleEn: null, seoTitleAr: null, seoDescriptionEn: null, seoDescriptionAr: null, publishedAt: "x", createdAt: "x", updatedAt: "x", _count: { campaigns: 2 } };
  test("programme, project (cause) list + detail, media + usage", () => {
    assert.ok(ProgrammeSchema.safeParse(programme).success);
    assert.ok(MediaSchema.safeParse(media).success);
    const usage = { total: 1, programmeCovers: 1, campaignCovers: 0, programmeGallery: 0, campaignGallery: 0, sections: 0, sectionItems: 0, pages: 0, settings: 0, eventImages: 0, eventGallery: 0 };
    assert.ok(MediaDetailSchema.safeParse({ ...media, usage }).success);
    const row = { id: "c1", code: "PRJ-X", slug: "x", programmeId: "p1", nameEn: "Wells", nameAr: null, locationEn: null, locationAr: null, sourceFolder: null, provenance: "PROPOSED", sourceRef: null, status: "DRAFT", createdAt: "x", updatedAt: "x" };
    assert.ok(ProjectSchema.safeParse({ ...row, programme: { id: "p1", nameEn: "E", nameAr: null, slug: "e", status: "PUBLISHED", kind: "PROGRAMME" }, _count: { campaigns: 1 } }).success);
    assert.ok(ProjectDetailSchema.safeParse({ ...row, programme: null, campaigns: [{ id: "k", code: "CMP-K", slug: "k", titleEn: "K", titleAr: null, status: "DRAFT", provenance: "DEMO", approvedAt: null, currency: "USD", targetAmount: "1000.5", startsAt: null, endsAt: null }] }).success);
  });
  test("campaign amounts must be decimal strings, never floats", () => {
    const c = { id: "k", code: "CMP-K", slug: "k", programmeId: "p1", projectId: null, programme: { id: "p1", slug: "e", nameEn: "E", nameAr: null, status: "PUBLISHED" }, project: null, titleEn: "K", titleAr: null, summaryEn: null, summaryAr: null, descriptionEn: null, descriptionAr: null, locationEn: null, locationAr: null, coverMediaId: null, coverMedia: null, gallery: [], currency: "USD", suggestedAmounts: [25, 50], allowCustomAmount: true, minCustomAmount: null, maxCustomAmount: null, targetAmount: "10000", startsAt: null, endsAt: null, isFeatured: false, sortOrder: 0, status: "DRAFT", provenance: "PROPOSED", sourceRef: null, approvedById: null, approvedBy: null, approvedAt: null, approvalNote: null, donationsOpen: false, seoTitleEn: null, seoTitleAr: null, seoDescriptionEn: null, seoDescriptionAr: null, publishedAt: null, createdAt: "x", updatedAt: "x" };
    assert.ok(CampaignSchema.safeParse(c).success);
    assert.equal(CampaignSchema.safeParse({ ...c, targetAmount: 10000 }).success, false);
  });
});

describe("navigation, localization and static guards", () => {
  const keys = (u) => visibleNav(u).flatMap((g) => g.items.map((i) => i.key));
  const user = (...permissions) => ({ permissions, isSuperAdmin: false });
  test("each content page appears only with its read permission and has a route file", () => {
    assert.deepEqual(keys(user("programmes.read")), ["dashboard", "programs", "causes"]);
    assert.deepEqual(keys(user("campaigns.read")), ["dashboard", "campaigns"]);
    assert.deepEqual(keys(user("media.read")), ["dashboard", "media"]);
    for (const i of NAV.flatMap((g) => g.items).filter((x) => x.href)) assert.ok(existsSync(join(import.meta.dirname, "../src/app/[locale]/(dashboard)", i.href, "page.tsx")), i.key);
    for (const r of ["programs/new", "programs/[id]", "causes/new", "causes/[id]", "campaigns/new", "campaigns/[id]", "media/[id]"]) assert.ok(existsSync(join(import.meta.dirname, "../src/app/[locale]/(dashboard)", r, "page.tsx")), r);
  });
  test("every gate reason, status, provenance and checklist item is translated (EN + AR)", () => {
    for (const k of Object.keys(en.content.gate)) assert.ok(ar.content.gate[k]?.trim(), k);
    for (const k of ["VERIFIED_SOURCE", "PROPOSED", "DEMO"]) assert.ok(en.content.provenance[k] && ar.content.provenance[k]);
    for (const k of ["DRAFT", "IN_REVIEW", "PUBLISHED", "PAUSED", "COMPLETED", "ARCHIVED"]) assert.ok(en.content.statuses[k] && ar.content.statuses[k]);
    for (const k of Object.keys(CAMPAIGN_TRANSITIONS)) assert.ok(en.content.campaigns.actions[k] && ar.content.campaigns.actions[k] && en.content.campaigns.confirm[k] && ar.content.campaigns.confirmBody[k], k);
    for (const i of publishChecklist(campaignFacts())) assert.ok(en.content.checklist[i.key] && ar.content.checklist[i.key] && en.content.gate[`check.${i.key}`], i.key);
    for (const code of ["PROJECT_PROGRAMME_MISMATCH", "PROJECT_HAS_CAMPAIGNS", "DUPLICATE_MEDIA", "MEDIA_IN_USE", "PAYMENTS_DISABLED", "CAMPAIGN_NOT_PUBLISHABLE", "PROGRAMME_HAS_LIVE_CAMPAIGNS", "CONFLICT"]) assert.ok(en.content.errors[code] && ar.content.errors[code], code);
  });
  const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
  const root = join(import.meta.dirname, "../src");
  const files = [...walk(join(root, "features/content")), ...walk(join(root, "components/content")), join(root, "services/content.ts"), join(root, "hooks/useContentData.ts"), join(root, "lib/content.ts")];
  const read = (f) => readFileSync(f, "utf8");
  test("no fake data, no network outside lib/api.ts, no browser storage", () => {
    for (const f of files) {
      const s = read(f);
      assert.doesNotMatch(s, /mockData|fakeData|lorem|Math\.random/i, f);
      assert.doesNotMatch(s, /\bfetch\(|new XMLHttpRequest/, f);
      assert.doesNotMatch(s, /localStorage|sessionStorage|document\.cookie/, f);
    }
    assert.match(read(join(root, "lib/api.ts")), /new XMLHttpRequest/); // the single upload path
  });
  test("every mutation in the content pages goes through a confirmation dialog or the save bar", () => {
    for (const f of walk(join(root, "features/content"))) {
      const s = read(f);
      if (/\.mutate\(/.test(s)) assert.match(s, /ConfirmDialog|SaveBar/, f);
    }
  });
  test("the frontend never sends a collected/raised amount (financial totals come from reports only)", () => {
    for (const f of files) assert.doesNotMatch(read(f), /raisedAmount|collectedAmount\s*:/, f);
  });
});
