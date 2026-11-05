/**
 * Decorative brand graphics (all aria-hidden).
 * - Pattern: a quiet Nile-inspired motif (lotus, reeds, triangles) adapted from the idea in the
 *   client's preferred prototype, redrawn as an original tile in brand gold.
 * - PointsOfLight: brand signature element, used on Deep Green only (never on Limestone).
 * - Curve: soft section transitions.
 */
const tileSvg =
  "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'>" +
  "<g fill='none' stroke='#E6C36F' stroke-width='1.1' stroke-linecap='round'>" +
  "<path d='M30 46c-6-8-6-16 0-22 6 6 6 14 0 22zM30 46c-10-3-15-10-15-17 8 1 13 7 15 17zM30 46c10-3 15-10 15-17-8 1-13 7-15 17zM30 46v12'/>" +
  "<path d='M90 104c-6-8-6-16 0-22 6 6 6 14 0 22zM90 104c-10-3-15-10-15-17 8 1 13 7 15 17zM90 104c10-3 15-10 15-17-8 1-13 7-15 17z'/>" +
  "<path d='M60 70l8 12H52zM0 88l8 12H-8zM120 88l8 12h-16z'/>" +
  "<path d='M66 22c4 0 6-3 10-3s6 3 10 3 6-3 10-3'/></g></svg>";
const tile = `url("data:image/svg+xml,${encodeURIComponent(tileSvg)}")`;

export function Pattern({ className = "", opacity = 0.09 }: { className?: string; opacity?: number }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={{ backgroundImage: tile, backgroundSize: "120px 120px", opacity }}
    />
  );
}

// Deterministic pseudo-random positions so SSR and client markup match.
const points = Array.from({ length: 40 }, (_, i) => {
  const r = (n: number) => {
    const v = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
    return Number((v - Math.floor(v)).toFixed(4));
  };
  return { x: r(1) * 100, y: r(2) * 100, s: 1.5 + r(3) * 3, gold: r(4) > 0.45, d: 2.5 + r(5) * 4, delay: r(6) * 4 };
});

export function PointsOfLight({ className = "", count = 34 }: { className?: string; count?: number }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {points.slice(0, count).map((p, i) => (
        <span
          key={i}
          className="twinkle absolute rounded-full"
          style={
            {
              insetInlineStart: `${p.x}%`,
              top: `${p.y}%`,
              width: p.s,
              height: p.s,
              background: p.gold ? "#E6C36F" : "#fff",
              boxShadow: `0 0 ${p.s * 4}px ${p.gold ? "rgb(230 195 111 / .8)" : "rgb(255 255 255 / .6)"}`,
              "--tw-dur": `${p.d}s`,
              "--tw-delay": `${p.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

export function Curve({ fill, flip = false, className = "" }: { fill: string; flip?: boolean; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1440 120"
      preserveAspectRatio="none"
      className={`block h-[50px] w-full sm:h-[80px] lg:h-[110px] ${flip ? "rotate-180" : ""} ${className}`}
    >
      <path d="M0 120V70C240 18 480 4 720 34s480 72 720 26v60z" fill={fill} />
    </svg>
  );
}

export function GoldArc({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 400 400" className={`pointer-events-none absolute ${className}`} fill="none">
      <path data-draw d="M20 380C20 180 180 20 380 20" stroke="#D6A146" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="380" cy="20" r="4" fill="#E6C36F" />
    </svg>
  );
}
