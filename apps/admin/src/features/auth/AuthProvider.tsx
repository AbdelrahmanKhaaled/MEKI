"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, onUnauthorized } from "@/lib/api";
import { can as canFn } from "@/lib/navigation";
import type { AuthUser } from "@/lib/schemas";
import { fetchMe, login as loginSvc, logout as logoutSvc, refreshCsrf } from "@/services/dashboard";

type Status = "loading" | "anonymous" | "authenticated";
interface Ctx {
  status: Status;
  user: AuthUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  can: (...anyOf: string[]) => boolean;
}
const AuthContext = createContext<Ctx | null>(null);

/**
 * Uses the EXISTING session contract only: HttpOnly cookie (set by the API through the same-origin proxy), GET /admin/auth/me
 * to learn who is signed in and what they may do, GET /admin/auth/csrf for the in-memory CSRF token. Nothing is kept in
 * browser storage and no token is readable by this code except the CSRF token (memory).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    let alive = true;
    void (async () => {
      await Promise.resolve();
      try {
        const me = await fetchMe();
        await refreshCsrf();
        if (alive) {
          setUser(me);
          setStatus("authenticated");
        }
      } catch {
        if (alive) setStatus("anonymous"); // 401 (or unreachable API): show the login page
      }
    })();
    const off = onUnauthorized(() => {
      setUser(null);
      setStatus("anonymous");
      qc.clear(); // cached financial data must not outlive the session
    });
    return () => {
      alive = false;
      off();
    };
  }, [qc]);

  const signIn = useCallback(async (email: string, password: string) => {
    const u = await loginSvc(email, password);
    setUser(u);
    setStatus("authenticated");
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logoutSvc();
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) throw e;
    }
    qc.clear();
    setUser(null);
    setStatus("anonymous");
  }, [qc]);

  const value = useMemo<Ctx>(() => ({ status, user, signIn, signOut, can: (...p) => canFn(user, ...p) }), [status, user, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const c = useContext(AuthContext);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
