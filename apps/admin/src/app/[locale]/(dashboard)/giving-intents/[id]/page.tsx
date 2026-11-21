import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { GivingIntentDetailPage } from "@/features/giving/GivingIntentDetailPage";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^[a-z0-9]{10,30}$/.test(id)) notFound();
  return <GivingIntentDetailPage id={id} />;
}
