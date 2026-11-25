// Mock of the MEKI PUBLIC API for website-side data-flow checks (tests/e2e/cms-sync.smoke.mjs).
// It serves GET /api/v1/public/home?locale=en|ar built from the website's own dictionaries + a mutable "published CMS" state, a
// real image at /media/*, and a control endpoint (POST /__state). Everything else answers 503 (the website then uses built-in content).
//   node apps/web/tests/e2e/mock-public-api.mjs   (default port 4777)
// This is NOT the real API: it proves what the WEBSITE does with published data, not that Admin → API → database stored it.
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { createServer } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SRC = join(import.meta.dirname, "../../src") + "/";
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith("@/")) {
      const base = SRC + spec.slice(2);
      for (const ext of [".ts", ".tsx", "/index.ts"]) if (existsSync(base + ext)) return next(pathToFileURL(base + ext).href, ctx);
    }
    return next(spec, ctx);
  },
});
const { en } = await import("../../src/content/en.ts");
const { ar } = await import("../../src/content/ar.ts");

export const PORT = Number(process.env.MOCK_API_PORT ?? 4777);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const pageOf = (items) => items;

/** the "published" state an editor can change (EN / AR values) */
export const initialState = () => ({
  nav: [["Home", "الرئيسية", "/"], ["About MEKI", "عن MEKI", "/about"], ["Programs", "البرامج", "/programs"], ["Give", "تبرّع", "/give"], ["FAQ", "الأسئلة الشائعة", "/faq"], ["Contact", "تواصل معنا", "/contact"]],
  copyright: [null, null],
  contactEmail: null,
  social: [],
  heroImage: null,
  programmeName: {},
  programmeMandate: {},
  galleryCount: 0,
  galleryCaptions: [],
  footerText: [null, null],
});
let state = initialState();

const L = (loc) => (loc === "ar" ? 1 : 0);
function buildHome(loc) {
  const d = loc === "ar" ? ar : en;
  const i = L(loc);
  const programmes = d.programmes.items.map((p, n) => ({
    id: `p${n}`, slug: p.slug, kind: "PROGRAMME", number: n + 1,
    name: state.programmeName[p.slug]?.[i] ?? p.name, shortDesc: p.short, summary: p.summary, mandate: state.programmeMandate[p.slug]?.[i] ?? p.mandate,
    description: null, focusAreas: p.themes, focusAreaDetails: p.areaTexts, outcomes: p.outcomes, pageTitle: p.pageTitle ?? null,
    icon: p.icon, isFeatured: false, sortOrder: n, seoTitle: null, seoDescription: null, cover: null, gallery: [],
  }));
  const enabling = d.enabling.items.map((e, n) => ({ id: `e${n}`, slug: `e${n}`, kind: "ENABLING_FUNCTION", number: null, name: e.name, shortDesc: e.tagline, summary: e.text, mandate: null, description: null, focusAreas: null, icon: e.icon, isFeatured: false, sortOrder: n, seoTitle: null, seoDescription: null, cover: null, gallery: [] }));
  const sections = [];
  const item = (code, title, text, href, media) => ({ id: code, code, sortOrder: 0, title, text, icon: null, href, media: media ?? null });
  sections.push({ key: "FOOTER", eyebrow: null, title: null, subtitle: null, body: null, ctaPrimaryLabel: null, ctaPrimaryHref: null, ctaSecondaryLabel: null, ctaSecondaryHref: null, labels: {}, media: null,
    items: state.nav.map((n, k) => item(`nav-${k + 1}`, n[i], null, n[2])).concat([item("giving-1", loc === "ar" ? "تبرّع" : "Give", null, "/give")]) });
  if (state.heroImage) sections.push({ key: "HERO", eyebrow: null, title: null, subtitle: null, body: null, ctaPrimaryLabel: null, ctaPrimaryHref: null, ctaSecondaryLabel: null, ctaSecondaryHref: null, labels: {}, media: { id: "hero", url: `${ORIGIN}/media/${state.heroImage}`, alt: null }, items: [] });
  if (state.galleryCount) {
    sections.push({ key: "GALLERY", eyebrow: null, title: null, subtitle: null, body: null, ctaPrimaryLabel: null, ctaPrimaryHref: null, ctaSecondaryLabel: null, ctaSecondaryHref: null, labels: {}, media: null,
      items: Array.from({ length: state.galleryCount }, (_, k) => item(`g25-${k}`, state.galleryCaptions[k]?.[i] ?? `Photo ${k + 1}`, state.galleryCaptions[k]?.[2 + i] ?? "Egypt", "/programs/wash", { id: `m${k}`, url: `${ORIGIN}/media/g${k}.webp`, alt: null })) });
  }
  return {
    site: {
      orgName: "MEKI", tagline: null, legacyLine: null, logos: { primary: null, inverse: null, icon: null },
      contactEmail: state.contactEmail, contactPhone: null, address: null, socialLinks: state.social, defaultLocale: "en", supportedLocales: ["en", "ar"],
      footerText: state.footerText[i], footerNote: null, copyright: state.copyright[i], seoTitle: null, seoDescription: null, ogImageUrl: null,
    },
    donation: {}, programmes: [...programmes, ...enabling], campaigns: [], statistics: [], faqs: [],
    page: { slug: "home", title: "Home", seoTitle: null, seoDescription: null, ogImageUrl: null, publishedAt: new Date().toISOString(), hiddenSectionKeys: [], sections },
  };
}

const IMG = readFileSync(join(import.meta.dirname, "../../public/images/work/hero-family.webp"));
export const server = createServer(async (req, res) => {
  const url = new URL(req.url, ORIGIN);
  const json = (code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  if (req.method === "POST" && url.pathname === "/__state") {
    let raw = ""; for await (const c of req) raw += c;
    state = raw === "reset" ? initialState() : { ...state, ...JSON.parse(raw) };
    return json(200, { ok: true });
  }
  if (url.pathname === "/api/v1/public/home") return json(200, { data: buildHome(url.searchParams.get("locale") === "ar" ? "ar" : "en") });
  if (url.pathname.startsWith("/media/")) { res.writeHead(200, { "Content-Type": "image/webp", "Cache-Control": "public, max-age=60" }); return res.end(IMG); }
  return json(503, { error: { code: "MOCK_UNAVAILABLE" } });
});
if (import.meta.url === pathToFileURL(process.argv[1]).href) server.listen(PORT, "127.0.0.1", () => console.log(`mock public API on ${ORIGIN}`));
void pageOf;
