import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { DonationDetailPage } from "@/features/finance/donations/DonationDetailPage";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <Suspense>
      <DonationDetailPage id={id} />
    </Suspense>
  );
}
