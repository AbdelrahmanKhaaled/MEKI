import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Image from "next/image";
import { ArrowRight, BadgeCheck, ClipboardCheck, Layers, Landmark, Mail, X } from "lucide-react";
import { media } from "@/content/media";
import { isLocale } from "@/lib/i18n";
import { getPageContent } from "@/lib/content";
import { getPages, pageHref } from "@/content/pages";
import { pageMetadata } from "@/lib/page-meta";
import { PageShell, PageHero } from "@/components/pages/PageShell";
import { PageCta } from "@/components/pages/PageCta";
import { PointsOfLight } from "@/components/Decor";
import type { PublicGivingOptions } from "@meki/api-client";
import { fetchPublicContent } from "@/lib/api";
import { getGivingCopy } from "@/content/giving";
import { GivingForm } from "@/components/giving/GivingForm";

/** Icons for the four approved trust commitments (order matches the dictionary). */
const TRUST_ICONS = [ClipboardCheck, BadgeCheck, Layers, Landmark];

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
  // Phase 14: the giving form. Programmes are listed for information; what is payable comes ONLY from the API (all closed today).
  const giving = await fetchPublicContent<PublicGivingOptions>(`/public/giving/options?locale=${locale}`);
  const g = getGivingCopy(locale).form;

  return (
    <PageShell locale={locale} current="give">
      {/* Campaign photography from MEKI's own programs: hospital incubators, water lines, workshops. */}
      <PageHero eyebrow={p.eyebrow} title={p.title} lead={p.intro} layout="mosaic" images={["incubator", "water-pipe", "carpentry"]} />

      {/* How giving works: vertical numbered path, content from the shared dictionary / CMS. */}
      <section aria-labelledby="steps-title" className="section-y bg-paper">
        <div className="container-x grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-28">
              <p data-reveal className="eyebrow mb-6">
                {p.stepsEyebrow}
              </p>
              <h2 id="steps-title" data-reveal className="headline mb-10">
                {p.stepsTitle}
              </h2>
              {/* Shelter works from the housing program: what a completed gift looks like on the ground. */}
              <div data-clip className="relative hidden aspect-[4/3] overflow-hidden rounded-[2rem] shadow-[0_40px_80px_-40px_rgb(11_59_48/0.55)] lg:block">
                <div data-parallax="0.08" className="absolute -inset-[10%]">
                  <Image src={media["housing-site"].src} alt="" fill sizes="40vw" className="object-cover" />
                </div>
                <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-tr from-deep-green/40 via-transparent to-transparent" />
              </div>
            </div>
          </div>
          <ol className="relative lg:col-span-6 lg:col-start-7">
            <span aria-hidden="true" className="absolute inset-y-3 start-5 w-px bg-gradient-to-b from-harvest-gold via-stone-line to-transparent" />
            {t.process.steps.map((s, i) => (
              <li key={s.title} data-reveal className="group relative pb-12 ps-16 last:pb-0">
                <span className="absolute start-0 top-0 grid size-10 place-items-center rounded-full border border-harvest-gold bg-paper font-serif text-lg text-gold-text transition-colors duration-500 group-hover:bg-harvest-gold group-hover:text-deep-green-3">{i + 1}</span>
                <h3 className="mb-2 text-2xl transition-colors duration-500 group-hover:text-meki-green">{s.title}</h3>
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
          <ul data-stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {t.trust.map((item, i) => {
              const TrustIcon = TRUST_ICONS[i % TRUST_ICONS.length];
              return (
                <li key={item.title} data-stagger-item className="group p10-lift relative overflow-hidden rounded-[1.75rem] border border-stone-line bg-paper p-7">
                  <span aria-hidden="true" className="absolute -end-10 -top-10 size-32 rounded-full bg-harvest-gold/10 transition-transform duration-700 group-hover:scale-150" />
                  <span className="p10-icon relative mb-6 grid size-12 place-items-center rounded-2xl bg-limestone text-meki-green">
                    <TrustIcon className="size-6" strokeWidth={1.6} aria-hidden="true" />
                  </span>
                  <h3 className="relative mb-2 font-serif text-2xl leading-snug">{item.title}</h3>
                  <p className="relative text-body-grey">{item.text}</p>
                </li>
              );
            })}
          </ul>
          <div data-reveal className="mt-12 max-w-3xl rounded-[1.75rem] border border-dashed border-gold-text/40 bg-paper/60 p-7 sm:p-9">
            <h3 className="mb-4 font-sans text-xs font-bold uppercase tracking-[0.22em] text-gold-text">{t.process.neverTitle}</h3>
            <ul className="mb-6 space-y-3 text-body-grey">
              {t.process.never.map((n) => (
                <li key={n} className="flex items-start gap-3">
                  <X className="mt-1 size-4 shrink-0 text-gold-text" aria-hidden="true" />
                  <span>{n}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-gold-text">{p.transparencyNote}</p>
          </div>
        </div>
      </section>

      {/* Phase 14 — reusable giving form (general or a programme intention, Sadaqah / Zakat). A PREVIEW while SDI has not
          authorized the channel: no reference, no contact details, no payment path. */}
      {giving && (
        <section id="prepare" aria-labelledby="prepare-title" className="section-y bg-paper">
          <div className="container-x">
            <p data-reveal className="eyebrow mb-6">{g.eyebrow}</p>
            <h2 id="prepare-title" data-reveal className="headline mb-4 max-w-2xl">{g.title}</h2>
            <p data-reveal className="mb-10 max-w-2xl text-lg text-body-grey">{g.intro}</p>
            {/* Suspense: the form reads ?programme= (useSearchParams) while the page itself stays statically rendered */}
            <Suspense fallback={null}>
              <GivingForm locale={locale} mode="general" options={giving} />
            </Suspense>
          </div>
        </section>
      )}

      {/* Availability: no checkout, no fake form. The interest route is the official contact channel. */}
      <section aria-labelledby="availability-title" className="section-y relative isolate overflow-hidden bg-deep-green text-white">
        <PointsOfLight count={14} className="-z-10" />
        <div aria-hidden="true" className="spin-slow pointer-events-none absolute start-1/2 top-1/2 -z-10 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-glow/15 rtl:translate-x-1/2" />
        <div aria-hidden="true" className="p10-drift pointer-events-none absolute -bottom-24 -end-24 -z-10 size-80 rounded-full bg-harvest-gold/15 blur-3xl" />
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
            {/* Phase 12B: the only fiscal-sponsor channel today is the Gala campaign (one approved project) — an information link, not a payment button. */}
            <a href={`/${locale}/events/gala-night#booking`} className="btn btn-outline-light min-h-14 px-8">
              {p.galaLink}
            </a>
          </div>
        </div>
      </section>

      <PageCta title={p.explore} links={[{ href: pageHref(locale, "programs"), label: p.explore, primary: true }]} />
    </PageShell>
  );
}
