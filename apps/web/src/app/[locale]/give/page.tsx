import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, Mail } from "lucide-react";
import { isLocale } from "@/lib/i18n";
import { getPageContent } from "@/lib/content";
import { getPages, pageHref } from "@/content/pages";
import { pageMetadata } from "@/lib/page-meta";
import { PageShell, PageHero } from "@/components/pages/PageShell";
import { PageCta } from "@/components/pages/PageCta";
import { PointsOfLight } from "@/components/Decor";

export const revalidate = 300;

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? pageMetadata(locale, "give") : {};
}

export default async function GivePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { t, site } = await getPageContent(locale);
  const p = getPages(locale).give;
  const email = site?.contactEmail && EMAIL.test(site.contactEmail) ? site.contactEmail : null;

  return (
    <PageShell locale={locale} current="give">
      <PageHero eyebrow={p.eyebrow} title={p.title} lead={p.intro} />

      {/* How giving works: vertical numbered path, content from the shared dictionary / CMS. */}
      <section aria-labelledby="steps-title" className="section-y bg-paper">
        <div className="container-x grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <p data-reveal className="eyebrow mb-6">
              {p.stepsEyebrow}
            </p>
            <h2 id="steps-title" data-reveal className="headline">
              {p.stepsTitle}
            </h2>
          </div>
          <ol className="relative lg:col-span-7 lg:col-start-6">
            <span aria-hidden="true" className="absolute inset-y-3 start-5 w-px bg-gradient-to-b from-harvest-gold via-stone-line to-transparent" />
            {t.process.steps.map((s, i) => (
              <li key={s.title} data-reveal className="relative pb-10 ps-16 last:pb-0">
                <span className="absolute start-0 top-0 grid size-10 place-items-center rounded-full border border-harvest-gold bg-paper font-serif text-lg text-gold-text">{i + 1}</span>
                <h3 className="mb-2 text-2xl">{s.title}</h3>
                <p className="max-w-xl text-body-grey">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Transparency & accountability: only the approved brand commitments; payment details remain pending. */}
      <section aria-labelledby="transparency-title" className="section-y bg-limestone">
        <div className="container-x">
          <p data-reveal className="eyebrow mb-6">
            {p.transparencyEyebrow}
          </p>
          <h2 id="transparency-title" data-reveal className="headline mb-12 max-w-2xl">
            {p.transparencyTitle}
          </h2>
          <ul data-stagger className="grid gap-x-12 gap-y-8 border-t border-stone-line pt-8 sm:grid-cols-2">
            {t.trust.map((item) => (
              <li key={item.title} data-stagger-item className="border-s-2 border-harvest-gold ps-5">
                <h3 className="mb-1 font-serif text-2xl">{item.title}</h3>
                <p className="text-body-grey">{item.text}</p>
              </li>
            ))}
          </ul>
          <div data-reveal className="mt-12 max-w-2xl">
            <h3 className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.22em] text-gold-text">{t.process.neverTitle}</h3>
            <ul className="mb-6 list-disc space-y-1 ps-5 text-body-grey">
              {t.process.never.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <p className="text-sm text-gold-text">{p.transparencyNote}</p>
          </div>
        </div>
      </section>

      {/* Availability: no checkout, no fake form. The interest route is the official contact channel. */}
      <section aria-labelledby="availability-title" className="section-y relative isolate overflow-hidden bg-deep-green text-white">
        <PointsOfLight count={14} className="-z-10" />
        <div className="container-x max-w-3xl text-center">
          <h2 id="availability-title" data-reveal className="headline mb-5 text-white">
            {p.availabilityTitle}
          </h2>
          <p data-reveal className="mx-auto mb-8 max-w-xl text-lg text-mint-line">
            {p.availabilityText}
          </p>
          <div data-reveal className="flex flex-wrap justify-center gap-3">
            {email ? (
              <a href={`mailto:${email}`} className="btn btn-gold min-h-14 px-8">
                <Mail className="size-4" aria-hidden="true" /> {p.notifyEmail}
              </a>
            ) : (
              <a href={pageHref(locale, "contact")} className="btn btn-gold min-h-14 px-8">
                {p.notifyContact} <ArrowRight className="btn-arrow size-4" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </section>

      <PageCta title={p.explore} links={[{ href: pageHref(locale, "programs"), label: p.explore, primary: true }]} />
    </PageShell>
  );
}
