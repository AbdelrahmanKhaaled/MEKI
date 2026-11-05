/* eslint-disable @next/next/no-img-element */
/**
 * Official MEKI primary logo, served unmodified from the brand kit (01_Logo/Primary/SVG).
 * Never redraw or retype. Minimum width 120px (Brand Guidelines p.10).
 */
export function Logo({ variant = "green", className = "", alt = "MEKI" }: { variant?: "green" | "white"; className?: string; alt?: string }) {
  const src = variant === "white" ? "/brand/MEKI_Primary_White.svg" : "/brand/MEKI_Primary_Green.svg";
  return <img src={src} alt={alt} width={643} height={145} className={`h-auto w-[132px] sm:w-[150px] ${className}`} />;
}
