import Image from "next/image";
import Link from "next/link";
import { ArrowDown, CalendarDays, Check, Clock, FileText, Flame, Gavel, GlassWater, Mail, MapPin, Plus, Sparkles, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { media } from "@/content/media";
import { photoCaption, type VenuePhoto } from "@/lib/venue-photos";
import type { GalaCms, GalaImage } from "@/lib/gala-cms";
import type { SocialLink } from "@/content/en";
import { PROPOSED_SPONSORSHIP, type GalaDict, type SponsorTier } from "@/content/gala";
import { SocialLinks } from "../SocialLinks";

/** Icon per experience card (used until MEKI publishes the card's photo). */
const EXPERIENCE_ICONS: Record<string, LucideIcon> = { "black-tie": Sparkles, dinner: UtensilsCrossed, bar: GlassWater, lamps: Flame, auction: Gavel };

/**
 * Gala page sections. All server components; motion comes from MotionRoot's data-reveal / data-stagger attributes
 * (reduced-motion safe). Nothing here starts a payment or collects personal data.
 *
 * MEKI client edits (22 Nov 2026, Gala item 14): "a real evening in New York, told through photos rather than graphics" — the glowing
 * light dots, floating particles, flickering lamp fields, spinning rings and the abstract "lights" image were removed. Real photos
 * appear only once MEKI publishes them in the Gala CMS sections (lib/gala-cms.ts); until then the sections keep their text.
 */

/** Hero (item 15): with a published venue photo it fills the hero under a dark green overlay; otherwise the current background stays. */
export function GalaHero({ g, image }: { g: GalaDict; image?: GalaImage | null }) {
  const h = g.hero;
  return (
    <section id="top" className="relative isolate overflow-hidden bg-deep-green text-white">
      <div aria-hidden="true" className="absolute inset-0 -z-20 overflow-hidden">
        {image ? (
          <Image src={image.src} alt="" fill priority sizes="100vw" quality={85} className="object-cover object-[50%_40%]" data-testid="gala-hero-photo" />
        ) : (
          <div data-parallax="0.1" className="absolute -inset-[10%]">
            <Image src={media["field-sky"].src} alt="" fill priority sizes="100vw" className="object-cover opacity-25" />
          </div>
        )}
      </div>
      <div
        aria-hidden="true"
        className={`absolute inset-0 -z-10 ${image ? "bg-[linear-gradient(180deg,rgb(7_42_34/0.72)_0%,rgb(11_59_48/0.80)_55%,rgb(7_42_34/0.94)_100%)]" : "bg-[radial-gradient(110%_80%_at_50%_0%,rgb(20_89_74/0.85)_0%,rgb(11_59_48/0.92)_55%,#072a22_100%)]"}`}
      />
      <div className="container-x relative flex min-h-[86svh] flex-col justify-center pb-20 pt-32 sm:min-h-[92svh] sm:pb-24 sm:pt-36">
        <p data-hero-item className="eyebrow eyebrow-dark mb-7">
          {h.eyebrow}
        </p>
        <h1 data-hero-item className="mb-6 max-w-4xl text-[clamp(2.6rem,9vw,7rem)] leading-[0.98]">
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
            <Clock className="size-5" aria-hidden="true" /> {h.time}
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
      <a href="#purpose" aria-label={g.purpose.eyebrow} className="float-y absolute bottom-8 start-1/2 hidden -translate-x-1/2 rounded-full border border-white/25 p-3 text-glow transition-colors hover:bg-white/10 sm:block rtl:translate-x-1/2">
        <ArrowDown className="size-4" aria-hidden="true" />
      </a>
    </section>
  );
}

/** Photo grid shared by "Why we gather" and the venue (captions "Title – Place"). 1 photo → wide; 2 → two columns; 3+ → lead + mosaic. */
function PhotoGrid({ photos, label, testId }: { photos: VenuePhoto[]; label: string; testId: string }) {
  const shown = photos.slice(0, 5);
  if (shown.length === 0) return null;
  const mosaic = shown.length >= 3;
  return (
    <div className="container-x mt-14 sm:mt-16" data-testid={testId}>
      <h3 className="sr-only">{label}</h3>
      <ul data-stagger className={`grid gap-5 sm:grid-cols-2 ${mosaic ? "lg:grid-cols-4" : ""}`}>
        {shown.map((p, i) => {
          const lead = mosaic && i === 0;
          const caption = photoCaption(p.title, p.place);
          return (
            <li key={p.src + i} data-stagger-item className={lead ? "sm:col-span-2 lg:row-span-2" : shown.length === 1 ? "sm:col-span-2" : ""}>
              <figure className="group mx-auto h-full" style={shown.length === 1 && p.w ? { maxWidth: p.w } : undefined}>
                {shown.length === 1 && p.w && p.h ? (
                  <Image src={p.src} alt={p.alt || caption} width={p.w} height={p.h} quality={85}
                    sizes={`(min-width:${p.w}px) ${p.w}px, 100vw`} className="h-auto w-full rounded-[1.75rem]" />
                ) : (
                  <div className={`relative overflow-hidden rounded-[1.75rem] bg-limestone ${lead ? "aspect-[4/3] lg:aspect-auto lg:h-[calc(100%-2.25rem)] lg:min-h-[420px]" : shown.length === 1 ? "aspect-[16/9]" : "aspect-[4/3]"}`}>
                    <Image src={p.src} alt={p.alt || caption} fill quality={85} sizes={lead || shown.length <= 2 ? "(min-width:1024px) 50vw, 100vw" : "(min-width:1024px) 25vw, (min-width:640px) 50vw, 100vw"} className="object-cover transition-transform duration-[1200ms] group-hover:scale-105" />
                  </div>
                )}
                <figcaption className="mt-3 text-sm font-bold text-body-grey">{caption}</figcaption>
              </figure>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** "Why we gather": the abstract lights image was removed (item 14); MEKI's published photos of the evening appear here instead. */
export function GalaPurpose({ g, photos = [] }: { g: GalaDict; photos?: VenuePhoto[] }) {
  const p = g.purpose;
  return (
    <section id="purpose" aria-labelledby="purpose-title" className="section-y bg-paper">
      <div className="container-x grid items-center gap-10 lg:grid-cols-12">
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
      <PhotoGrid photos={photos} label={g.purposePhotos} testId="gala-purpose-photos" />
    </section>
  );
}

type ExperienceCard = { code: string; title: string; text: string; image?: GalaImage };

/** Experience (items 18–19): five cards; each shows MEKI's published photo, otherwise its icon. */
export function GalaExperience({ g, cards }: { g: GalaDict; cards?: ExperienceCard[] }) {
  const e = g.experience;
  const items: ExperienceCard[] = cards ?? e.items;
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
        <ol data-stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => {
            const ExpIcon = EXPERIENCE_ICONS[item.code] ?? Sparkles;
            return (
              <li key={item.code} data-stagger-item className="group p10-lift relative flex flex-col overflow-hidden rounded-[1.75rem] border border-stone-line bg-paper">
                {item.image && (
                  <div className="relative aspect-[4/3] overflow-hidden bg-limestone" data-testid="gala-experience-photo">
                    <Image src={item.image.src} alt={item.image.alt} fill quality={85} sizes="(min-width:1024px) 31vw, (min-width:640px) 48vw, 100vw" className="object-cover transition-transform duration-[1200ms] group-hover:scale-105" />
                  </div>
                )}
                <div className="relative flex-1 p-6 sm:p-7">
                  <div className="mb-5 flex items-center justify-between">
                    {!item.image ? (
                      <span className="p10-icon grid size-12 place-items-center rounded-2xl bg-limestone text-meki-green">
                        <ExpIcon className="size-6" strokeWidth={1.6} aria-hidden="true" />
                      </span>
                    ) : (
                      <span />
                    )}
                    <span className="font-serif text-2xl text-gold-text" aria-hidden="true">
                      0{i + 1}
                    </span>
                  </div>
                  <h3 className="mb-2 font-serif text-2xl text-ink">{item.title}</h3>
                  <p className="text-body-grey">{item.text}</p>
                </div>
              </li>
            );
          })}
        </ol>
        <p data-reveal className="mt-8 text-sm text-gold-text">
          {e.pendingNote}
        </p>
      </div>
    </section>
  );
}

/**
 * Host (item 17): "Your host for the evening." Name confirmed in writing in MEKI's 22 Nov 2026 document. MEKI granted written approval to publish her
 * photo (25 Nov 2026); it comes from the published EVENT_SPEAKERS item "host". With no photo the section shows the name and line only.
 */
export function GalaHost({ g, host }: { g: GalaDict; host?: GalaCms["host"] }) {
  const h = g.host;
  const name = host?.name ?? h.name;
  const line = host?.line ?? h.line;
  const photo = host?.image;
  return (
    <section id="host" aria-labelledby="host-title" className="bg-paper py-16 sm:py-20" data-testid="gala-host">
      <div className="container-x">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-8 text-center sm:flex-row sm:text-start">
          {photo && (
            <div className="relative size-40 shrink-0 overflow-hidden rounded-full border-4 border-limestone bg-limestone shadow-[var(--shadow-card)] sm:size-48" data-testid="gala-host-photo">
              {/* square crop of the supplied portrait (never stretched); 192 px slot, below the source resolution */}
              <Image src={photo.src} alt={photo.alt || name} fill quality={85} sizes="(min-width:640px) 192px, 160px" className="object-cover object-top" />
            </div>
          )}
          <div>
            <p data-reveal className="eyebrow mb-4 justify-center sm:justify-start">
              {h.eyebrow}
            </p>
            <h2 id="host-title" data-reveal className="mb-2 font-serif text-[clamp(2rem,4vw,3rem)] text-ink">
              {name}
            </h2>
            <p data-reveal className="text-lg text-body-grey">
              {line}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function GalaTimeline({ g }: { g: GalaDict }) {
  const t = g.timeline;
  return (
    <section id="program" aria-labelledby="program-title" className="section-y relative isolate overflow-hidden bg-deep-green text-white">
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
          {/* Nov 19 2026 agenda: four acts, times in America/New_York. Roles only — speaker names are published once confirmed. */}
          <p data-reveal className="mb-10 text-sm font-bold text-glow">{t.hours}</p>
          <div className="space-y-14">
            {t.acts.map((act, a) => (
              <section key={act.label} aria-labelledby={`act-${a}`}>
                <p data-reveal className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-harvest-gold">
                  {act.label} · <span dir="ltr" className="inline-block">{act.time}</span>
                </p>
                <h3 id={`act-${a}`} data-reveal className="mb-8 font-serif text-3xl text-white sm:text-4xl">
                  {act.title}
                </h3>
                <ol className="relative">
                  {/* The vertical line of light */}
                  <span aria-hidden="true" className="absolute inset-y-2 start-[7px] w-px bg-gradient-to-b from-harvest-gold/70 via-white/25 to-white/5" />
                  {act.items.map((item) => (
                    <li key={item.time + item.title} data-reveal className="p10-row relative pb-8 ps-10 last:pb-0 sm:pb-10 sm:ps-12">
                      <span
                        aria-hidden="true"
                        className={`absolute start-0 top-1.5 grid size-4 place-items-center rounded-full ${item.highlight ? "bg-harvest-gold" : "bg-deep-green ring-1 ring-glow/70"}`}
                      >
                        <span className={`size-1.5 rounded-full ${item.highlight ? "bg-deep-green-3" : "bg-glow"}`} />
                      </span>
                      <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-mint-line/70">
                        <time dir="ltr" className="inline-block">{item.time}</time>
                      </p>
                      <h4 className={`font-serif text-2xl leading-snug sm:text-3xl ${item.highlight ? "text-glow" : "text-white"}`}>
                        {item.highlight && <Flame className="me-2 inline size-6 -translate-y-0.5 text-harvest-gold" aria-hidden="true" />}
                        {item.title}
                      </h4>
                      {item.note && <p className="mt-1 text-mint-line">{item.note}</p>}
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
          <p data-reveal className="mt-12 border-t border-white/15 pt-6 text-sm italic text-mint-line">
            {t.note}
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * Venue (item 21). MEKI's published venue photos (EVENT_VENUE; the supplied photos are building EXTERIORS — never described as interiors) replace the drawn map card. Until they are
 * published, the existing map card stays — no placeholder, stock or unrelated location is shown as the venue. "View on map" and
 * the full address (cross street and ZIP code) are always shown.
 */
export function GalaVenue({ g, mapUrl, photos = [], address, logo }: { g: GalaDict; mapUrl: string; photos?: VenuePhoto[]; address?: string; logo?: GalaImage | null }) {
  const v = g.venue;
  const addr = address ?? v.address;
  // 24 Nov 2026: the first published venue photo replaces the drawn map card; any further photos follow below.
  const [lead, ...more] = photos;
  return (
    <section id="venue" aria-labelledby="venue-title" className="section-y bg-paper">
      <div className="container-x grid items-start gap-12 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <p data-reveal className="eyebrow mb-6">
            {v.eyebrow}
          </p>
          <h2 id="venue-title" data-reveal className="headline mb-5">
            {v.title}
          </h2>
          <p data-reveal className="mb-8 flex items-start gap-2 text-lg text-body-grey" data-testid="gala-venue-address">
            <MapPin className="mt-1 size-5 shrink-0 text-meki-green" aria-hidden="true" />
            <span>{addr}</span>
          </p>
          <a data-reveal href={mapUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline min-h-12">
            <MapPin className="size-4" aria-hidden="true" /> {v.mapLabel}
          </a>
          {/* Venue logo (Gala → Settings → Venue photos → venue logo): the white artwork on Deep Green, original proportions. */}
          {logo && (
            <div className="mt-10" data-testid="gala-venue-logo">
              <span className="inline-grid place-items-center rounded-[1.5rem] bg-deep-green p-4">
                <Image src={logo.src} alt={logo.alt || g.venueLogoAlt} width={logo.w ?? 1000} height={logo.h ?? 1000} sizes="160px" className="h-auto w-32 sm:w-40" />
              </span>
            </div>
          )}
        </div>
        {lead && (
          <figure className="lg:col-span-5 lg:col-start-8" data-testid="gala-venue-lead-photo">
            {/* Shown at most at its own pixel width, so a small source is never blown up into a blurry image. */}
            <div className="relative overflow-hidden rounded-[2rem] bg-limestone" style={lead.w ? { maxWidth: lead.w } : undefined}>
              <Image src={lead.src} alt={lead.alt || photoCaption(lead.title, lead.place)} width={lead.w ?? 1200} height={lead.h ?? 800} quality={85} sizes="(min-width:1024px) 40vw, 100vw" className="h-auto w-full" />
            </div>
            <figcaption className="mt-3 text-sm font-bold text-body-grey">{photoCaption(lead.title, lead.place)}</figcaption>
          </figure>
        )}
        {!lead && (
        <div className="space-y-6 lg:col-span-5 lg:col-start-8">
          {/* Stylised location card (a map cue, not a venue photo): a city grid with a pulsing pin. */}
          <a data-reveal href={mapUrl} target="_blank" rel="noopener noreferrer" aria-label={`${v.mapLabel}: ${v.address}`} className="group p10-lift relative isolate block aspect-[16/10] overflow-hidden rounded-[2rem] bg-deep-green text-white">
            <span aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(rgb(255_255_255/0.06)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.06)_1px,transparent_1px)] bg-[size:36px_36px] transition-transform duration-[1400ms] group-hover:scale-110" />
            <span aria-hidden="true" className="absolute inset-y-0 start-[58%] -z-10 w-6 -skew-x-12 bg-white/10" />
            <span aria-hidden="true" className="absolute start-1/2 top-[44%] -translate-x-1/2 -translate-y-full rtl:translate-x-1/2">
              <MapPin className="relative size-10 text-glow drop-shadow-[0_6px_14px_rgb(0_0_0/0.4)] transition-transform duration-500 group-hover:-translate-y-1" />
            </span>
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-deep-green-3 to-transparent p-6 pt-14">
              <span className="block font-serif text-2xl">{v.title}</span>
            </span>
          </a>
          {/* Phase 13B: the Arrival / transportation block was removed at MEKI's request (address and map link kept). */}
        </div>
        )}
      </div>
      <PhotoGrid photos={more} label={v.photos} testId="gala-venue-photos" />
    </section>
  );
}

/**
 * `price`: the published ticketing API value when available (single source with the booking flow); otherwise the brief text.
 * `contactEmail`: shown only when MEKI published one (item 22 "Add a contact email for questions").
 */
export function GalaAttendance({ g, price, contactEmail }: { g: GalaDict; price?: string; contactEmail?: string | null }) {
  const a = g.attendance;
  return (
    <section id="attendance" aria-labelledby="attendance-title" className="section-y overflow-hidden bg-limestone">
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
          <p className="mb-6 inline-block font-serif text-[clamp(2.75rem,7vw,5rem)] leading-none text-deep-green">{price ?? a.price}</p>
          <ul className="mb-6 space-y-3 border-t border-stone-line pt-6 text-lg text-ink">
            {a.rules.map((r) => (
              <li key={r} className="flex items-center gap-3">
                <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-meki-green/10 text-meki-green">
                  <Check className="size-4" />
                </span>
                {r}
              </li>
            ))}
          </ul>
          <p className="text-sm text-body-grey">{a.note}</p>
          {contactEmail && (
            <p className="mt-4 flex items-center gap-2 text-sm font-bold text-ink" data-testid="gala-contact-email">
              <Mail className="size-4 text-meki-green" aria-hidden="true" />
              <span>
                {a.contact.split("{email}")[0]}
                <a href={`mailto:${contactEmail}`} className="text-meki-green underline underline-offset-4">
                  {contactEmail}
                </a>
                {a.contact.split("{email}")[1] ?? ""}
              </span>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Reusable sponsorship section. Proposed tiers are never public (pass `tiers` only in a development preview).
 * Item 23: "Sponsor now" replaces the "being finalized" note ONLY when MEKI publishes the official packages file/page (EVENT_SPONSORSHIP
 * section link) — no button without a destination. Partner logos (Bokra, The Waterway…) are CMS items (EVENT_SPONSORSHIP) shown only when published, visible AND with a logo — never a placeholder.
 */
export function SponsorshipSection({ g, tiers, sponsor, partners = [] }: { g: GalaDict; tiers?: SponsorTier[]; sponsor?: GalaCms["sponsorship"]; partners?: GalaCms["partners"] }) {
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
          {sponsor ? (
            <div data-reveal>
              {/* Informational packages only: opens the PDF; no checkout, booking or acceptance is started here. */}
              <a
                href={sponsor.href}
                target="_blank"
                rel="noopener noreferrer"
                {...(sponsor.document ? { type: "application/pdf" } : {})}
                className="btn btn-gold mt-3 min-h-14 px-8 text-base"
                data-testid="gala-sponsor-now"
              >
                {sponsor.label ?? s.cta}
                {sponsor.document ? <FileText className="size-4" aria-hidden="true" /> : null}
                <span className="sr-only">{sponsor.document ? ` — ${s.pdf}` : ` ${s.newTab}`}</span>
              </a>
              {sponsor.document && <p className="mt-3 max-w-xl text-sm text-body-grey" data-testid="gala-sponsor-note">{s.docNote}</p>}
            </div>
          ) : (
            <p data-reveal className="text-body-grey">
              {s.pending}
            </p>
          )}
        </div>
        {partners.length > 0 && (
          <div className="mt-12" data-testid="gala-partners">
            <h3 className="mb-5 font-sans text-xs font-bold uppercase tracking-[0.22em] text-gold-text">{s.partners}</h3>
            <ul className="flex flex-wrap items-center gap-6">
              {partners.map((p) => {
                const logo = <Image src={p.image.src} alt={p.name} width={p.image.w ?? 320} height={p.image.h ?? 160} sizes="200px" className="h-14 w-auto max-w-[200px] object-contain" />;
                return (
                  <li key={p.name} className="grid min-h-20 place-items-center rounded-2xl border border-stone-line bg-white px-6 py-3">
                    {p.href ? (
                      <a href={p.href} target="_blank" rel="noopener noreferrer" aria-label={`${p.name} ${s.newTab}`}>
                        {logo}
                      </a>
                    ) : (
                      logo
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
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
            <details key={item.q} className="group border-b border-stone-line transition-colors first:border-t hover:bg-paper/60">
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

function BookingPanel({ title, text, cta, status, gold, href, external, newTab, note }: { title: string; text: string; cta: string; status: string; gold?: boolean; href?: string; external?: boolean; newTab?: string; note?: string }) {
  return (
  <div data-reveal className="flex flex-col border-t border-white/20 pt-6">
    <h3 className="mb-3 font-serif text-3xl text-white">{title}</h3>
    <p className="mb-6 text-mint-line">{text}</p>
    {note && <p className="-mt-3 mb-6 text-sm text-mint-line/90" data-testid="gala-project-note">{note}</p>}
    {href && external ? (
      // Phase 12B: SDI's hosted Gala donation form (Zeffy). Only a URL returned by the API and checked by the page is linked.
      <a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-describedby={`status-${title.replace(/\s/g, "")}`} className={`btn mb-4 min-h-14 w-full justify-center sm:w-auto ${gold ? "btn-gold" : "btn-outline-light"}`}>
        {cta} {newTab && <span className="sr-only">{newTab}</span>}
      </a>
    ) : href ? (
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
/** Phase 12B: `give` is set only when the API reports SDI's Gala donation form available (approved project + open campaign). */
export function GalaBooking({ g, bookHref, bookStatus, give, disclosure }: { g: GalaDict; bookHref?: string; bookStatus?: string; give?: { href?: string; internal?: boolean; status: string; note?: string }; disclosure?: string | null }) {
  const b = g.booking;
  return (
    <section id="booking" aria-labelledby="booking-title" className="section-y relative isolate overflow-hidden bg-deep-green-3 text-white">
      <div className="container-x">
        <p data-reveal className="eyebrow eyebrow-dark mb-6">
          {b.eyebrow}
        </p>
        <h2 id="booking-title" data-reveal className="headline mb-12 text-white">
          {b.title}
        </h2>
        <div className="grid gap-12 md:grid-cols-2 md:gap-16">
          <BookingPanel {...b.book} {...(bookHref ? { href: bookHref, status: bookStatus ?? b.book.status } : {})} gold />
          {/* Phase 14: `internal` = MEKI's Gala donation page (reference first); otherwise SDI's form directly (Phase 12B) */}
          <BookingPanel {...b.give} {...(give ? { status: give.status, note: give.note } : {})} {...(give?.href ? (give.internal ? { href: give.href } : { href: give.href, external: true, newTab: b.give.newTab }) : {})} />
        </div>
        {/* Nov 19 2026: SDI-approved website disclosure (exact wording, published by MEKI only after SDI approval). */}
        {disclosure && (
          <p data-reveal data-testid="gala-website-disclosure" className="mt-12 max-w-3xl whitespace-pre-line border-t border-white/15 pt-6 text-sm text-mint-line">
            {disclosure}
          </p>
        )}
      </div>
    </section>
  );
}

/** Item 14: "Follow us" at the end of the Gala page (same accounts as the footer). */
export function GalaFollow({ g, links, newTab }: { g: GalaDict; links: SocialLink[]; newTab: string }) {
  if (!links.some((l) => /^https:\/\//.test(l.url))) return null;
  return (
    <section aria-label={g.follow.title} className="bg-deep-green-3 pb-12 pt-4 text-white">
      <div className="container-x border-t border-white/15 pt-10">
        <p className="mb-5 max-w-xl text-mint-line">{g.follow.text}</p>
        <SocialLinks links={links} title={g.follow.title} newTab={newTab} />
      </div>
    </section>
  );
}
