import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { PublicHostedForms, PublicProgrammeDetail } from "@meki/api-client";
import { isLocale, locales } from "@/lib/i18n";
import { getPageContent } from "@/lib/content";
import { fetchPublicContent, fetchPublicResource } from "@/lib/api";
import { getPages, pageHref } from "@/content/pages";
import { en } from "@/content/en";
import { resolveMedia, toMediaRef } from "@/content/media";
import { publicRobots, siteOrigin, socialMeta } from "@/lib/site";
import { PageShell } from "@/components/pages/PageShell";
import { PageCta } from "@/components/pages/PageCta";
import { ProgrammeDonate } from "@/components/programme/ProgrammeDonate";
import { ProgrammeGallery } from "@/components/programme/ProgrammeGallery";
import { ProgrammeCauses, ProgrammeFundraising, ProgrammeHelps, ProgrammeHero, ProgrammeImpact, ProgrammeOverview, SectionNav } from "@/components/programme/ProgrammeSections";

export const revalidate = 300;
/** Only the nine programmes of the approved structure have pages; any other slug is a 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return locales.flatMap((locale) => en.programmes.items.map((p) => ({ locale, slug: p.slug })));
}

const detailPath = (slug: string, locale: string) => `/public/programmes/${encodeURIComponent(slug)}/detail?locale=${locale}`;

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const { t } = await getPageContent(locale);
  const item = t.programmes.items.find((p) => p.slug === slug);
  if (!item) return {};
  const res = await fetchPublicResource<PublicProgrammeDetail>(detailPath(slug, locale));
  const api = res.status === "ok" ? res.data.programme : null;
  const title = api?.seoTitle || `${item.name} — MEKI`;
  const description = api?.seoDescription || item.short;
  const path = `/${locale}/programs/${slug}`;
  const img = resolveMedia(item.image);
  return {
    metadataBase: siteOrigin(),
    title,
    description,
    alternates: { canonical: path, languages: { en: `/en/programs/${slug}`, ar: `/ar/programs/${slug}`, "x-default": `/en/programs/${slug}` } },
    ...socialMeta({ title, description, locale, path, alt: item.name, image: { url: img.src, width: img.w, height: img.h } }),
    robots: publicRobots,
  };
}

/**
 * Phase 11A — single programme page. Sources: approved programme content (dictionary overlaid with the published CMS record)
 * + GET /public/programmes/:slug/detail (approved goal, verified fundraising, published causes/campaigns, verified statistics,
 * consent-filtered gallery). The API saying "not found" (unpublished / DEMO) → 404. The API unreachable → the approved content
 * still renders and fundraising says "temporarily unavailable" (never a guessed figure).
 */
export default async function ProgrammePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const { t } = await getPageContent(locale);
  const item = t.programmes.items.find((p) => p.slug === slug);
  if (!item) notFound();
  const res = await fetchPublicResource<PublicProgrammeDetail>(detailPath(slug, locale));
  if (res.status === "not_found") notFound();
  const d = res.status === "ok" ? res.data : null;
  const p = getPages(locale).programDetail;
  // Phase 12: SDI-hosted programme forms. A URL is returned only when programme giving is switched on AND designation confirmed.
  const forms = await fetchPublicContent<PublicHostedForms>("/public/hosted-forms");
  const hosted = forms?.programmes.find((f) => f.slug === slug) ?? null;

  // API media URLs are absolute; map them like every other API image (curated photos → local files, uploads → API origin).
  const gallery = (d?.programme.gallery ?? []).flatMap((m) => {
    const ref = toMediaRef(m);
    return ref ? [{ ...m, url: resolveMedia(ref).src }] : [];
  });
  const causes = d?.causes ?? [];
  const otherCampaigns = d?.otherCampaigns ?? [];
  const stats = d?.statistics ?? [];
  const nav = [
    { id: "overview", label: p.nav.overview },
    { id: "fundraising", label: p.nav.fundraising },
    { id: "causes", label: p.nav.causes },
    { id: "impact", label: p.nav.impact },
    ...(gallery.length > 0 ? [{ id: "gallery", label: p.nav.gallery }] : []),
    { id: "support", label: p.nav.support },
  ];

  return (
    <PageShell locale={locale} current="programs">
      <ProgrammeHero item={item} p={p} programsHref={pageHref(locale, "programs")} stat={stats[0]} locale={locale} />
      <SectionNav items={nav} label={item.name} />
      <ProgrammeOverview item={item} t={t} p={p} description={d?.programme.description ?? null} image={gallery[0] ? { url: gallery[0].url, alt: gallery[0].alt ?? null } : undefined} />
      <ProgrammeFundraising p={p} locale={locale} fundraising={d?.fundraising ?? null} unavailable={!d} />
      <ProgrammeCauses p={p} causes={causes} otherCampaigns={otherCampaigns} locale={locale} />
      <ProgrammeImpact item={item} p={p} t={t} stats={stats} locale={locale} />
      {gallery.length > 0 && (
        <section id="gallery" aria-labelledby="gallery-title" className="section-y scroll-mt-32 bg-paper">
          <div className="container-x">
            <p data-reveal className="eyebrow mb-6">
              {p.gallery.eyebrow}
            </p>
            <h2 id="gallery-title" data-reveal className="headline mb-10">
              {p.gallery.title}
            </h2>
            <ProgrammeGallery items={gallery} labels={p.gallery} fallbackAlt={item.name} />
          </div>
        </section>
      )}
      <ProgrammeHelps t={t} p={p} />
      <section id="support" aria-label={p.nav.support} className="section-y scroll-mt-32 bg-paper">
        <div className="container-x grid items-start gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p data-reveal className="eyebrow mb-6">
              {p.donate.eyebrow}
            </p>
            <h2 data-reveal className="headline mb-6">
              {p.support}
            </h2>
            <p data-reveal className="text-lg text-body-grey">
              {item.short}
            </p>
          </div>
          <div data-reveal className="lg:col-span-6 lg:col-start-7">
            <ProgrammeDonate t={t} p={p} locale={locale} slug={item.slug} name={item.name} hosted={hosted} />
          </div>
        </div>
      </section>
      <PageCta
        title={p.closing.title.replace("{program}", item.name)}
        text={p.closing.text}
        image={item.image}
        links={[
          { href: "#support", label: p.support, primary: true },
          { href: pageHref(locale, "programs"), label: p.breadcrumb },
        ]}
      />
    </PageShell>
  );
}
