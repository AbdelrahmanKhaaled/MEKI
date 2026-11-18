"use client";

import { useEffect, useState } from "react";
import { Menu, X, Globe, Heart } from "lucide-react";
import type { Dict } from "@/content/en";
import type { Locale } from "@/lib/i18n";
import { Logo } from "./Logo";
import { GiveButton } from "./DonateProvider";
import { NAV_ORDER, PAGE_PATH, getPages, pageHref, resolveMenu, type PageKey } from "@/content/pages";

export function Header({ t, locale, current = "home" }: { t: Dict; locale: Locale; current?: PageKey }) {
  const pages = getPages(locale);
  // CMS-managed menu when a valid one is published (Phase 6D), otherwise the built-in page list
  const links = resolveMenu(t.nav.links, locale) ?? NAV_ORDER.map((k) => ({ key: k, href: pageHref(locale, k), label: pages.nav[k], external: false }));
  const galaActive = current === "gala";
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const other = locale === "en" ? "ar" : "en";

  useEffect(() => {
    // Stable sticky header: it never hides; it only switches to a solid surface after scrolling.
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const solid = scrolled || open;

  return (
    <>
      <a href="#main" className="sr-only z-[100] rounded-full bg-paper px-4 py-2 font-bold focus:not-sr-only focus:fixed focus:start-4 focus:top-4">
        {t.nav.skip}
      </a>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,padding] duration-500 ease-[var(--ease-premium)] ${solid ? "bg-paper/90 py-2.5 shadow-[0_1px_0_var(--color-stone-line),0_10px_30px_-20px_rgb(19_36_31/0.4)] backdrop-blur-xl" : "bg-transparent py-5"}`}
      >
        <div className="container-x flex items-center justify-between gap-6">
          <a href={pageHref(locale, "home")} aria-label={t.nav.home} className="relative shrink-0">
            <span className={`block transition-opacity duration-500 ${solid ? "opacity-0" : "opacity-100"}`}>
              <Logo variant="white" alt="" />
            </span>
            <span className={`absolute inset-0 transition-opacity duration-500 ${solid ? "opacity-100" : "opacity-0"}`}>
              <Logo variant="green" alt="MEKI" />
            </span>
          </a>

          <nav aria-label="Primary" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {links.map((l) => {
                const isActive = current === l.key;
                return (
                  <li key={l.key}>
                    <a
                      href={l.href}
                      {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      aria-current={isActive ? "page" : undefined}
                      className={`group relative inline-flex min-h-11 items-center px-3 text-[0.92rem] font-bold transition-colors ${
                        solid ? "text-ink hover:text-meki-green" : "text-white/90 hover:text-glow"
                      }`}
                    >
                      {l.label}
                      <span
                        className={`absolute inset-x-3 bottom-2 h-px origin-left bg-harvest-gold rtl:origin-right transition-transform duration-500 ease-[var(--ease-premium)] ${
                          isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                        }`}
                      />
                    </a>
                  </li>
                );
              })}
              <li>
                <a
                  href={t.nav.gala.href}
                  aria-current={galaActive ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-full border px-4 text-[0.92rem] font-bold transition-colors ${
                    solid ? "border-harvest-gold text-gold-text hover:bg-harvest-gold/15" : "border-glow/70 text-glow hover:bg-white/10"
                  }`}
                >
                  {t.nav.gala.label}
                </a>
              </li>
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            <a
              href={`/${other}${PAGE_PATH[current]}`}
              hrefLang={other}
              lang={other}
              aria-label={t.nav.languageLabel}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-bold transition-colors ${
                solid ? "text-ink hover:bg-limestone" : "text-white hover:bg-white/10"
              }`}
            >
              <Globe className="size-4" strokeWidth={1.6} aria-hidden="true" />
              <span>{t.nav.language}</span>
            </a>
            <GiveButton className="btn btn-gold hidden min-h-11 sm:inline-flex">
              <Heart className="size-4" strokeWidth={1.8} aria-hidden="true" />
              {t.nav.donate}
            </GiveButton>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? t.nav.close : t.nav.menu}
              className={`grid size-11 place-items-center rounded-full lg:hidden ${solid ? "text-ink hover:bg-limestone" : "text-white hover:bg-white/10"}`}
            >
              {open ? <X className="size-6" /> : <Menu className="size-6" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <div
          id="mobile-menu"
          hidden={!open}
          className="lg:hidden"
        >
          <nav aria-label="Mobile" className="container-x pb-8 pt-4">
            <ul className="divide-y divide-stone-line border-y border-stone-line">
              {links.map((l, i) => (
                <li key={l.key} style={{ animation: `menuIn .5s var(--ease-premium) ${i * 0.04}s both` }}>
                  <a href={l.href} {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})} aria-current={current === l.key ? "page" : undefined} onClick={() => setOpen(false)} className="flex min-h-14 items-center justify-between font-serif text-2xl text-ink">
                    {l.label}
                    <span className="text-sm font-sans text-gold-text">0{i + 1}</span>
                  </a>
                </li>
              ))}
              <li>
                <a href={t.nav.gala.href} onClick={() => setOpen(false)} className="flex min-h-14 items-center justify-between font-serif text-2xl text-gold-text">
                  {t.nav.gala.label}
                  <span className="text-sm font-sans">✦</span>
                </a>
              </li>
            </ul>
            <GiveButton className="btn btn-gold mt-6 w-full">
              <Heart className="size-4" aria-hidden="true" /> {t.nav.donate}
            </GiveButton>
          </nav>
        </div>
      </header>
    </>
  );
}
