"use client";

import { useEffect, useState } from "react";
import { Menu, X, Globe, Heart } from "lucide-react";
import type { Dict } from "@/content/en";
import type { Locale } from "@/lib/i18n";
import { Logo } from "./Logo";
import { GiveButton } from "./DonateProvider";

export function Header({ t, locale }: { t: Dict; locale: Locale }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string>("");
  const other = locale === "en" ? "ar" : "en";

  useEffect(() => {
    // Stable sticky header: it never hides; it only switches to a solid surface after scrolling.
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Highlight the section in view.
  useEffect(() => {
    const ids = t.nav.links.map((l) => l.href.slice(1));
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-45% 0px -50% 0px" },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [t.nav.links]);

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
          <a href="#top" aria-label={t.nav.home} className="relative shrink-0">
            <span className={`block transition-opacity duration-500 ${solid ? "opacity-0" : "opacity-100"}`}>
              <Logo variant="white" alt="" />
            </span>
            <span className={`absolute inset-0 transition-opacity duration-500 ${solid ? "opacity-100" : "opacity-0"}`}>
              <Logo variant="green" alt="MEKI" />
            </span>
          </a>

          <nav aria-label="Primary" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {t.nav.links.map((l) => {
                const isActive = active === l.href.slice(1);
                return (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      aria-current={isActive ? "true" : undefined}
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
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            <a
              href={`/${other}`}
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
              {t.nav.links.map((l, i) => (
                <li key={l.href} style={{ animation: `menuIn .5s var(--ease-premium) ${i * 0.04}s both` }}>
                  <a href={l.href} onClick={() => setOpen(false)} className="flex min-h-14 items-center justify-between font-serif text-2xl text-ink">
                    {l.label}
                    <span className="text-sm font-sans text-gold-text">0{i + 1}</span>
                  </a>
                </li>
              ))}
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
