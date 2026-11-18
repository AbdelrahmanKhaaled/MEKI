"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLocale } from "@/components/common/Providers";
import { Skeleton } from "@/components/common/States";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

const COLLAPSE_KEY = "meki-admin:sidebar-collapsed"; // a UI preference only, nothing sensitive

/** Authenticated layout. Redirects to the login page when there is no session (the API remains the authority on every call). */
export function AppShell({ crumbs, children }: { crumbs: { label: string; href?: string }[]; children: React.ReactNode }) {
  const { status } = useAuth();
  const { locale, t } = useLocale();
  const router = useRouter();
  // Read once at first render. The server markup is the loading skeleton (no sidebar), so there is nothing to mismatch.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    if (status === "anonymous") router.replace(`/${locale}/login`);
  }, [status, locale, router]);

  if (status !== "authenticated") {
    return (
      <div className="grid min-h-screen place-items-center p-8" role="status" aria-label={t.states.loading}>
        <div className="w-full max-w-sm space-y-3">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen lg:flex">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">
        {t.skip}
      </a>
      <Sidebar
        collapsed={collapsed}
        onToggle={() => {
          setCollapsed((c) => {
            try {
              localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
            } catch {
              /* ignore */
            }
            return !c;
          });
        }}
        mobileOpen={mobile}
        onClose={() => setMobile(false)}
      />
      <div className="min-w-0 flex-1">
        <Header onMenu={() => setMobile(true)} crumbs={crumbs} />
        <main id="content" className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
