import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { resolveMedia, type MediaRef } from "@/content/media";
import { PointsOfLight } from "../Decor";

/**
 * Closing call-to-action band shared by the secondary pages (never the homepage). Links only to pages that exist.
 * Optional `image`: a dimmed, parallax photo behind the band (decorative, alt="").
 */
export function PageCta({ title, text, links, image }: { title: string; text?: string; links: { href: string; label: string; primary?: boolean }[]; image?: MediaRef }) {
  const img = image ? resolveMedia(image) : null;
  return (
    <section aria-label={title} className="relative isolate overflow-hidden bg-deep-green-3 text-white">
      {img && (
        <div aria-hidden="true" className="absolute inset-0 -z-20 overflow-hidden">
          <div data-parallax="0.12" className="absolute -inset-[12%]">
            <Image src={img.src} alt="" fill sizes="100vw" className="object-cover opacity-20" />
          </div>
        </div>
      )}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(70%_80%_at_50%_100%,rgb(214_161_70/0.18)_0%,transparent_70%)]" />
      <PointsOfLight count={12} className="-z-10" />
      <div aria-hidden="true" className="spin-slower-rev pointer-events-none absolute start-1/2 top-1/2 -z-10 size-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-glow/10 rtl:translate-x-1/2" />
      <div className="container-x py-20 text-center lg:py-28">
        <span aria-hidden="true" className="pulse-soft mx-auto mb-8 block size-3 rounded-full bg-glow shadow-[0_0_28px_8px_rgb(230_195_111/0.45)]" />
        <h2 data-reveal className="mx-auto mb-4 max-w-2xl text-[clamp(2rem,4.4vw,3.5rem)] leading-tight">
          {title}
        </h2>
        {text && (
          <p data-reveal className="mx-auto mb-8 max-w-xl text-lg text-mint-line">
            {text}
          </p>
        )}
        <div data-reveal className="flex flex-wrap justify-center gap-3">
          {links.map((l) => (
            <a key={l.href} href={l.href} className={`btn min-h-14 px-8 text-base ${l.primary ? "btn-gold" : "btn-outline-light"}`}>
              {l.label} <ArrowRight className="btn-arrow size-4" aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
