import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getPageContent } from "@/lib/content";
import { getPages, pageHref } from "@/content/pages";
import { pageMetadata } from "@/lib/page-meta";
import { PageShell, PageHero } from "@/components/pages/PageShell";
import { PageCta } from "@/components/pages/PageCta";
import { ContactForm } from "@/components/pages/ContactForm";

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
      <PageHero eyebrow={c.eyebrow} title={c.title} lead={c.intro} />
      <section aria-label={c.title} className="section-y bg-paper">
        <div className="container-x grid gap-14 lg:grid-cols-12">
          <div data-reveal className="lg:col-span-5">
            <h2 className="mb-6 text-3xl">{c.detailsTitle}</h2>
            {hasDetails ? (
              <dl className="space-y-6 border-t border-stone-line pt-6">
                {email && (
                  <div>
                    <dt className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-gold-text">{c.email}</dt>
                    <dd>
                      <a href={`mailto:${email}`} className="text-lg text-meki-green underline-offset-4 hover:underline">
                        {email}
                      </a>
                    </dd>
                  </div>
                )}
                {phone && (
                  <div>
                    <dt className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-gold-text">{c.phone}</dt>
                    <dd className="text-lg" dir="ltr">
                      {phone}
                    </dd>
                  </div>
                )}
                {address && (
                  <div>
                    <dt className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-gold-text">{c.address}</dt>
                    <dd className="whitespace-pre-line text-lg">{address}</dd>
                  </div>
                )}
                {social.length > 0 && (
                  <div>
                    <dt className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-gold-text">{c.social}</dt>
                    <dd className="flex flex-wrap gap-x-5 gap-y-1">
                      {social.map((s) => (
                        <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="min-h-11 py-2 font-bold capitalize text-meki-green underline-offset-4 hover:underline">
                          {s.network}
                        </a>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="border-t border-stone-line pt-6 text-body-grey">{c.detailsPending}</p>
            )}
          </div>
          <div data-reveal className="lg:col-span-6 lg:col-start-7">
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
