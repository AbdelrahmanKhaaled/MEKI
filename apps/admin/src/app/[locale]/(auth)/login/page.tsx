import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { LoginForm } from "@/features/auth/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-deep-green via-deep-green-2 to-deep-green-3 p-4">
      <LoginForm />
    </main>
  );
}
