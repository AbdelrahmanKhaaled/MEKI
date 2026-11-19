/**
 * Planned navigation (docs/24). `href` exists only for modules that are really implemented; everything else is an
 * "upcoming module" and renders disabled — it never pretends to have a page or data.
 * Permissions are the backend's own keys; they only drive what the UI shows — the API remains the authority.
 */
import type { AuthUser } from "./schemas.ts";

export interface NavItem {
  key: string;
  icon: string; // lucide icon name, resolved in the component layer
  /** implemented route (without locale prefix); absent = upcoming module */
  href?: string;
  /** visible when the user holds ANY of these (empty = any signed-in admin) */
  anyOf?: string[];
}
export interface NavGroup {
  key: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  { key: "overview", items: [{ key: "dashboard", icon: "LayoutDashboard", href: "/dashboard" }, { key: "analytics", icon: "ChartNoAxesCombined", anyOf: ["reports.read"] }] },
  {
    key: "programs",
    items: [
      { key: "programs", icon: "Layers", href: "/programs", anyOf: ["programmes.read"] },
      { key: "causes", icon: "HeartHandshake", href: "/causes", anyOf: ["programmes.read"] },
      { key: "campaigns", icon: "Megaphone", href: "/campaigns", anyOf: ["campaigns.read"] },
    ],
  },
  {
    key: "donors",
    items: [
      // Phase 6B: implemented. The permission list is what the page's own endpoints require (payments: transactions/events/
      // providers need payments.read, refunds list/detail need donations.read).
      { key: "donorList", icon: "Users", href: "/donors", anyOf: ["donors.read"] },
      { key: "donations", icon: "HandCoins", href: "/donations", anyOf: ["donations.read"] },
      { key: "payments", icon: "CreditCard", href: "/payments", anyOf: ["payments.read", "donations.read"] },
      // Phase 8A: SDI / Zeffy provider payments (read model + reconciliation) — payments.read; actions need payments.manage
      { key: "sdiZeffy", icon: "PlugZap", href: "/payments/zeffy", anyOf: ["payments.read"] },
      // Phase 12: SDI daily report import + reconciliation (upload/preview: sdi.reports.upload; apply: sdi.reports.approve)
      { key: "sdiReconciliation", icon: "FileSpreadsheet", href: "/payments/sdi-reconciliation", anyOf: ["sdi.reports.upload"] },
      { key: "recurring", icon: "Repeat", href: "/recurring", anyOf: ["recurring.read"] },
      { key: "receipts", icon: "Receipt", href: "/receipts", anyOf: ["receipts.read"] },
    ],
  },
  {
    key: "events",
    items: [
      { key: "events", icon: "CalendarDays", anyOf: ["events.read"] },
      // Phase 6E: Gala Night operations (the existing Phase 5B ticketing API; each page needs its endpoint's own permission)
      { key: "galaOverview", icon: "Sparkles", href: "/gala", anyOf: ["gala.bookings.read"] },
      { key: "bookings", icon: "ClipboardList", href: "/gala/bookings", anyOf: ["gala.bookings.read"] },
      { key: "guests", icon: "UsersRound", href: "/gala/guests", anyOf: ["gala.guests.read"] },
      // Phase 12: SDI attendee list (operational; Zeffy issues tickets/QR codes — not proof of payment)
      { key: "sdiAttendees", icon: "ListChecks", href: "/gala/sdi-attendees", anyOf: ["gala.guests.read"] },
      { key: "tickets", icon: "Ticket", href: "/gala/tickets", anyOf: ["gala.tickets.read"] },
      { key: "checkin", icon: "ScanQrCode", href: "/gala/check-in", anyOf: ["gala.checkin.validate"] },
      { key: "galaExports", icon: "FileDown", href: "/gala/exports", anyOf: ["gala.guests.export"] },
      { key: "galaComms", icon: "Mail", href: "/gala/communications", anyOf: ["gala.bookings.read"] },
      { key: "galaSettings", icon: "Settings2", href: "/gala/settings", anyOf: ["gala.bookings.read"] },
    ],
  },
  {
    key: "website",
    items: [
      // Phase 6D: website CMS (homepage + menus are sections of the "home" CMS page → content.*)
      { key: "homepage", icon: "House", href: "/homepage", anyOf: ["content.read"] },
      { key: "pages", icon: "PanelsTopLeft", href: "/pages", anyOf: ["content.read"] },
      { key: "menus", icon: "Menu", href: "/menus", anyOf: ["content.read"] },
      { key: "media", icon: "Images", href: "/media", anyOf: ["media.read"] },
      { key: "faqs", icon: "CircleHelp", href: "/faqs", anyOf: ["faq.read"] },
      { key: "statistics", icon: "ChartColumn", href: "/statistics", anyOf: ["statistics.read"] },
      { key: "siteSettings", icon: "SlidersHorizontal", href: "/settings/site", anyOf: ["settings.read"] },
    ],
  },
  {
    key: "admin",
    items: [
      { key: "reports", icon: "FileBarChart", anyOf: ["reports.read"] },
      { key: "users", icon: "ShieldCheck", anyOf: ["users.read", "roles.read"] },
      { key: "audit", icon: "ScrollText", anyOf: ["audit.read"] },
      { key: "settings", icon: "Settings", anyOf: ["settings.read"] },
    ],
  },
];

export const can = (user: Pick<AuthUser, "permissions" | "isSuperAdmin"> | null | undefined, ...anyOf: string[]) =>
  !!user && (anyOf.length === 0 || user.isSuperAdmin || anyOf.some((p) => user.permissions.includes(p)));

/** Groups/items the user may see; empty groups disappear. Upcoming (no href) items are still listed, flagged by the UI. */
export function visibleNav(user: Pick<AuthUser, "permissions" | "isSuperAdmin"> | null | undefined): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(user, ...(i.anyOf ?? []))) })).filter((g) => g.items.length > 0);
}

/** Door staff (only gala.checkin.validate) get no finance overview: their landing page points to the scanner (/gala/check-in). */
export const isDoorStaffOnly = (user: Pick<AuthUser, "permissions" | "isSuperAdmin"> | null | undefined) =>
  !!user && !user.isSuperAdmin && user.permissions.length > 0 && user.permissions.every((p) => p === "gala.checkin.validate");
