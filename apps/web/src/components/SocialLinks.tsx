import { Globe, MessageCircle, Music2, Send } from "lucide-react";
import type { SocialLink } from "@/content/en";

/** Simple monochrome glyphs (currentColor) for the networks the admin offers (apps/admin/src/lib/cms-schemas.ts SOCIAL_NETWORKS). */
function Glyph({ network }: { network: string }) {
  const p = { className: "size-5", "aria-hidden": true as const, viewBox: "0 0 24 24" };
  switch (network) {
    case "instagram":
      return (
        <svg {...p} fill="none" stroke="currentColor" strokeWidth={1.8}>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4.2" />
          <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "facebook":
      return (
        <svg {...p} fill="currentColor">
          <path d="M14 8.6V7c0-.8.5-1 1-1h2.5V2.2L14.4 2C11 2 10 4 10 6.6v2H7.5v3.9H10V22h4v-9.5h3l.5-3.9Z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg {...p} fill="currentColor">
          <circle cx="5" cy="5" r="2.2" />
          <rect x="3" y="9" width="4" height="12" />
          <path d="M9.5 9h3.8v1.7c.6-1.1 2-2 4-2 3.4 0 4.2 2.1 4.2 5.1V21h-4v-6.3c0-1.5-.3-2.7-1.9-2.7-1.7 0-2.1 1.2-2.1 2.7V21h-4Z" />
        </svg>
      );
    case "x":
      return (
        <svg {...p} fill="currentColor">
          <path d="M3.5 3h5l4 5.6L17.3 3H20l-6.1 7.1L21 21h-5l-4.4-6.1L6.4 21H3.6l6.7-7.7Z" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...p} fill="currentColor">
          <path d="M22 8.2a3 3 0 0 0-2.1-2.1C18 5.6 12 5.6 12 5.6s-6 0-7.9.5A3 3 0 0 0 2 8.2 31 31 0 0 0 1.6 12 31 31 0 0 0 2 15.8a3 3 0 0 0 2.1 2.1c1.9.5 7.9.5 7.9.5s6 0 7.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .4-3.8 31 31 0 0 0-.4-3.8ZM10 15.2V8.8l5.2 3.2Z" />
        </svg>
      );
    case "tiktok":
      return <Music2 className="size-5" aria-hidden="true" />;
    case "whatsapp":
      return <MessageCircle className="size-5" aria-hidden="true" />;
    case "telegram":
      return <Send className="size-5" aria-hidden="true" />;
    default:
      return <Globe className="size-5" aria-hidden="true" />;
  }
}

const NAMES: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", x: "X", youtube: "YouTube", tiktok: "TikTok", whatsapp: "WhatsApp", telegram: "Telegram", website: "Website" };

/** "@handle" for an Instagram/X/TikTok profile URL (display only), else null. */
function handle(network: string, url: string): string | null {
  if (!["instagram", "x", "tiktok"].includes(network)) return null;
  try {
    const seg = new URL(url).pathname.split("/").filter(Boolean)[0];
    return seg ? `@${seg.replace(/^@/, "")}` : null;
  } catch {
    return null;
  }
}

/**
 * "Follow us" (MEKI client edits, 22 Nov 2026, item 14): social icons that open in a new tab. Links come from Admin → Site settings
 * (https only, validated in lib/content.ts); the confirmed Instagram account @meki.intr is the built-in default. Renders nothing
 * without links, so no empty or broken icons are ever shown.
 */
export function SocialLinks({ links, title, newTab, tone = "dark", className = "" }: { links: SocialLink[]; title: string; newTab: string; tone?: "dark" | "light"; className?: string }) {
  const shown = links.filter((l) => /^https:\/\//.test(l.url)).slice(0, 12);
  if (shown.length === 0) return null;
  const dark = tone === "dark";
  return (
    <div className={className} data-testid="social-links">
      <h2 className={`mb-4 font-sans text-xs font-bold uppercase tracking-[0.22em] ${dark ? "text-glow" : "text-gold-text"}`}>{title}</h2>
      <ul className="flex flex-wrap gap-3">
        {shown.map((l) => {
          const name = NAMES[l.network] ?? NAMES.website;
          const h = handle(l.network, l.url);
          return (
            <li key={l.url}>
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-bold transition ${dark ? "border border-white/20 text-white hover:border-glow hover:text-glow" : "border border-stone-line text-ink hover:border-meki-green hover:text-meki-green"}`}
              >
                <Glyph network={l.network} />
                <span>{h ?? name}</span>
                <span className="sr-only">
                  {h ? ` ${name}` : ""} {newTab}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
