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
      <section className="section-y bg-paper">
        <div className="container-x max-w-3xl">
          {sections.length > 0 ? (
            sections.map((s) => (
              <div key={s.key} className="mb-10">
                {s.title && <h2 className="mb-3 text-2xl">{s.title}</h2>}
                <p className="whitespace-pre-line text-body-grey">{s.body}</p>
              </div>
            ))
          ) : (
            <>
              <h2 className="mb-3 text-3xl">{p.pendingTitle}</h2>
              <p className="mb-8 text-lg text-body-grey">{p.pending}</p>
              <a href={pageHref(locale, "home")} className="btn btn-outline min-h-12">
                {p.back}
              </a>
            </>
          )}
        </div>
      </section>
    </PageShell>
  );
}
