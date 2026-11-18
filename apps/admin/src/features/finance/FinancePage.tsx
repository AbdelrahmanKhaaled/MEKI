"use client";

import { useSearchParams } from "next/navigation";
import { Lock, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useLocale } from "@/components/common/Providers";
import { EmptyState } from "@/components/common/States";
import { useAuth } from "@/features/auth/AuthProvider";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Authenticated finance page: AppShell (sidebar/header/breadcrumbs from Phase 6A) + a permission gate. The gate is UX only —
 * every request is authorised again by the API, and a 403 from the API is rendered as "no access" by the widgets.
 */
export function FinancePage({ crumbs, anyOf, children }: { crumbs: Crumb[]; anyOf: string[]; children: React.ReactNode }) {
  const { locale, t } = useLocale();
  const { user, can } = useAuth();
  const all: Crumb[] = [{ label: t.breadcrumbs.home, href: `/${locale}/dashboard` }, ...crumbs];
  return (
    <AppShell crumbs={all}>
      {user?.mustChangePassword ? (
        <EmptyState icon={ShieldAlert} text={t.login.errors.forbidden} minH="min-h-80" />
      ) : !can(...anyOf) ? (
        <EmptyState icon={Lock} text={t.fin.common.noAccess} minH="min-h-80" />
      ) : (
        <div className="space-y-6">{children}</div>
      )}
    </AppShell>
  );
}

/** Locale-prefixed admin href. */
export const useHref = () => {
  const { locale } = useLocale();
  return (path: string) => `/${locale}${path}`;
};

/**
 * Link from a filtered list to a detail page that remembers the list's filters (`?back=<list query>`), so "Back" returns to
 * the same filtered page. Only a query string is carried; the path is always fixed by the caller (no open redirect).
 */
export const useDetailHref = () => {
  const href = useHref();
  const params = useSearchParams();
  const q = new URLSearchParams(params.toString());
  q.delete("back");
  const s = q.toString();
  return (path: string) => `${href(path)}${s ? `?back=${encodeURIComponent(s)}` : ""}`;
};

/** Back link of a detail page: the fixed list path plus the remembered (re-serialised) list query, if any. */
export const useBackHref = (listPath: string, fallbackQuery = "") => {
  const href = useHref();
  const back = useSearchParams().get("back");
  const q = new URLSearchParams(back ?? fallbackQuery);
  q.delete("back");
  const s = q.toString();
  return `${href(listPath)}${s ? `?${s}` : ""}`;
};
