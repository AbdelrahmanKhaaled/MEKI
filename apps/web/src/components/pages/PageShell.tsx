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
 * Dark editorial hero shared by the secondary pages only (the homepage has its own hero; it never renders this).
 * layout: "arch"     = photo in an arch beside the copy (+ an optional second, floating photo)
 *         "backdrop" = dimmed photo behind (slow Ken Burns + parallax)
 *         "mosaic"   = three-photo editorial composition beside the copy
 *         "plain"    = light motif only (orbiting gold rings and points of light)
 * Every photo is decorative here (alt=""): the heading carries the meaning. Motion: hero timeline (data-hero-*), parallax
 * (data-parallax) and the ambient primitives (spin-slow, float-y, kenburns), all neutralised by prefers-reduced-motion.
 */
export function PageHero({
  eyebrow,
  title,
  lead,
  image,
  images,
  layout = "plain",
  children,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  image?: MediaRef;
  /** mosaic: up to three photos; arch: an optional second, smaller photo */
  images?: MediaRef[];
  layout?: "arch" | "backdrop" | "mosaic" | "plain";
  children?: React.ReactNode;
}) {
  const img = image ? resolveMedia(image) : null;
  const extra = (images ?? []).map((m) => resolveMedia(m));
  const side = (img && layout === "arch") || (layout === "mosaic" && extra.length > 0);
  return (
    <section className="relative isolate overflow-hidden bg-deep-green text-white">
      {img && layout === "backdrop" && (
        <div aria-hidden="true" className="absolute inset-0 -z-20 overflow-hidden">
          <div data-parallax="0.08" className="absolute -inset-[8%]">
            <Image src={img.src} alt="" fill priority sizes="100vw" className="kenburns object-cover opacity-30" />
          </div>
        </div>
      )}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_80%_0%,rgb(20_89_74/0.9)_0%,rgb(11_59_48/0.94)_50%,#072a22_100%)]" />
      <Pattern opacity={0.06} className="-z-10" />
      <PointsOfLight className="-z-10" count={18} />
      {/* ambient: two thin gold rings turning very slowly, one soft glow floating */}
      <div aria-hidden="true" className="pointer-events-none absolute -end-40 -top-40 -z-10 hidden size-[560px] lg:block">
        <div className="spin-slow absolute inset-0 rounded-full border border-dashed border-glow/20" />
        <div className="spin-slower-rev absolute inset-16 rounded-full border border-glow/10" />
      </div>
      <div aria-hidden="true" className="float-y pointer-events-none absolute -start-24 bottom-10 -z-10 size-72 rounded-full bg-meki-green/25 blur-3xl" />
      <div className={`container-x relative grid items-center gap-12 pb-20 pt-36 lg:pb-28 lg:pt-44 ${side ? "lg:grid-cols-12" : ""}`}>
        <div className={side ? "lg:col-span-7" : "max-w-3xl"}>
          <p data-hero-item className="eyebrow eyebrow-dark mb-6">
            {eyebrow}
          </p>
          <h1 data-hero-item className="mb-6 text-[clamp(2.75rem,7vw,5.5rem)] leading-[1.02]">
            {title}
          </h1>
          <div data-hero-item className="mb-7 h-px w-24 bg-gradient-to-r from-harvest-gold to-glow/30 rtl:bg-gradient-to-l" />
          {lead && (
            <div data-hero-item className="max-w-2xl space-y-4 text-lg leading-relaxed text-mint-line sm:text-xl">
              {lead.split(/\n\s*\n/).map((para) => (
                <p key={para.slice(0, 40)}>{para}</p>
              ))}
            </div>
          )}
          {children && (
            <div data-hero-item className="mt-8 flex flex-wrap gap-3">
              {children}
            </div>
          )}
        </div>
        {img && layout === "arch" && (
          <div data-hero-item className="relative mx-auto w-[70%] max-w-[380px] lg:col-span-5 lg:w-full lg:justify-self-end">
            <div aria-hidden="true" className="spin-slow absolute -inset-6 rounded-t-full rounded-b-[3rem] border border-dashed border-glow/25" />
            <div data-hero-image className="relative aspect-[3/4] overflow-hidden rounded-t-full rounded-b-[2.5rem] shadow-[0_40px_80px_-30px_rgb(0_0_0/0.6)] ring-1 ring-glow/30">
              <Image src={img.src} alt="" fill priority sizes="(min-width:1024px) 380px, 70vw" className="object-cover object-[50%_30%]" />
            </div>
            {extra[0] && (
              <div className="float-y absolute -bottom-10 -start-10 hidden aspect-square w-40 overflow-hidden rounded-full border-4 border-deep-green shadow-[0_24px_50px_-20px_rgb(0_0_0/0.7)] sm:block lg:-start-16 lg:w-44">
                <Image src={extra[0].src} alt="" fill sizes="176px" className="object-cover" />
              </div>
            )}
          </div>
        )}
        {layout === "mosaic" && extra.length > 0 && (
          <div data-hero-item className="relative mx-auto grid w-full max-w-[520px] grid-cols-6 grid-rows-6 gap-3 lg:col-span-5 lg:justify-self-end" style={{ aspectRatio: "1 / 1" }}>
            {extra.slice(0, 3).map((m, i) => (
              <div
                key={m.src}
                className={`relative overflow-hidden shadow-[0_30px_60px_-30px_rgb(0_0_0/0.65)] ring-1 ring-glow/20 ${
                  i === 0 ? "col-span-4 row-span-4 rounded-t-[999px] rounded-b-3xl" : i === 1 ? "col-span-2 col-start-5 row-span-3 row-start-2 rounded-3xl" : "col-span-3 col-start-3 row-span-2 row-start-5 rounded-3xl"
                } ${i === 1 ? "float-y" : ""}`}
              >
                <Image src={m.src} alt="" fill priority={i === 0} sizes="(min-width:1024px) 340px, 60vw" className="object-cover" />
              </div>
            ))}
            <span aria-hidden="true" className="pulse-soft absolute -end-3 bottom-[18%] size-5 rounded-full bg-glow shadow-[0_0_30px_8px_rgb(230_195_111/0.5)]" />
          </div>
        )}
      </div>
    </section>
  );
}
