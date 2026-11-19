import { Pattern, PointsOfLight } from "../Decor";

/**
 * Dark band at the top of the transactional pages (booking, booking status, donation return).
 *
 * The shared header is transparent with white links until the visitor scrolls (it is designed to sit on a dark hero).
 * These pages started on a light background, so the navigation was white-on-limestone (invisible) at the top.
 * The band gives the header its dark surface without changing the header (shared with the homepage).
 * With children it becomes a compact hero; without, a slim strip that only backs the header.
 */
export function FlowBand({ children }: { children?: React.ReactNode }) {
  return (
    <div className="relative isolate overflow-hidden bg-deep-green text-white">
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(120%_120%_at_85%_0%,rgb(20_89_74/0.9)_0%,rgb(11_59_48/0.95)_55%,#072a22_100%)]" />
      <Pattern opacity={0.06} className="-z-10" />
      <PointsOfLight count={children ? 12 : 6} className="-z-10" />
      <div aria-hidden="true" className="spin-slow pointer-events-none absolute -end-32 -top-32 -z-10 hidden size-[420px] rounded-full border border-dashed border-glow/15 md:block" />
      {children ? <div className="container-x pb-14 pt-32 lg:pb-16 lg:pt-36">{children}</div> : <div className="h-24 lg:h-28" />}
      <div aria-hidden="true" className="h-px w-full bg-gradient-to-r from-transparent via-harvest-gold/60 to-transparent" />
    </div>
  );
}
