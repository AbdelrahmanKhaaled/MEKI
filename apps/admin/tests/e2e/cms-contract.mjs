// Validates the Phase 6D (website CMS) response schemas against a RUNNING API on a *_test database. READ-ONLY (GET only).
// Usage: API_URL=http://localhost:4100 CONTRACT_EMAIL=… CONTRACT_PASSWORD=… node tests/e2e/cms-contract.mjs
import { z } from "zod";
import { FaqSchema, PageDetailSchema, PageRowSchema, SiteSettingsSchema, StatisticSchema } from "../../src/lib/cms-schemas.ts";
import { HOMEPAGE } from "../../src/lib/cms.ts";

const API = `${process.env.API_URL ?? "http://localhost:4100"}/api/v1`;
let cookie = "";
const call = async (path) => {
  const r = await fetch(API + path, { headers: { Cookie: cookie, Accept: "application/json" } });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const lr = await fetch(`${API}/admin/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: process.env.CONTRACT_EMAIL, password: process.env.CONTRACT_PASSWORD }) });
cookie = (lr.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
console.log("login", lr.status);
let ok = 0, fail = 0;
const tally = (pass, label) => { if (pass) ok++; else fail++; console.log(pass ? "OK  " : "FAIL", label); };
const check = (name, schema, data) => {
  const p = schema.safeParse(data);
  tally(p.success, `${name}${p.success ? "" : ` ${JSON.stringify(p.error.issues.slice(0, 3))}`}`);
  return p.success ? p.data : null;
};

const pages = check("pages[]", z.array(PageRowSchema), (await call("/admin/cms/pages")).json?.data) ?? [];
tally(pages.some((p) => p.slug === "home"), "page 'home' exists");
tally(pages.every((p) => typeof p.isEventPage === "boolean"), "every page row carries isEventPage (Phase 6D additive)");
const home = check("page detail (home)", PageDetailSchema, (await call("/admin/cms/pages/home")).json?.data);
if (home) {
  const keys = home.sections.map((s) => s.key);
  const missing = HOMEPAGE.map((d) => d.key).filter((k) => !keys.includes(k));
  tally(missing.length === 0, `every homepage section the editor knows exists (missing: ${missing.join(", ") || "none"})`);
  const unknown = keys.filter((k) => !HOMEPAGE.some((d) => d.key === k));
  console.log("     sections not modelled by the editor (kept unchanged):", unknown.join(", ") || "none");
  const footer = home.sections.find((s) => s.key === "FOOTER");
  tally(!!footer && footer.items.some((i) => (i.code ?? "").startsWith("nav-")), "FOOTER holds the nav-* menu items");
}
const event = pages.find((p) => p.isEventPage);
// event pages are readable (writes are refused with EVENT_PAGE_SCOPE — covered by apps/api/test/cms-6d.e2e-spec.ts)
if (event) check(`event page '${event.slug}' readable, flagged isEventPage`, PageDetailSchema, (await call(`/admin/cms/pages/${event.slug}`)).json?.data);

const faqs = (await call("/admin/faqs?pageSize=100")).json;
check(`faqs[] (${faqs?.data?.length})`, z.array(FaqSchema), faqs?.data);
const stats = (await call("/admin/statistics?pageSize=100")).json;
const st = check(`statistics[] (${stats?.data?.length})`, z.array(StatisticSchema), stats?.data) ?? [];
tally(st.every((s) => typeof s.value === "string"), "statistic values arrive as decimal strings");
check("site settings", SiteSettingsSchema, (await call("/admin/settings/site")).json?.data);

// public side: drafts never leak
const pub = (await call("/public/home?locale=en")).json?.data;
tally(!!pub, "public home responds");
const pubStats = pub?.statistics ?? [];
tally(pubStats.every((s) => !("verificationStatus" in s) || s.verificationStatus === "VERIFIED"), `public statistics are verified only (${pubStats.length})`);
const draftFaqs = (faqs?.data ?? []).filter((f) => f.status !== "PUBLISHED").map((f) => f.questionEn);
const pubFaqs = JSON.stringify(pub?.faqs ?? []);
tally(draftFaqs.every((q) => !pubFaqs.includes(q)), `no unpublished FAQ in the public payload (${draftFaqs.length} drafts checked)`);
tally(Array.isArray(pub?.page?.hiddenSectionKeys ?? []), "public page exposes hiddenSectionKeys (array)");

console.log(`\n${ok} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
