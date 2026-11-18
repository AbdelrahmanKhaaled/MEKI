"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useLocale } from "@/components/common/Providers";
import { useAuth } from "./AuthProvider";

/** Uses POST /admin/auth/login exactly as the API defines it (cookie session). The password is never stored or logged. */
export function LoginForm() {
  const { locale, t } = useLocale();
  const { status, signIn } = useAuth();
  const router = useRouter();
  const l = t.login;
  const id = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") router.replace(`/${locale}/dashboard`);
  }, [status, locale, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      router.replace(`/${locale}/dashboard`);
    } catch (err) {
      const s = err instanceof ApiError ? err.status : 0;
      setError(s === 401 ? l.errors.invalid : s === 429 ? l.errors.locked : s === 0 ? l.errors.network : l.errors.unknown);
      setBusy(false);
    }
  }

  const input = "min-h-12 w-full rounded-xl border border-line bg-white px-4 text-base outline-none focus:border-meki-green focus:ring-2 focus:ring-meki-green/25";
  return (
    <form onSubmit={submit} noValidate className="w-full max-w-md space-y-5 rounded-2xl border border-line bg-white p-8 shadow-[var(--shadow-pop)]">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- official brand mark */}
        <img src="/brand/MEKI_Icon_Green.svg" alt="MEKI" className="mx-auto mb-4 h-12 w-12" />
        <h1 className="text-3xl text-deep-green">{l.title}</h1>
        <p className="mt-1 text-sm text-muted">{l.subtitle}</p>
      </div>
      <div>
        <label htmlFor={`${id}-e`} className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-body">{l.email}</label>
        <input id={`${id}-e`} type="email" autoComplete="username" required dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
      </div>
      <div>
        <label htmlFor={`${id}-p`} className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-body">{l.password}</label>
        <input id={`${id}-p`} type="password" autoComplete="current-password" required dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy || !email || !password} className="btn-admin btn-primary min-h-12 w-full justify-center disabled:opacity-60">
        <LogIn className="size-4" aria-hidden="true" /> {busy ? l.submitting : l.submit}
      </button>
      <p className="text-center text-xs text-muted">{l.note}</p>
    </form>
  );
}
