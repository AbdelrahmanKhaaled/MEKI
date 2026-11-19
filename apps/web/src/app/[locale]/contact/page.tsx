import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Mail, MapPin, Phone, Share2 } from "lucide-react";
import { isLocale } from "@/lib/i18n";
import { getPageContent } from "@/lib/content";
import { getPages, pageHref } from "@/content/pages";
import { pageMetadata } from "@/lib/page-meta";
import { PageShell, PageHero } from "@/components/pages/PageShell";
import { PageCta } from "@/components/pages/PageCta";
import { ContactForm } from "@/components/pages/ContactForm";
import { Pattern, PointsOfLight } from "@/components/Decor";

const dt = "mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-glow";

export const revalidate = 300;

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? pageMetadata(locale, "contact") : {};
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { site } = await getPageContent(locale);
  const c = getPages(locale).contact;

  // Only details published in Site Settings are shown; nothing is invented.
  const email = site?.contactEmail && EMAIL.test(site.contactEmail) ? site.contactEmail : null;
  const phone = site?.contactPhone?.trim() || null;
  const address = site?.address?.trim() || null;
  const social = (site?.socialLinks ?? []).filter((s) => /^https:\/\//.test(s.url));
  const hasDetails = !!(email || phone || address || social.length);

  return (
    <PageShell locale={locale} current="contact">
      <PageHero eyebrow={c.eyebrow} title={c.title} lead={c.intro} image="farmer-portrait" layout="arch" />
      <section aria-label={c.title} className="section-y bg-paper">
        <div className="container-x grid items-start gap-8 lg:grid-cols-12 lg:gap-10">
          <div data-reveal className="relative isolate overflow-hidden rounded-[2rem] bg-deep-green p-8 text-white shadow-[0_40px_80px_-40px_rgb(11_59_48/0.7)] sm:p-10 lg:col-span-5">
            <Pattern opacity={0.06} className="-z-10" />
            <PointsOfLight count={10} className="-z-10" />
            <div aria-hidden="true" className="spin-slow pointer-events-none absolute -end-24 -top-24 -z-10 size-64 rounded-full border border-dashed border-glow/20" />
            <h2 className="mb-6 text-3xl text-white">{c.detailsTitle}</h2>
            {hasDetails ? (
              <dl className="space-y-6 border-t border-white/15 pt-6">
                {email && (
                  <div>
                    <dt className={dt}><Mail className="size-4" aria-hidden="true" /> {c.email}</dt>
                    <dd>
                      <a href={`mailto:${email}`} className="p10-underline text-lg text-white">
                        {email}
                      </a>
                    </dd>
                  </div>
                )}
                {phone && (
                  <div>
                    <dt className={dt}><Phone className="size-4" aria-hidden="true" /> {c.phone}</dt>
                    <dd className="text-lg" dir="ltr">
                      {phone}
                    </dd>
                  </div>
                )}
                {address && (
                  <div>
                    <dt className={dt}><MapPin className="size-4" aria-hidden="true" /> {c.address}</dt>
                    <dd className="whitespace-pre-line text-lg">{address}</dd>
                  </div>
                )}
                {social.length > 0 && (
                  <div>
                    <dt className={dt}><Share2 className="size-4" aria-hidden="true" /> {c.social}</dt>
                    <dd className="flex flex-wrap gap-x-5 gap-y-1">
                      {social.map((s) => (
                        <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="p10-underline min-h-11 py-2 font-bold capitalize text-white">
                          {s.network}
                        </a>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="border-t border-white/15 pt-6 text-mint-line">{c.detailsPending}</p>
            )}
          </div>
          <div data-reveal className="rounded-[2rem] border border-stone-line bg-paper p-8 shadow-[0_30px_70px_-50px_rgb(11_59_48/0.5)] sm:p-10 lg:col-span-7">
            <h2 className="mb-6 text-3xl">{c.formTitle}</h2>
            <ContactForm c={c} to={email} />
          </div>
        </div>
      </section>
      <PageCta
        title={c.ctaTitle}
        links={[
          { href: pageHref(locale, "about"), label: c.ctaAbout },
          { href: pageHref(locale, "programs"), label: c.ctaPrograms, primary: true },
        ]}
      />
    </PageShell>
  );
}
