import Link from "next/link";
import { Logo } from "@/components/Logo";
import { en } from "@/content/en";

export default function NotFound() {
  const t = en.notFound;
  return (
    <main className="grid min-h-screen place-items-center bg-deep-green px-6 text-center text-white">
      <div>
        <Logo variant="white" className="mx-auto mb-10" />
        <p className="mb-4 font-serif text-7xl font-light text-glow">404</p>
        <h1 className="mb-4 text-4xl">{t.title}</h1>
        <p className="mb-10 text-mint-line">{t.text}</p>
        <Link href="/en" className="btn btn-gold">
          {t.back}
        </Link>
      </div>
    </main>
  );
}
