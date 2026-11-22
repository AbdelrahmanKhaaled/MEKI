"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useLocale } from "@/components/common/Providers";
import { Field, inputCls } from "@/components/content/ui";
import { Notice, useErrorText } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { ApiError } from "@/lib/api";
import { accountAr, accountEn } from "@/lib/i18n-account";
import { changePassword, passwordProblems } from "@/services/users";

/**
 * Own password change (POST /admin/auth/password/change — allowed while a change is pending). Used in two places:
 *  - forced: AppShell renders it instead of any page while `mustChangePassword` is set (first sign-in with a temporary
 *    password from `admin:bootstrap`, a reset, or a user created in Users & Roles);
 *  - voluntary: /account/password.
 * The API enforces the policy and revokes the account's other sessions; this form only guides.
 */
export function ChangePasswordForm({ forced = false }: { forced?: boolean }) {
  const { locale } = useLocale();
  const c = (locale === "ar" ? accountAr : accountEn).password;
  const { user, refresh } = useAuth();
  const fallback = useErrorText();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const problems = next ? passwordProblems(next, user?.email) : [];
  const localError = !next ? null : problems.includes("short") ? c.tooShort : problems.length ? c.errors.WEAK_PASSWORD : repeat && repeat !== next ? c.mismatch : next === current ? c.same : null;
  const ready = !!current && !!next && repeat === next && !localError && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      setDone(true);
      setCurrent("");
      setNext("");
      setRepeat("");
      await refresh(); // clears mustChangePassword → AppShell shows the requested page
    } catch (err) {
      setError((err instanceof ApiError && c.errors[err.code]) || fallback(err));
    } finally {
      setBusy(false);
    }
  }

  const pw = (label: string, value: string, set: (v: string) => void, autoComplete: string, err?: string | null) => (
    <Field label={label} error={err} required>
      {(id, d) => (
        <input id={id} type="password" value={value} onChange={(e) => set(e.target.value)} autoComplete={autoComplete} maxLength={128} required aria-required aria-invalid={!!err} aria-describedby={d} className={inputCls} dir="ltr" />
      )}
    </Field>
  );

  return (
    <section className="card mx-auto max-w-xl p-6" aria-labelledby="pw-title" data-testid={forced ? "forced-password-change" : "password-change"}>
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-meki-green/10 text-meki-green-dark"><KeyRound className="size-5" aria-hidden="true" /></span>
        <h1 id="pw-title" className="text-xl font-bold text-ink">{forced ? c.forcedTitle : c.title}</h1>
      </div>
      <Notice tone={forced ? "warn" : "info"}>{forced ? c.forced : c.voluntary}</Notice>
      <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
        {pw(c.current, current, setCurrent, "current-password")}
        {pw(c.next, next, setNext, "new-password", next && localError !== c.mismatch ? localError : null)}
        {pw(c.confirm, repeat, setRepeat, "new-password", repeat && repeat !== next ? c.mismatch : null)}
        <p className="text-xs text-muted">{c.policy}</p>
        {error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        {done && !forced && <p role="status" className="rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">{c.done}</p>}
        <button type="submit" className="btn-admin btn-primary" disabled={!ready} aria-disabled={!ready}>
          {busy ? c.submitting : c.submit}
        </button>
      </form>
    </section>
  );
}
