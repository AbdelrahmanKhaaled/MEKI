import Image from "next/image";
import Link from "next/link";
import { ArrowDown, CalendarDays, Flame, MapPin, Plus } from "lucide-react";
import { media } from "@/content/media";
import { PROPOSED_SPONSORSHIP, type GalaDict, type SponsorTier } from "@/content/gala";
import { Pattern, PointsOfLight, GoldArc } from "../Decor";

/**
 * Gala page sections. All server components; motion comes from MotionRoot's data-reveal / data-stagger attributes
 * (reduced-motion safe). Nothing here starts a payment or collects personal data.
 */

export function GalaHero({ g }: { g: GalaDict }) {
  const h = g.hero;
  return (
    <section id="top" className="relative isolate overflow-hidden bg-deep-green text-white">
      <Image src={media["field-sky"].src} alt="" fill priority sizes="100vw" className="-z-20 object-cover opacity-25" />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(110%_80%_at_50%_0%,rgb(20_89_74/0.85)_0%,rgb(11_59_48/0.92)_55%,#072a22_100%)]" />
      <Pattern opacity={0.06} className="-z-10" />
      <PointsOfLight className="-z-10" count={26} />
      <GoldArc className="-end-24 top-10 hidden size-[460px] opacity-60 lg:block" />
      <div className="container-x relative flex min-h-[92svh] flex-col justify-center pb-24 pt-36">
        <p data-hero-item className="eyebrow eyebrow-dark mb-7">
          {h.eyebrow}
        </p>
        <h1 data-hero-item className="mb-6 max-w-4xl text-[clamp(3rem,9vw,7rem)] leading-[0.98]">
          {h.title}
        </h1>
        <div data-hero-item className="mb-8 h-px w-24 bg-harvest-gold" />
        <p data-hero-item className="mb-10 max-w-xl text-lg text-mint-line sm:text-xl">
          {h.line}
        </p>
        <p data-hero-item className="mb-10 flex flex-col gap-3 text-base font-bold text-glow sm:flex-row sm:gap-8">
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="size-5" aria-hidden="true" /> {h.date}
          </span>
          <span className="inline-flex items-center gap-2">
            <MapPin className="size-5" aria-hidden="true" /> {h.venue}
          </span>
        </p>
        <div data-hero-item className="flex flex-col items-start gap-3">
          {/* Jumps to the booking section; it never starts a checkout. */}
          <a href="#booking" className="btn btn-gold min-h-14 px-8 text-base">
            {h.cta} <ArrowDown className="size-4" aria-hidden="true" />
          </a>
          <p className="text-sm text-mint-line/80">{h.ctaNote}</p>
        </div>
      </div>
    </section>
  );
}

export function GalaPurpose({ g }: { g: GalaDict }) {
  const p = g.purpose;
  return (
    <section id="purpose" aria-labelledby="purpose-title" className="section-y bg-paper">
      <div className="container-x grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <p data-reveal className="eyebrow mb-6">
            {p.eyebrow}
          </p>
          <h2 id="purpose-title" data-reveal className="headline">
            {p.title}
          </h2>
        </div>
        <div className="space-y-6 text-lg text-body-grey lg:col-span-6 lg:col-start-7">
          {p.body.map((b) => (
            <p key={b} data-reveal>
              {b}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

export function GalaExperience({ g }: { g: GalaDict }) {
  const e = g.experience;
  return (
    <section id="experience" aria-labelledby="experience-title" className="section-y bg-limestone">
      <div className="container-x">
        <div className="mb-14 max-w-2xl">
          <p data-reveal className="eyebrow mb-6">
            {e.eyebrow}
          </p>
          <h2 id="experience-title" data-reveal className="headline mb-5">
            {e.title}
          </h2>
          <p data-reveal className="text-lg text-body-grey">
            {e.intro}
          </p>
        </div>
        {/* Editorial list rather than a card grid: numbered lines with generous space. */}
        <ol data-stagger className="grid gap-x-16 border-t border-stone-line md:grid-cols-2">
          {e.items.map((item, i) => (
            <li key={item.title} data-stagger-item className="flex gap-6 border-b border-stone-line py-8">
              <span className="font-serif text-3xl text-harvest-gold-dark" aria-hidden="true">
                0{i + 1}
              </span>
              <div>
                <h3 className="mb-2 font-serif text-2xl text-ink">{item.title}</h3>
                <p className="text-body-grey">{item.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p data-reveal className="mt-8 text-sm text-gold-text">
          {e.pendingNote}
        </p>
      </div>
    </section>
  );
}

export function GalaTimeline({ g }: { g: GalaDict }) {
  const t = g.timeline;
  return (
    <section id="program" aria-labelledby="program-title" className="section-y relative isolate overflow-hidden bg-deep-green text-white">
      <PointsOfLight count={14} className="-z-10" />
      <div className="container-x grid gap-14 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-32">
            <p data-reveal className="eyebrow eyebrow-dark mb-6">
              {t.eyebrow}
            </p>
            <h2 id="program-title" data-reveal className="headline text-white">
              {t.title}
            </h2>
          </div>
        </div>
        <div className="lg:col-span-7 lg:col-start-6">
          <ol className="relative">
            {/* The vertical line of light */}
            <span aria-hidden="true" className="absolute inset-y-2 start-[7px] w-px bg-gradient-to-b from-harvest-gold/70 via-white/25 to-white/5" />
            {t.items.map((item, i) => (
              <li key={item.title} data-reveal className="relative pb-10 ps-12 last:pb-0">
                <span
                  aria-hidden="true"
                  className={`absolute start-0 top-1.5 grid size-4 place-items-center rounded-full ${
                    item.highlight ? "bg-harvest-gold shadow-[0_0_0_6px_rgb(214_161_70/0.18),0_0_24px_4px_rgb(230_195_111/0.55)]" : "bg-deep-green ring-1 ring-glow/70"
                  }`}
                >
                  <span className={`size-1.5 rounded-full ${item.highlight ? "bg-deep-green-3" : "bg-glow"}`} />
                </span>
                <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-mint-line/70" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className={`font-serif text-2xl leading-snug sm:text-3xl ${item.highlight ? "text-glow" : "text-white"}`}>
                  {item.highlight && <Flame className="me-2 inline size-6 -translate-y-0.5 text-harvest-gold" aria-hidden="true" />}
                  {item.title}
                </h3>
                {item.note && <p className="mt-1 text-mint-line">{item.note}</p>}
              </li>
            ))}
          </ol>
          <p data-reveal className="mt-12 border-t border-white/15 pt-6 text-sm italic text-mint-line">
            {t.note}
          </p>
        </div>
      </div>
    </section>
  );
}

export function GalaVenue({ g, mapUrl }: { g: GalaDict; mapUrl: string }) {
  const v = g.venue;
  return (
    <section id="venue" aria-labelledby="venue-title" className="section-y bg-paper">
      <div className="container-x grid items-start gap-12 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <p data-reveal className="eyebrow mb-6">
            {v.eyebrow}
          </p>
          <h2 id="venue-title" data-reveal className="headline mb-8">
            {v.title}
          </h2>
          <a data-reveal href={mapUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline min-h-12">
            <MapPin className="size-4" aria-hidden="true" /> {v.mapLabel}
          </a>
        </div>
        <div data-reveal className="border-s-2 border-harvest-gold ps-8 lg:col-span-5 lg:col-start-8">
          <h3 className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.22em] text-gold-text">{v.arrival}</h3>
          <p className="text-lg text-body-grey">{v.arrivalPending}</p>
        </div>
      </div>
    </section>
  );
}

export function GalaAttendance({ g }: { g: GalaDict }) {
  const a = g.attendance;
  return (
    <section id="attendance" aria-labelledby="attendance-title" className="section-y bg-limestone">
      <div className="container-x grid items-center gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <p data-reveal className="eyebrow mb-6">
            {a.eyebrow}
          </p>
          <h2 id="attendance-title" data-reveal className="headline">
            {a.title}
          </h2>
        </div>
        {/* Informational panel — deliberately not a ticket card / purchase UI. */}
        <div data-reveal className="lg:col-span-6 lg:col-start-7">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-gold-text">{a.ticket}</p>
          <p className="mb-6 font-serif text-[clamp(3rem,7vw,5rem)] leading-none text-deep-green">{a.price}</p>
          <ul className="mb-6 space-y-2 border-t border-stone-line pt-6 text-lg text-ink">
            {a.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="text-sm text-body-grey">{a.note}</p>
        </div>
      </div>
    </section>
  );
}

/**
 * Reusable sponsorship section. Public builds show only the intro and a "being finalized" note: tiers are
 * proposed and unvalidated. Pass `tiers` only in a development preview.
 */
export function SponsorshipSection({ g, tiers }: { g: GalaDict; tiers?: SponsorTier[] }) {
  const s = g.sponsorship;
  return (
    <section id="sponsorship" aria-labelledby="sponsorship-title" className="section-y bg-paper">
      <div className="container-x">
        <div className="max-w-2xl">
          <p data-reveal className="eyebrow mb-6">
            {s.eyebrow}
          </p>
          <h2 id="sponsorship-title" data-reveal className="headline mb-5">
            {s.title}
          </h2>
          <p data-reveal className="mb-3 text-lg text-body-grey">
            {s.body}
          </p>
          <p data-reveal className="text-body-grey">
            {s.pending}
          </p>
        </div>
        {tiers && tiers.length > 0 && (
          <div className="mt-12 border-t border-dashed border-gold-text pt-6">
            <p className="preview-badge mb-6 inline-block">{s.previewLabel}</p>
            <ul className="grid gap-px overflow-hidden rounded-2xl bg-stone-line md:grid-cols-3">
              {tiers.map((t) => (
                <li key={t.name} className="bg-limestone p-7">
                  <h3 className="font-serif text-2xl">{t.name}</h3>
                  <p className="mb-2 text-body-grey">{t.tagline}</p>
                  <p className="mb-4 font-bold text-gold-text">{t.price}</p>
                  <ul className="space-y-1 text-sm text-body-grey">
                    {t.benefits.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
export { PROPOSED_SPONSORSHIP };

/**
 * Causes the Gala supports. The six approved causes have not been supplied, so this renders nothing until
 * approved, event-linked data is passed in (never placeholder cards).
 */
export function GalaCauses({ g, causes }: { g: GalaDict; causes: { name: string; text?: string }[] }) {
  if (causes.length === 0) return null;
  return (
    <section id="causes" aria-labelledby="causes-title" className="section-y bg-limestone">
      <div className="container-x">
        <p className="eyebrow mb-6">{g.causes.eyebrow}</p>
        <h2 id="causes-title" className="headline mb-10">
          {g.causes.title}
        </h2>
        <ul className="grid gap-6 md:grid-cols-3">
          {causes.map((c) => (
            <li key={c.name} className="border-t border-harvest-gold pt-4">
              <h3 className="font-serif text-2xl">{c.name}</h3>
              {c.text && <p className="text-body-grey">{c.text}</p>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function GalaFaq({ g }: { g: GalaDict }) {
  const f = g.faq;
  return (
    <section id="faq" aria-labelledby="gala-faq-title" className="section-y bg-limestone">
      <div className="container-x grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <p data-reveal className="eyebrow mb-6">
            {f.eyebrow}
          </p>
          <h2 id="gala-faq-title" data-reveal className="headline">
            {f.title}
          </h2>
        </div>
        <div className="lg:col-span-7 lg:col-start-6">
          {f.items.map((item) => (
            <details key={item.q} className="group border-b border-stone-line first:border-t">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-6 py-5 [&::-webkit-details-marker]:hidden">
                <span className="font-serif text-xl text-ink group-open:text-meki-green sm:text-2xl">{item.q}</span>
                <Plus className="size-5 shrink-0 transition-transform duration-300 group-open:rotate-45" aria-hidden="true" />
              </summary>
              <div className="pb-6 pe-10 text-body-grey">
                <p>{item.a}</p>
                {item.pending && <p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-gold-text">{f.pendingLabel}</p>}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function BookingPanel({ title, text, cta, status, gold, href }: { title: string; text: string; cta: string; status: string; gold?: boolean; href?: string }) {
  return (
  <div data-reveal className="flex flex-col border-t border-white/20 pt-6">
    <h3 className="mb-3 font-serif text-3xl text-white">{title}</h3>
    <p className="mb-6 text-mint-line">{text}</p>
    {href ? (
      <Link href={href} aria-describedby={`status-${title.replace(/\s/g, "")}`} className={`btn mb-4 min-h-14 w-full justify-center sm:w-auto ${gold ? "btn-gold" : "btn-outline-light"}`}>
        {cta}
      </Link>
    ) : (
      <button type="button" disabled aria-describedby={`status-${title.replace(/\s/g, "")}`} className={`btn mb-4 min-h-14 w-full justify-center disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:w-auto ${gold ? "btn-gold" : "btn-outline-light"}`}>
        {cta}
      </button>
    )}
    <p id={`status-${title.replace(/\s/g, "")}`} className="text-sm text-mint-line/90">
      {status}
    </p>
  </div>
  );
}

/** Booking & giving. Both actions are disabled until the fiscal sponsor flow and payment arrangements are approved. */
/** `bookHref` is set only when the API reports ticket sales open AND checkout available; otherwise the action stays disabled. */
export function GalaBooking({ g, bookHref, bookStatus }: { g: GalaDict; bookHref?: string; bookStatus?: string }) {
  const b = g.booking;
  return (
    <section id="booking" aria-labelledby="booking-title" className="section-y relative isolate overflow-hidden bg-deep-green-3 text-white">
      <PointsOfLight count={12} className="-z-10" />
      <div className="container-x">
        <p data-reveal className="eyebrow eyebrow-dark mb-6">
          {b.eyebrow}
        </p>
        <h2 id="booking-title" data-reveal className="headline mb-12 text-white">
          {b.title}
        </h2>
        <div className="grid gap-12 md:grid-cols-2 md:gap-16">
          <BookingPanel {...b.book} {...(bookHref ? { href: bookHref, status: bookStatus ?? b.book.status } : {})} gold />
          <BookingPanel {...b.give} />
        </div>
      </div>
    </section>
  );
}
