"use client";

import Link from "next/link";
import { ScanQrCode, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useLocale } from "@/components/common/Providers";
import { EmptyState } from "@/components/common/States";
import { useAuth } from "@/features/auth/AuthProvider";
import { isDoorStaffOnly } from "@/lib/navigation";
import { DashboardPage } from "./DashboardPage";

/** Dashboard route: breadcrumbs, role-aware landing (door staff get a link to the scanner instead of the finance overview), forced-password-change guard. */
export function DashboardRoute() {
  const { locale, t } = useLocale();
  const { user } = useAuth();
  const crumbs = [{ label: t.breadcrumbs.home, href: `/${locale}/dashboard` }, { label: t.dashboard.title }];
  return (
    <AppShell crumbs={crumbs}>
      {user?.mustChangePassword ? (
        <EmptyState icon={ShieldAlert} text={t.login.errors.forbidden} minH="min-h-80" />
      ) : isDoorStaffOnly(user) ? (
        <div className="card grid min-h-80 place-items-center p-6 text-center">
          <div className="space-y-4">
            <ScanQrCode className="mx-auto size-12 text-meki-green-dark" aria-hidden="true" />
            <Link href={`/${locale}/gala/check-in`} className="btn-admin btn-primary">{t.nav.items.checkin}</Link>
          </div>
        </div>
      ) : (
        <DashboardPage />
      )}
    </AppShell>
  );
}
