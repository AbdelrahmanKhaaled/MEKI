import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { ProgramEditorPage } from "@/features/content/programs/ProgramEditorPage";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <Suspense>
      <ProgramEditorPage id={id} />
    </Suspense>
  );
}
