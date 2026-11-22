"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, Globe, LogOut, Menu, UserRound } from "lucide-react";
import { useLocale } from "@/components/common/Providers";
import { Dropdown } from "@/components/common/Dropdown";
import { Modal } from "@/components/common/Modal";
import { useAuth } from "@/features/auth/AuthProvider";

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  const { rtl } = useLocale();
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-1.5 text-sm text-muted">
        {items.map((it, i) => (
          <li key={it.label} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className={`size-4 ${rtl ? "rotate-180" : ""}`} aria-hidden="true" />}
            {it.href ? (
              <Link href={it.href} className="hover:text-ink">
                {it.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-bold text-ink">
                {it.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Header({ onMenu, crumbs }: { onMenu: () => void; crumbs: { label: string; href?: string }[] }) {
  const { locale, t } = useLocale();
  const { user, signOut } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const other = locale === "en" ? "ar" : "en";
  const otherHref = path.replace(/^\/(en|ar)(?=\/|$)/, `/${other}`);
  const initials = (user?.name ?? "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6">
      <button type="button" onClick={onMenu} aria-label={t.nav.openMenu} className="rounded-lg p-2 text-ink hover:bg-bg lg:hidden">
        <Menu className="size-5" aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1 truncate">
        <Breadcrumbs items={crumbs} />
      </div>
      <Link href={otherHref} hrefLang={other} lang={other} className="btn-admin btn-ghost !min-h-9 !px-3" aria-label={t.header.language}>
        <Globe className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">{t.header.language}</span>
      </Link>
      <Dropdown
        label={t.header.profile}
        trigger={
          <span className="flex items-center gap-2 rounded-xl border border-line py-1 ps-1 pe-3 hover:border-meki-green">
            <span className="grid size-8 place-items-center rounded-full bg-deep-green text-xs font-bold text-white" aria-hidden="true">{initials || <UserRound className="size-4" />}</span>
            <span className="hidden max-w-32 truncate text-sm font-bold text-ink sm:inline">{user?.name}</span>
          </span>
        }
        items={[
          { key: "password", label: t.header.changePassword, onSelect: () => router.push(`/${locale}/account/password`) },
          { key: "out", label: t.header.signOut, onSelect: () => setConfirm(true) },
        ]}
      />
      <Modal
        open={confirm}
        title={t.header.signOut}
        closeLabel={t.header.cancel}
        onClose={() => !busy && setConfirm(false)}
        footer={
          <>
            <button type="button" className="btn-admin btn-ghost" disabled={busy} onClick={() => setConfirm(false)}>
              {t.header.cancel}
            </button>
            <button
              type="button"
              className="btn-admin btn-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await signOut();
                } finally {
                  setBusy(false);
                  setConfirm(false);
                }
              }}
            >
              <LogOut className="size-4" aria-hidden="true" /> {busy ? t.header.signingOut : t.header.signOut}
            </button>
          </>
        }
      >
        <p>{t.header.confirmSignOut}</p>
        {user && (
          <p className="mt-3 text-xs text-muted">
            <bdi>{user.email}</bdi> · {t.header.roles}: <bdi>{user.roles.join(", ")}</bdi>
          </p>
        )}
      </Modal>
    </header>
  );
}
