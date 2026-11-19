import type { PublicPage } from "@meki/api-client";
import type { Locale } from "@/lib/i18n";
import { fetchPublicContent } from "@/lib/api";
import { getPages, pageHref, type PageKey } from "@/content/pages";
import { PageShell, PageHero } from "./PageShell";

/**
 * Legal page shell. Official wording is pending legal counsel and fiscal sponsor approval, so nothing is
 * generated here. If a PUBLISHED CMS page with the same slug exists (privacy / terms / cookies), its section
 * titles and bodies are rendered; otherwise an honest "coming soon" state is shown.
 */
export async function LegalPage({ locale, kind }: { locale: Locale; kind: "privacy" | "terms" | "cookies" }) {
  const p = getPages(locale).legal;
  const page = await fetchPublicContent<PublicPage>(`/public/pages/${kind}?locale=${locale}`);
  const sections = (page?.sections ?? []).filter((s) => (s.body ?? "").trim() !== "");
  return (
    <PageShell locale={locale} current={kind as PageKey}>
      <PageHero eyebrow={p.eyebrow} title={p.titles[kind]} />
      {/* Reading progress (CSS scroll-driven; hidden where unsupported) */}
      <div aria-hidden="true" className="p10-progress" />
      <section className="section-y bg-paper">
        {sections.length > 0 ? (
          <div className="container-x grid gap-12 lg:grid-cols-12">
            {sections.length > 2 && (
              <nav aria-label={p.titles[kind]} className="hidden lg:col-span-3 lg:block">
                <ol className="sticky top-32 space-y-1 border-s border-stone-line">
                  {sections.map((s, i) =>
                    s.title ? (
                      <li key={s.key}>
                        <a href={`#legal-${s.key}`} className="-ms-px flex gap-3 border-s-2 border-transparent py-2 ps-4 text-sm text-body-grey transition-colors hover:border-harvest-gold hover:text-ink">
                          <span className="num text-gold-text" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                          <span>{s.title}</span>
                        </a>
                      </li>
                    ) : null,
                  )}
                </ol>
              </nav>
            )}
            <div className={`max-w-3xl ${sections.length > 2 ? "lg:col-span-8 lg:col-start-5" : "lg:col-span-8 lg:col-start-3"}`}>
              {sections.map((s, i) => (
                <div key={s.key} id={`legal-${s.key}`} data-reveal className="mb-12 scroll-mt-32 border-t border-stone-line pt-8 first:border-t-0 first:pt-0">
                  {s.title && (
                    <h2 className="mb-4 flex items-baseline gap-4 text-2xl">
                      <span className="num text-base text-gold-text" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                      {s.title}
                    </h2>
                  )}
                  <p className="whitespace-pre-line leading-relaxed text-body-grey">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="container-x max-w-3xl">
            <div data-reveal className="relative isolate overflow-hidden rounded-[2rem] border border-stone-line bg-limestone p-8 sm:p-12">
              <div aria-hidden="true" className="spin-slow pointer-events-none absolute -end-20 -top-20 -z-10 size-56 rounded-full border border-dashed border-harvest-gold/40" />
              <span aria-hidden="true" className="pulse-soft mb-6 block size-3 rounded-full bg-harvest-gold shadow-[0_0_24px_6px_rgb(214_161_70/0.35)]" />
              <h2 className="mb-3 text-3xl">{p.pendingTitle}</h2>
              <p className="mb-8 text-lg text-body-grey">{p.pending}</p>
              <a href={pageHref(locale, "home")} className="btn btn-outline min-h-12">
                {p.back}
              </a>
            </div>
          </div>
        )}
      </section>
    </PageShell>
  );
}
