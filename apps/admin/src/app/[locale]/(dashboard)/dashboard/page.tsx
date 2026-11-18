import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { DashboardRoute } from "@/features/dashboard/DashboardRoute";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <DashboardRoute />;
}
