"use client";

import { useLocale } from "@/components/common/Providers";
import { FinancePage } from "@/features/finance/FinancePage";
import { accountAr, accountEn } from "@/lib/i18n-account";
import { ChangePasswordForm } from "./ChangePasswordForm";

/** Voluntary own-password change (any signed-in admin). The forced variant is rendered by AppShell. */
export function AccountPasswordPage() {
  const { locale, t } = useLocale();
  const c = (locale === "ar" ? accountAr : accountEn).password;
  return (
    <FinancePage crumbs={[{ label: t.header.profile }, { label: c.title }]} anyOf={[]}>
      <ChangePasswordForm />
    </FinancePage>
  );
}
