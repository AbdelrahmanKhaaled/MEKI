import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { DonationsListPage } from "@/features/finance/donations/DonationsListPage";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <Suspense>
      <DonationsListPage />
    </Suspense>
  );
}
