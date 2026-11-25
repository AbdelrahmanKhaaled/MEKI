"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays, ChartNoAxesCombined, ChevronsLeft, CircleHelp, CreditCard, FileBarChart, HandCoins, HeartHandshake, Images, Layers, LayoutDashboard, Megaphone, PanelsTopLeft,
  Receipt, Repeat, ScanQrCode, ScrollText, Settings, ShieldCheck, SlidersHorizontal, Ticket, Users, UsersRound, X, House, Menu, ChartColumn, Sparkles, ClipboardList, FileDown, Mail, Settings2, PlugZap, FileSpreadsheet, ListChecks, HandHeart, Scale,
} from "lucide-react";
import { useRef, type ComponentType } from "react";
import { useDialogFocus } from "@/components/common/useDialogFocus";
import { useLocale } from "@/components/common/Providers";
import { useAuth } from "@/features/auth/AuthProvider";
import { visibleNav } from "@/lib/navigation";

const ICONS: Record<string, ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  LayoutDashboard, ChartNoAxesCombined, Layers, HeartHandshake, Megaphone, Users, HandCoins, CreditCard, Repeat, Receipt, CalendarDays, Ticket, UsersRound, ScanQrCode,
  PanelsTopLeft, Images, CircleHelp, SlidersHorizontal, FileBarChart, ShieldCheck, ScrollText, Settings, House, Menu, ChartColumn,
  Sparkles, ClipboardList, FileDown, Mail, Settings2, PlugZap, FileSpreadsheet, ListChecks, HandHeart, Scale,
};

/**
 * Dark-green grouped navigation. Items come from lib/navigation (permission-filtered); modules without a route are rendered as
 * disabled "Soon" entries — never as links to empty pages. Collapsible on desktop, drawer on mobile.
 */
export function Sidebar({ collapsed, onToggle, mobileOpen, onClose }: { collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onClose: () => void }) {
  const { locale, t, rtl } = useLocale();
  const { user } = useAuth();
  const path = usePathname();
  const groups = visibleNav(user);
  const drawer = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  useDialogFocus(mobileOpen, drawer, onClose, closeBtn); // mobile drawer: focus in, Tab trap, Escape, focus back to the menu button
  const activeHref = groups
    .flatMap((g) => g.items)
    .map((i) => (i.href ? `/${locale}${i.href}` : ""))
    .filter((h) => h && (path === h || path.startsWith(`${h}/`)))
    .sort((a, b) => b.length - a.length)[0];

  const body = (narrow: boolean) => (
    <nav aria-label={t.brand} className="flex h-full flex-col">
      <div className={`flex h-16 shrink-0 items-center ${narrow ? "justify-center" : "justify-between px-5"}`}>
        <Link href={`/${locale}/dashboard`} aria-label={t.brand} className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- approved MEKI logo files (23 Nov 2026), never re-drawn */}
          <img src={narrow ? "/brand/MEKI_Icon_Approved_White_128.png" : "/brand/MEKI_Secondary_White.png"} alt="MEKI" width={narrow ? 32 : 1200} height={narrow ? 32 : 365} className={narrow ? "h-8 w-8" : "h-auto w-[150px]"} />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {groups.map((g) => (
          <div key={g.key} className="mt-5">
            {!narrow && <p className="mb-2 px-3 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-mint/70">{t.nav.groups[g.key as keyof typeof t.nav.groups]}</p>}
            {narrow && <div className="mx-3 mb-2 h-px bg-white/10" />}
            <ul className="space-y-1">
              {g.items.map((item) => {
                const Icon = ICONS[item.icon] ?? Layers;
                const label = t.nav.items[item.key];
                const href = item.href ? `/${locale}${item.href}` : null;
                const active = !!href && href === activeHref; // detail pages keep their section active (longest matching entry wins)
                const base = `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${narrow ? "justify-center" : ""}`;
                return (
                  <li key={item.key}>
                    {href ? (
                      <Link href={href} aria-current={active ? "page" : undefined} title={narrow ? label : undefined} onClick={onClose} className={`${base} ${active ? "bg-white/12 text-white" : "text-mint hover:bg-white/8 hover:text-white"}`}>
                        {active && <span className="absolute inset-y-2 start-0 w-1 rounded-full bg-harvest-gold" aria-hidden="true" />}
                        <Icon className="size-5 shrink-0" aria-hidden />
                        {!narrow && <span className="truncate">{label}</span>}
                      </Link>
                    ) : (
                      <span aria-disabled="true" title={narrow ? `${label} — ${t.nav.soon}` : undefined} className={`${base} cursor-not-allowed text-mint/45`}>
                        <Icon className="size-5 shrink-0" aria-hidden />
                        {!narrow && (
                          <>
                            <span className="flex-1 truncate">{label}</span>
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-mint/70">{t.nav.soon}</span>
                          </>
                        )}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <button type="button" onClick={onToggle} aria-label={collapsed ? t.nav.expand : t.nav.collapse} className="mx-3 mb-4 hidden items-center justify-center rounded-xl border border-white/15 py-2 text-mint hover:bg-white/8 lg:flex">
        <ChevronsLeft className={`size-5 transition-transform ${collapsed !== rtl ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
    </nav>
  );

  return (
    <>
      <aside className={`sticky top-0 hidden h-screen shrink-0 bg-deep-green transition-[width] duration-300 motion-reduce:transition-none lg:block ${collapsed ? "w-20" : "w-72"}`}>{body(collapsed)}</aside>
      {mobileOpen && (
        <div ref={drawer} className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t.brand}>
          <div className="absolute inset-0 bg-deep-green-3/60" onClick={onClose} aria-hidden="true" />
          <aside className="absolute inset-y-0 start-0 w-72 max-w-[85vw] bg-deep-green shadow-[var(--shadow-pop)]">
            <button ref={closeBtn} type="button" onClick={onClose} aria-label={t.nav.closeMenu} className="absolute end-3 top-4 rounded-lg p-1 text-mint hover:bg-white/10">
              <X className="size-5" aria-hidden="true" />
            </button>
            {body(false)}
          </aside>
        </div>
      )}
    </>
  );
}
