import type { Locale } from "@/lib/i18n";
import { getPageContent } from "@/lib/content";
import type { PageKey } from "@/content/pages";
import { DonateProvider } from "../DonateProvider";
import { Header } from "../Header";
import { MotionRoot } from "../MotionRoot";
import { PreviewNote } from "../PreviewNote";
import { Footer } from "../sections/FinalFooter";
import { Pattern, PointsOfLight } from "../Decor";
import Image from "next/image";
import { resolveMedia, type MediaRef } from "@/content/media";

/** Shared frame for every secondary page: header, motion root, footer, preview notice. */
export async function PageShell({ locale, current, children }: { locale: Locale; current: PageKey; children: React.ReactNode }) {
  const { t, liveCampaigns } = await getPageContent(locale);
  return (
    <DonateProvider t={t} locale={locale} liveCampaigns={liveCampaigns}>
      <Header t={t} locale={locale} current={current} />
      <MotionRoot>
        <main id="main">{children}</main>
        <Footer t={t} />
      </MotionRoot>
      <PreviewNote text={t.previewBar} extra={t.draftTranslation || undefined} closeLabel={t.dialog.close} />
    </DonateProvider>
  );
}

/**
 * Dark editorial hero shared by the secondary pages (white header sits on it).
 * layout: "arch" = photo in an arch beside the copy · "backdrop" = dimmed photo behind · "plain" = light motif only.
 */
export function PageHero({
  eyebrow,
  title,
  lead,
  image,
  layout = "plain",
  children,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  image?: MediaRef;
  layout?: "arch" | "backdrop" | "plain";
  children?: React.ReactNode;
}) {
  const img = image ? resolveMedia(image) : null;
  return (
    <section className="relative isolate overflow-hidden bg-deep-green text-white">
      {img && layout === "backdrop" && <Image src={img.src} alt="" fill priority sizes="100vw" className="-z-20 object-cover opacity-25" />}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_80%_0%,rgb(20_89_74/0.9)_0%,rgb(11_59_48/0.94)_50%,#072a22_100%)]" />
      <Pattern opacity={0.06} className="-z-10" />
      <PointsOfLight className="-z-10" count={18} />
      <div className={`container-x relative grid items-center gap-12 pb-20 pt-36 lg:pb-28 lg:pt-44 ${img && layout === "arch" ? "lg:grid-cols-12" : ""}`}>
        <div className={img && layout === "arch" ? "lg:col-span-7" : "max-w-3xl"}>
          <p data-hero-item className="eyebrow eyebrow-dark mb-6">
            {eyebrow}
          </p>
          <h1 data-hero-item className="mb-6 text-[clamp(2.75rem,7vw,5.5rem)] leading-[1.02]">
            {title}
          </h1>
          <div data-hero-item className="mb-7 h-px w-24 bg-harvest-gold" />
          {lead && (
            <p data-hero-item className="max-w-2xl text-lg leading-relaxed text-mint-line sm:text-xl">
              {lead}
            </p>
          )}
          {children && (
            <div data-hero-item className="mt-8 flex flex-wrap gap-3">
              {children}
            </div>
          )}
        </div>
        {img && layout === "arch" && (
          <div data-hero-item className="relative mx-auto w-[70%] max-w-[380px] lg:col-span-5 lg:w-full lg:justify-self-end">
            <div className="relative aspect-[3/4] overflow-hidden rounded-t-full rounded-b-[2.5rem] shadow-[0_40px_80px_-30px_rgb(0_0_0/0.6)] ring-1 ring-glow/30">
              <Image src={img.src} alt="" fill priority sizes="(min-width:1024px) 380px, 70vw" className="object-cover object-[50%_30%]" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
