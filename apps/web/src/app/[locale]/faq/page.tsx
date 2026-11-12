import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getPageContent } from "@/lib/content";
import { getGala } from "@/content/gala";
import { getPages, pageHref } from "@/content/pages";
import { pageMetadata } from "@/lib/page-meta";
import { PageShell, PageHero } from "@/components/pages/PageShell";
import { PageCta } from "@/components/pages/PageCta";
import { FaqAccordion, type AccordionItem } from "@/components/pages/FaqAccordion";

export const revalidate = 300;

type Cat = "general" | "programs" | "giving" | "gala";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? pageMetadata(locale, "faq") : {};
}

/** Maps a CMS FAQ category label to one of the four page categories. */
function categorize(raw: string): Cat {
  const c = raw.toLowerCase();
  if (c.includes("gala") || c.includes("event")) return "gala";
  if (c.includes("program") || c.includes("programme")) return "programs";
  if (/giv|donat|pay|receipt|tax/.test(c)) return "giving";
  return "general";
}

// Built-in homepage questions, in dictionary order, assigned to a category (used when no CMS FAQs are published).
const BUILTIN_CATEGORY: Cat[] = ["giving", "giving", "giving", "giving", "programs", "general", "giving"];

export default async function FaqPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { t, faqs } = await getPageContent(locale);
  const p = getPages(locale).faq;
  const g = getGala(locale);

  const groups: Record<Cat, AccordionItem[]> = { general: [], programs: [], giving: [], gala: [] };
  if (faqs.length > 0) {
    // Published CMS answers take priority (already approved).
    for (const f of [...faqs].sort((a, b) => a.sortOrder - b.sortOrder)) groups[categorize(f.category)].push({ q: f.question, a: f.answer });
  } else {
    const useMap = t.faq.items.length === BUILTIN_CATEGORY.length;
    t.faq.items.forEach((it, i) => groups[useMap ? BUILTIN_CATEGORY[i] : "general"].push({ q: it.q, a: it.a }));
  }
  // "What is MEKI?" reuses the approved boilerplate; Gala answers come from the Gala page (single source).
  if (groups.general.length === 0 || faqs.length === 0) groups.general.unshift({ q: locale === "ar" ? "ما هي MEKI؟" : "What is MEKI?", a: t.about.body });
  if (groups.gala.length === 0) groups.gala = g.faq.items.map((i) => ({ q: i.q, a: i.a, pending: i.pending }));

  const cats: { key: Cat; label: string }[] = [
    { key: "general", label: p.general },
    { key: "programs", label: p.programs },
    { key: "giving", label: p.giving },
    { key: "gala", label: p.gala },
  ];
  const shown = cats.filter((c) => groups[c.key].length > 0);

  return (
    <PageShell locale={locale} current="faq">
      <PageHero eyebrow={p.eyebrow} title={p.title} lead={p.intro} />
      <section aria-label={p.title} className="section-y bg-paper">
        <div className="container-x grid gap-12 lg:grid-cols-12">
          <nav aria-label={p.title} className="lg:col-span-3">
            <ul className="flex flex-wrap gap-2 lg:sticky lg:top-32 lg:flex-col lg:gap-1">
              {shown.map((c) => (
                <li key={c.key}>
                  <a href={`#${c.key}`} className="inline-flex min-h-11 items-center rounded-full border border-stone-line px-5 text-sm font-bold text-ink transition hover:border-meki-green hover:text-meki-green lg:border-0 lg:px-0 lg:text-base">
                    {c.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="space-y-16 lg:col-span-8 lg:col-start-5">
            {shown.map((c) => (
              <section key={c.key} id={c.key} aria-labelledby={`${c.key}-title`} className="scroll-mt-32">
                <h2 id={`${c.key}-title`} data-reveal className="headline mb-6 !text-[clamp(1.75rem,3vw,2.5rem)]">
                  {c.label}
                </h2>
                <FaqAccordion items={groups[c.key]} pendingLabel={g.faq.pendingLabel} />
              </section>
            ))}
          </div>
        </div>
      </section>
      <PageCta title={p.ctaTitle} text={p.ctaText} links={[{ href: pageHref(locale, "contact"), label: p.cta, primary: true }]} />
    </PageShell>
  );
}
