"use client";

import { createContext, useContext, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { getDict, type Dict, type Locale } from "@/lib/i18n";
import { AuthProvider } from "@/features/auth/AuthProvider";

interface LocaleCtx {
  locale: Locale;
  t: Dict;
  rtl: boolean;
}
const LocaleContext = createContext<LocaleCtx | null>(null);

export const useLocale = () => {
  const c = useContext(LocaleContext);
  if (!c) throw new Error("useLocale outside Providers");
  return c;
};

export function Providers({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            // never hammer the API with auth/permission failures; retry transient ones once
            retry: (count, err) => !(err instanceof ApiError && [400, 401, 403, 404, 422, 502].includes(err.status)) && count < 1,
          },
        },
      }),
  );
  const t = getDict(locale);
  return (
    <LocaleContext.Provider value={{ locale, t, rtl: t.dir === "rtl" }}>
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </LocaleContext.Provider>
  );
}
