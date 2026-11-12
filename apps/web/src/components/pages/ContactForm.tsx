"use client";

import { useId, useState } from "react";
import { Mail } from "lucide-react";
import type { PagesDict } from "@/content/pages";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const field =
  "min-h-12 w-full rounded-xl border border-stone-line bg-paper px-4 text-ink transition focus:border-meki-green focus:outline-none focus:shadow-[0_0_0_4px_rgb(0_128_102/0.12)] disabled:cursor-not-allowed disabled:opacity-60";

type Values = { name: string; email: string; subject: string; message: string; consent: boolean };

function TextField({ id, label, type = "text", auto, value, error, disabled, max, onChange }: { id: string; label: string; type?: string; auto?: string; value: string; error?: string; disabled: boolean; max: number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-ink">
        {label}
      </label>
      <input id={id} type={type} autoComplete={auto} value={value} onChange={onChange} disabled={disabled} maxLength={max} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-e` : undefined} className={field} />
      {error && (
        <p id={`${id}-e`} role="alert" className="mt-1 text-sm font-bold text-[#8a0019]">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * There is no contact-submission endpoint yet, so this form never claims to send anything. With an official
 * published email it validates, then opens the visitor's own email app (mailto:). Without one it is disabled.
 */
export function ContactForm({ c, to }: { c: PagesDict["contact"]; to: string | null }) {
  const id = useId();
  const [v, setV] = useState<Values>({ name: "", email: "", subject: "", message: "", consent: false });
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [done, setDone] = useState(false);
  const disabled = !to;
  const on = (k: "name" | "email" | "subject" | "message") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!to) return;
    const err: Partial<Record<keyof Values, string>> = {};
    if (!v.name.trim()) err.name = c.required;
    if (!EMAIL.test(v.email.trim())) err.email = c.invalidEmail;
    if (!v.subject.trim()) err.subject = c.required;
    if (!v.message.trim()) err.message = c.required;
    if (!v.consent) err.consent = c.required;
    setErrors(err);
    if (Object.keys(err).length) return;
    const body = `${v.message.trim()}\n\n— ${v.name.trim()} (${v.email.trim()})`;
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(v.subject.trim())}&body=${encodeURIComponent(body)}`;
    setDone(true);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <TextField id={`${id}-name`} label={c.name} auto="name" value={v.name} error={errors.name} disabled={disabled} max={120} onChange={on("name")} />
      <TextField id={`${id}-email`} label={c.emailField} type="email" auto="email" value={v.email} error={errors.email} disabled={disabled} max={254} onChange={on("email")} />
      <TextField id={`${id}-subject`} label={c.subject} value={v.subject} error={errors.subject} disabled={disabled} max={150} onChange={on("subject")} />
      <div>
        <label htmlFor={`${id}-message`} className="mb-1.5 block text-sm font-bold text-ink">
          {c.message}
        </label>
        <textarea id={`${id}-message`} rows={6} value={v.message} onChange={on("message")} disabled={disabled} maxLength={4000} aria-invalid={errors.message ? true : undefined} aria-describedby={errors.message ? `${id}-message-e` : undefined} className={`${field} py-3`} />
        {errors.message && (
          <p id={`${id}-message-e`} role="alert" className="mt-1 text-sm font-bold text-[#8a0019]">
            {errors.message}
          </p>
        )}
      </div>
      <div>
        <label className="flex items-start gap-3 text-sm text-body-grey">
          <input type="checkbox" checked={v.consent} onChange={(e) => setV((p) => ({ ...p, consent: e.target.checked }))} disabled={disabled} className="mt-1 size-5 accent-[#008066]" aria-invalid={errors.consent ? true : undefined} />
          <span>{c.consent}</span>
        </label>
        {errors.consent && (
          <p role="alert" className="mt-1 text-sm font-bold text-[#8a0019]">
            {errors.consent}
          </p>
        )}
      </div>
      <button type="submit" disabled={disabled} className="btn btn-green min-h-14 px-8 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0">
        <Mail className="size-4" aria-hidden="true" /> {c.submit}
      </button>
      <p role="status" className="text-sm text-body-grey">
        {disabled ? c.formUnavailable : done ? c.opened : ""}
      </p>
    </form>
  );
}
