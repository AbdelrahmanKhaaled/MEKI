"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { initializeAds } from "@/lib/donation-tracking";

export function PublicTracking() {
  const path = usePathname();
  useEffect(() => {
    initializeAds();
    window.mekiPagePixels?.(path);
  }, [path]);
  return <Script src="/tracking.js" strategy="afterInteractive" />;
}
