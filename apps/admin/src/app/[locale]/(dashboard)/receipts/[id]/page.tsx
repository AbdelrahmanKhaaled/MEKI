import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { ReceiptDetailPage } from "@/features/finance/receipts/ReceiptDetailPage";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <Suspense>
      <ReceiptDetailPage id={id} />
    </Suspense>
  );
}
