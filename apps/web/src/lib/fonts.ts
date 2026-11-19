import localFont from "next/font/local";
import { IBM_Plex_Sans_Arabic, Noto_Naskh_Arabic } from "next/font/google";

// Official MEKI typefaces from the brand kit (SIL OFL).
export const sourceSerif = localFont({
  variable: "--font-source-serif",
  display: "swap",
  // Phase 9A (measured): preloading forced all 9 brand faces (≈256 KB) onto EVERY page, Arabic included, competing with the
  // main content; without preload the browser fetches only the faces the CSS actually uses (display: swap keeps text visible).
  preload: false,
  src: [
    { path: "../fonts/SourceSerif4-Light.ttf", weight: "300", style: "normal" },
    { path: "../fonts/SourceSerif4-LightItalic.ttf", weight: "300", style: "italic" },
    { path: "../fonts/SourceSerif4-Regular.ttf", weight: "400", style: "normal" },
    { path: "../fonts/SourceSerif4-Italic.ttf", weight: "400", style: "italic" },
    { path: "../fonts/SourceSerif4-SemiBold.ttf", weight: "600", style: "normal" },
  ],
});

export const lato = localFont({
  variable: "--font-lato",
  display: "swap",
  preload: false, // see sourceSerif
  src: [
    { path: "../fonts/Lato-Light.ttf", weight: "300", style: "normal" },
    { path: "../fonts/Lato-Regular.ttf", weight: "400", style: "normal" },
    { path: "../fonts/Lato-Italic.ttf", weight: "400", style: "italic" },
    { path: "../fonts/Lato-Bold.ttf", weight: "700", style: "normal" },
  ],
});

// Arabic: PROPOSED pairing (not in brand kit) — pending brand-owner approval.
export const arabicText = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic-text",
  subsets: ["arabic"],
  weight: ["300", "400", "700"],
  display: "swap",
  preload: false,
});

export const arabicDisplay = Noto_Naskh_Arabic({
  variable: "--font-arabic-display",
  subsets: ["arabic"],
  weight: ["400", "600"],
  display: "swap",
  preload: false,
});
