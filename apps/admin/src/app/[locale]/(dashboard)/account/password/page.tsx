import { notFound } from "next/navigation";
import { Suspense } from "react";
import { isLocale } from "@/lib/i18n";
import { AccountPasswordPage } from "@/features/account/AccountPasswordPage";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  if (!isLocale((await params).locale)) notFound();
  return <Suspense><AccountPasswordPage /></Suspense>;
}
