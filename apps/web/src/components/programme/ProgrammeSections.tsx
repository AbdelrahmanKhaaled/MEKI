import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, BadgeCheck, ChevronRight, ClipboardCheck, Landmark, Layers, MapPin, Target } from "lucide-react";
import type { PublicCampaignWithFundraising, PublicCause, PublicCollected, PublicProgress, PublicStatistic } from "@meki/api-client";
import type { Dict } from "@/content/en";
import type { PagesDict } from "@/content/pages";
import { resolveMedia, toMediaRef } from "@/content/media";
import { formatMoney, type Locale } from "@/lib/i18n";
import { Icon } from "../Icon";
import { Pattern, PointsOfLight } from "../Decor";

/**
 * Phase 11A — single programme page sections (server components). Facts come only from approved content (dictionary
 * overlaid with published CMS) and the public detail endpoint; every numeric/fundraising element renders only when the
 * API supplies a verified value. Motion: MotionRoot data-* hooks + Phase 10 p10- classes (reduced-motion safe).
 */

type PD = PagesDict["programDetail"];
type Item = Dict["programmes"]["items"][number];
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
const money = (amount: string, currency: string, locale: Locale) => formatMoney(amount, currency, locale);
const paragraphs = (text: string | null | undefined) => (text ?? "").split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);

export function ProgrammeHero({ item, p, programsHref, stat, locale }: { item: Item; p: PD; programsHref: string; stat?: PublicStatistic; locale: Locale }) {
  const img = resolveMedia(item.image);
  return (
    <section className="relative isolate flex min-h-[86svh] items-end overflow-hidden bg-deep-green text-white">
      <div aria-hidden="true" className="absolute inset-0 -z-20 overflow-hidden">
        <div data-parallax="0.1" className="absolute -inset-[10%]">
          <Image data-hero-image src={img.src} alt="" fill priority sizes="100vw" className="kenburns object-cover" />
        </div>
      </div>
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(7_42_34/0.6)_0%,rgb(7_42_34/0.45)_40%,rgb(7_42_34/0.94)_100%)]" />
      {/* reading-side scrim: keeps the label, title and lead legible over bright photographs (mirrored in RTL) */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-deep-green-3/85 via-deep-green-3/45 to-transparent rtl:bg-gradient-to-l" />
      <Pattern opacity={0.05} className="-z-10" />
      <PointsOfLight count={14} className="-z-10" />
      <div aria-hidden="true" className="spin-slow pointer-events-none absolute -end-40 -top-40 -z-10 hidden size-[560px] rounded-full border border-dashed border-glow/20 lg:block" />
      <div className="container-x w-full pb-16 pt-40 lg:pb-24">
        <nav data-hero-item aria-label="Breadcrumb" className="mb-8 text-sm text-mint-line">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link href={programsHref} className="p10-underline">
                {p.breadcrumb}
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="size-4 rtl:-scale-x-100" />
            </li>
            <li aria-current="page" className="text-white">
              {item.name}
            </li>
          </ol>
        </nav>
        <div className="grid items-end gap-10 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <p data-hero-item className="mb-6 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.24em] text-glow">
              <span className="grid size-10 place-items-center rounded-full bg-white/10 backdrop-blur">
                <Icon name={item.icon} className="size-5" />
              </span>
              {fill(p.label, { n: item.n })}
            </p>
            <h1 data-hero-item className="mb-6 text-[clamp(2.6rem,6.5vw,5.4rem)] leading-[1.02]">
              {item.name}
            </h1>
            <p data-hero-item className="mb-9 max-w-2xl text-lg leading-relaxed text-mint-line sm:text-xl">
              {item.short}
            </p>
            <div data-hero-item className="flex flex-wrap gap-3">
              <a href="#support" className="btn btn-gold min-h-14 px-8 text-base">
                {p.support} <ArrowRight className="btn-arrow size-4" aria-hidden="true" />
              </a>
              <a href="#causes" className="btn btn-outline-light min-h-14 px-7">
                {p.exploreCauses} <ArrowDown className="size-4" aria-hidden="true" />
              </a>
            </div>
          </div>
          {stat && (
            <div data-hero-card className="rounded-[1.75rem] border border-white/15 bg-white/10 p-6 backdrop-blur-md lg:col-span-4">
              <p className="mb-1 font-serif text-5xl text-glow">
                {stat.prefix}
                {/^\d+$/.test(stat.value) ? <span data-count={stat.value}>{Number(stat.value).toLocaleString(locale === "ar" ? "ar-EG-u-nu-latn" : "en-US")}</span> : stat.value}
                {stat.suffix}
              </p>
              <p className="text-mint-line">{stat.label}</p>
              {stat.attribution && <p className="mt-2 text-xs text-mint-line/80">{stat.attribution}</p>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function SectionNav({ items, label }: { items: { id: string; label: string }[]; label: string }) {
  return (
    <nav aria-label={label} className="sticky top-[64px] z-30 border-b border-stone-line bg-paper/90 backdrop-blur-xl lg:top-[68px]">
      <ul className="container-x flex gap-1 overflow-x-auto py-2 [scrollbar-width:none]">
        {items.map((s) => (
          <li key={s.id} className="shrink-0">
            <a href={`#${s.id}`} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold text-body-grey transition-colors hover:bg-limestone hover:text-ink">
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function ProgrammeOverview({ item, t, p, description, image }: { item: Item; t: Dict; p: PD; description: string | null; image?: { url: string; alt: string | null } }) {
  const body = paragraphs(description);
  return (
    <section id="overview" aria-labelledby="overview-title" className="section-y scroll-mt-32 bg-paper">
      <div className="container-x grid items-start gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <p data-reveal className="eyebrow mb-6">
            {p.overview.eyebrow}
          </p>
          <h2 id="overview-title" data-reveal className="headline mb-8">
            {p.overview.title}
          </h2>
          {image && (
            <div data-clip className="relative hidden aspect-[4/5] overflow-hidden rounded-t-[999px] rounded-b-[2rem] shadow-[0_40px_80px_-40px_rgb(11_59_48/0.55)] lg:block">
              <Image src={image.url} alt={image.alt ?? ""} fill sizes="40vw" className="object-cover" />
            </div>
          )}
        </div>
        <div className="space-y-8 lg:col-span-6 lg:col-start-7">
          <blockquote data-reveal className="relative border-s-2 border-harvest-gold ps-6 font-serif text-[clamp(1.35rem,2.4vw,1.85rem)] leading-snug text-ink">
            <span className="mb-2 block font-sans text-xs font-bold uppercase tracking-[0.2em] text-gold-text">{t.programmes.mandateLabel}</span>
            {item.mandate}
          </blockquote>
          {body.length > 0 && (
            <div data-reveal className="space-y-5 text-lg leading-relaxed text-body-grey">
              {body.map((para) => (
                <p key={para.slice(0, 40)}>{para}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ProgressBlock({ progress, p, locale, compact = false }: { progress: PublicProgress & { donations?: number }; p: PD; locale: Locale; compact?: boolean }) {
  const pct = Math.min(Number(progress.percent), 100);
  const label = fill(p.funding.funded, { percent: progress.percent });
  return (
    <div>
      <div
        role="progressbar"
        aria-label={p.funding.progressLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Number(progress.percent)}
        aria-valuetext={`${label} — ${money(progress.collected, progress.currency, locale)} / ${money(progress.goal, progress.currency, locale)}`}
        className={`relative overflow-hidden rounded-full ${compact ? "h-2 bg-stone-line" : "h-3 bg-white/15"}`}
      >
        <span className="absolute inset-y-0 start-0 overflow-hidden rounded-full" style={{ width: `${pct}%` }}>
          <span data-line className="block size-full origin-left bg-gradient-to-r from-harvest-gold to-glow rtl:origin-right" />
        </span>
      </div>
      <p className={`mt-2 text-sm font-bold ${compact ? "text-gold-text" : "text-glow"}`}>{label}</p>
    </div>
  );
}

export function ProgrammeFundraising({ p, locale, fundraising, unavailable }: { p: PD; locale: Locale; fundraising: { goal: { amount: string; currency: string } | null; progress: (PublicProgress & { donations: number }) | null; collected: PublicCollected[] } | null; unavailable: boolean }) {
  const pr = fundraising?.progress ?? null;
  const others = (fundraising?.collected ?? []).filter((c) => c.currency !== pr?.currency && Number(c.net) > 0);
  const collectedNoGoal = !pr ? (fundraising?.collected ?? []).filter((c) => Number(c.net) > 0) : [];
  return (
    <section id="fundraising" aria-labelledby="funding-title" className="section-y relative isolate scroll-mt-32 overflow-hidden bg-deep-green text-white">
      <Pattern opacity={0.05} className="-z-10" />
      <PointsOfLight count={12} className="-z-10" />
      <div aria-hidden="true" className="p10-drift pointer-events-none absolute -bottom-32 -end-32 -z-10 size-96 rounded-full bg-harvest-gold/15 blur-3xl" />
      <div className="container-x">
        <p data-reveal className="eyebrow eyebrow-dark mb-6">
          {p.funding.eyebrow}
        </p>
        <h2 id="funding-title" data-reveal className="headline mb-12 max-w-2xl text-white">
          {p.funding.title}
        </h2>
        {unavailable ? (
          <p data-reveal className="max-w-xl rounded-[1.75rem] border border-white/15 bg-white/5 p-8 text-mint-line">
            {p.funding.unavailable}
          </p>
        ) : pr ? (
          <div data-reveal className="grid gap-10 rounded-[2rem] border border-white/15 bg-white/5 p-7 backdrop-blur-sm sm:p-10 lg:grid-cols-12">
            <dl className="grid gap-6 sm:grid-cols-3 lg:col-span-8">
              {(
                [
                  [p.funding.goal, pr.goal, Target],
                  [p.funding.collected, pr.collected, BadgeCheck],
                  [p.funding.remaining, pr.remaining, Layers],
                ] as const
              ).map(([label, value, IconC]) => (
                <div key={label} className="group">
                  <dt className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-mint-line">
                    <IconC className="size-4 text-glow" aria-hidden="true" /> {label}
                  </dt>
                  <dd className="num font-serif text-[clamp(1.8rem,3.6vw,2.8rem)] leading-none">{money(value, pr.currency, locale)}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-col justify-end lg:col-span-4">
              <ProgressBlock progress={pr} p={p} locale={locale} />
              <p className="mt-1 text-sm text-mint-line">{fill(p.funding.donations, { n: pr.donations })}</p>
            </div>
            {others.length > 0 && (
              <div className="border-t border-white/10 pt-6 lg:col-span-12">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-mint-line">{p.funding.otherCurrencies}</p>
                <ul className="flex flex-wrap gap-x-8 gap-y-2">
                  {others.map((c) => (
                    <li key={c.currency} className="num font-serif text-2xl">
                      {money(c.net, c.currency, locale)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-mint-line/80 lg:col-span-12">{p.funding.note}</p>
          </div>
        ) : (
          <div data-reveal className="grid gap-8 rounded-[2rem] border border-dashed border-glow/30 p-7 sm:p-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <span aria-hidden="true" className="pulse-soft mb-6 block size-3 rounded-full bg-glow shadow-[0_0_24px_6px_rgb(230_195_111/0.4)]" />
              <h3 className="mb-3 text-2xl text-white sm:text-3xl">{p.funding.noGoalTitle}</h3>
              <p className="max-w-xl text-mint-line">{p.funding.noGoalText}</p>
            </div>
            {collectedNoGoal.length > 0 && (
              <dl className="lg:col-span-4 lg:col-start-9">
                <dt className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-mint-line">{p.funding.collected}</dt>
                {collectedNoGoal.map((c) => (
                  <dd key={c.currency} className="num font-serif text-3xl">
                    {money(c.net, c.currency, locale)}
                  </dd>
                ))}
                <dd className="mt-2 text-xs text-mint-line/80">{p.funding.note}</dd>
              </dl>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function CampaignCard({ c, p, locale }: { c: PublicCampaignWithFundraising; p: PD; locale: Locale }) {
  const ref = toMediaRef(c.cover);
  const img = ref ? resolveMedia(ref) : null;
  const pr = c.fundraising.progress;
  return (
    <li className="group p10-lift overflow-hidden rounded-[1.5rem] border border-stone-line bg-paper">
      {img && (
        <div className="p10-zoom relative aspect-[16/10] overflow-hidden">
          <Image src={img.src} alt={c.cover?.alt ?? ""} fill sizes="(min-width:1024px) 30vw, 90vw" className="object-cover" />
          <span className="absolute start-3 top-3 rounded-full bg-paper/90 px-3 py-1 text-xs font-bold text-deep-green">{p.causes.status[c.status]}</span>
        </div>
      )}
      <div className="p-5">
        {!img && <span className="mb-2 inline-block rounded-full bg-limestone px-3 py-1 text-xs font-bold text-deep-green">{p.causes.status[c.status]}</span>}
        <h4 className="mb-2 font-serif text-xl leading-snug">{c.title}</h4>
        {c.summary && <p className="mb-3 text-sm text-body-grey">{c.summary}</p>}
        {c.location && (
          <p className="mb-3 flex items-center gap-1.5 text-xs text-body-grey">
            <MapPin className="size-3.5" aria-hidden="true" /> {c.location}
          </p>
        )}
        {pr ? (
          <div className="border-t border-stone-line pt-3">
            <p className="mb-2 flex justify-between gap-3 text-xs text-body-grey">
              <span>
                {p.causes.raised}: <b className="num text-ink">{money(pr.collected, pr.currency, locale)}</b>
              </span>
              <span>
                {p.causes.target}: <b className="num text-ink">{money(pr.goal, pr.currency, locale)}</b>
              </span>
            </p>
            <ProgressBlock progress={pr} p={{ ...p, funding: { ...p.funding, funded: p.causes.funded } }} locale={locale} compact />
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** First six campaigns visible; the rest behind a native disclosure ("Show all N") — never silently truncated. */
function CampaignList({ items, p, locale }: { items: PublicCampaignWithFundraising[]; p: PD; locale: Locale }) {
  const first = items.slice(0, 6);
  const rest = items.slice(6);
  return (
    <>
      <ul data-stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {first.map((k) => (
          <CampaignCard key={k.slug} c={k} p={p} locale={locale} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="group mt-5">
          <summary className="btn btn-outline min-h-12 cursor-pointer list-none [&::-webkit-details-marker]:hidden">{fill(p.causes.showAll, { n: items.length })}</summary>
          <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((k) => (
              <CampaignCard key={k.slug} c={k} p={p} locale={locale} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

export function ProgrammeCauses({ p, causes, otherCampaigns, locale }: { p: PD; causes: PublicCause[]; otherCampaigns: PublicCampaignWithFundraising[]; locale: Locale }) {
  return (
    <section id="causes" aria-labelledby="causes-title" className="section-y scroll-mt-32 bg-limestone">
      <div className="container-x">
        <div className="mb-14 max-w-2xl">
          <p data-reveal className="eyebrow mb-6">
            {p.causes.eyebrow}
          </p>
          <h2 id="causes-title" data-reveal className="headline mb-4">
            {p.causes.title}
          </h2>
          {causes.length > 0 && (
            <p data-reveal className="text-lg text-body-grey">
              {p.causes.intro}
            </p>
          )}
        </div>
        {causes.length === 0 ? (
          <div data-reveal className="relative isolate overflow-hidden rounded-[2rem] border border-dashed border-gold-text/40 bg-paper/70 p-8 sm:p-12">
            <div aria-hidden="true" className="spin-slow pointer-events-none absolute -end-20 -top-20 -z-10 size-56 rounded-full border border-dashed border-harvest-gold/40" />
            <span aria-hidden="true" className="pulse-soft mb-5 block size-3 rounded-full bg-harvest-gold shadow-[0_0_24px_6px_rgb(214_161_70/0.35)]" />
            <p className="max-w-xl text-lg text-body-grey">{p.causes.empty}</p>
          </div>
        ) : (
          <ol className="space-y-16 lg:space-y-24">
            {causes.map((c, i) => {
              const ref = toMediaRef(c.cover);
              const img = ref ? resolveMedia(ref) : null;
              const flip = i % 2 === 1;
              return (
                <li key={c.slug} id={`cause-${c.slug}`} className="scroll-mt-32">
                  <article className={`grid items-center gap-8 lg:grid-cols-12 lg:gap-12`}>
                    {img && (
                      <div data-clip className={`group p10-zoom relative aspect-[4/3] overflow-hidden rounded-[2rem] shadow-[0_40px_80px_-45px_rgb(11_59_48/0.6)] lg:col-span-6 ${flip ? "lg:order-2" : ""}`}>
                        <Image src={img.src} alt={c.cover?.alt ?? ""} fill sizes="(min-width:1024px) 50vw, 92vw" className="object-cover" />
                        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-deep-green/40 via-transparent to-transparent" />
                      </div>
                    )}
                    <div className={img ? "lg:col-span-6" : "lg:col-span-9"}>
                      <p data-reveal className="mb-3 font-serif text-2xl text-gold-text" aria-hidden="true">
                        {String(i + 1).padStart(2, "0")}
                      </p>
                      <h3 data-reveal className="mb-4 text-[clamp(1.8rem,3.2vw,2.6rem)] leading-tight">
                        {c.name}
                      </h3>
                      {c.location && (
                        <p data-reveal className="mb-4 flex items-center gap-2 text-sm text-body-grey">
                          <MapPin className="size-4 text-meki-green" aria-hidden="true" /> {c.location}
                        </p>
                      )}
                      {c.summary && (
                        <p data-reveal className="mb-4 text-lg text-body-grey">
                          {c.summary}
                        </p>
                      )}
                      {paragraphs(c.description).map((para) => (
                        <p key={para.slice(0, 40)} data-reveal className="mb-3 text-body-grey">
                          {para}
                        </p>
                      ))}
                      {c.campaigns.length > 0 && (
                        <p data-reveal className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-gold-text">
                          {fill(p.causes.campaigns, { n: c.campaigns.length })}
                        </p>
                      )}
                    </div>
                  </article>
                  {c.campaigns.length > 0 && (
                    <div className="mt-8">
                      <CampaignList items={c.campaigns} p={p} locale={locale} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {otherCampaigns.length > 0 && (
          <div className="mt-20">
            <h3 data-reveal className="mb-6 text-2xl">
              {p.causes.otherCampaigns}
            </h3>
            <CampaignList items={otherCampaigns} p={p} locale={locale} />
          </div>
        )}
      </div>
    </section>
  );
}

export function ProgrammeImpact({ item, p, t, stats, locale }: { item: Item; p: PD; t: Dict; stats: PublicStatistic[]; locale: Locale }) {
  return (
    <section id="impact" aria-labelledby="impact-title" className="section-y scroll-mt-32 bg-paper">
      <div className="container-x">
        <div className="mb-12 max-w-2xl">
          <p data-reveal className="eyebrow mb-6">
            {p.impact.eyebrow}
          </p>
          <h2 id="impact-title" data-reveal className="headline">
            {p.impact.title}
          </h2>
        </div>
        <h3 className="sr-only">{p.impact.areas}</h3>
        <ol data-stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {item.themes.map((theme, i) => (
            <li key={theme} data-stagger-item className="group p10-lift relative overflow-hidden rounded-[1.75rem] border border-stone-line bg-paper p-7">
              <span aria-hidden="true" className="absolute -end-10 -top-10 size-32 rounded-full bg-harvest-gold/10 transition-transform duration-700 group-hover:scale-150" />
              <span className="p10-icon relative mb-6 grid size-12 place-items-center rounded-2xl bg-limestone font-serif text-xl text-gold-text">{String(i + 1).padStart(2, "0")}</span>
              <p className="relative font-serif text-2xl leading-snug text-ink">{theme}</p>
            </li>
          ))}
        </ol>
        {stats.length > 0 && (
          <div className="mt-16">
            <h3 data-reveal className="mb-6 text-2xl">
              {p.impact.statsTitle}
            </h3>
            <ul data-stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {stats.map((s) => (
                <li key={s.code} data-stagger-item className="rounded-[1.75rem] bg-deep-green p-7 text-white">
                  <p className="mb-2 font-serif text-5xl text-glow">
                    {s.prefix}
                    {/^\d+$/.test(s.value) ? <span data-count={s.value}>{Number(s.value).toLocaleString(locale === "ar" ? "ar-EG-u-nu-latn" : "en-US")}</span> : s.value}
                    {s.suffix}
                  </p>
                  <p className="mb-2">{s.label}</p>
                  {(s.attribution || s.reportingPeriod) && <p className="text-xs text-mint-line/80">{[s.attribution, s.reportingPeriod].filter(Boolean).join(" · ")}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="sr-only">{t.programmes.themesLabel}</p>
      </div>
    </section>
  );
}

const TRUST_ICONS = [ClipboardCheck, BadgeCheck, Layers, Landmark];

export function ProgrammeHelps({ t, p }: { t: Dict; p: PD }) {
  return (
    <section aria-labelledby="helps-title" className="section-y bg-limestone">
      <div className="container-x grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <p data-reveal className="eyebrow mb-6">
            {p.helps.eyebrow}
          </p>
          <h2 id="helps-title" data-reveal className="headline mb-6">
            {p.helps.title}
          </h2>
          <p data-reveal className="text-lg text-body-grey">
            {p.helps.designation}
          </p>
        </div>
        {/* The four approved trust commitments (shared dictionary / CMS) — no invented impact equations. */}
        <ul data-stagger className="grid gap-4 sm:grid-cols-2 lg:col-span-6 lg:col-start-7">
          {t.trust.map((item, i) => {
            const TI = TRUST_ICONS[i % TRUST_ICONS.length];
            return (
              <li key={item.title} data-stagger-item className="group p10-lift rounded-[1.5rem] border border-stone-line bg-paper p-6">
                <span className="p10-icon mb-4 grid size-11 place-items-center rounded-2xl bg-limestone text-meki-green">
                  <TI className="size-5" strokeWidth={1.6} aria-hidden="true" />
                </span>
                <h3 className="mb-1 font-serif text-xl leading-snug">{item.title}</h3>
                <p className="text-sm text-body-grey">{item.text}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
