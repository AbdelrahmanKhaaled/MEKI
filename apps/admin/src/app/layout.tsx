import type { Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = { themeColor: "#0B3B30", width: "device-width", initialScale: 1 };

/** Root layout is intentionally minimal: <html lang/dir> is set by the [locale] layout. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
