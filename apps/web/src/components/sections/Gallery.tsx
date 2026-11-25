import Image from "next/image";
import type { Dict, GalleryItem } from "@/content/en";
import { coverSizes, resolveMedia } from "@/content/media";
import { photoCaption } from "@/lib/venue-photos";

/** The program name for a gallery photo, from the Programs section itself (so both always match). Unknown slug → none. */
const programName = (t: Dict, slug?: string) => (slug ? t.programmes.items.find((p) => p.slug === slug)?.name : undefined);

/**
 * Editorial, layered gallery. Three columns drift at different parallax speeds for depth.
 * Photos: client-supplied Misr El-Kheir programme photography (consent to be confirmed).
 * Captions (MEKI client edits, 22–23 Nov 2026): one format for every photo — "Title – Place", with the program underneath.
 */
/** Column shapes, cycled per photo (the photos are cropped to these frames). */
const SHAPES: [string, number][][] = [
  [["aspect-[4/5] rounded-ss-[6rem]", 0.8], ["aspect-square", 1], ["aspect-[4/3]", 4 / 3]],
  [["aspect-[4/3]", 4 / 3], ["aspect-[3/4] rounded-t-full", 0.75], ["aspect-[4/3]", 4 / 3]],
  [["aspect-square", 1], ["aspect-[3/4] rounded-ee-[6rem]", 0.75], ["aspect-[4/5]", 0.8]],
];
/** Photos shown before "Show more photos" (three per column). */
const FIRST_BATCH = 9;
const SPEEDS = ["0.02", "-0.03", "0.04"];

/** Distributes photos over three columns in reading order (photo i → column i mod 3). Any number of photos is supported. */
function columns(items: GalleryItem[]) {
  const cols: GalleryItem[][] = [[], [], []];
  items.forEach((it, i) => cols[i % 3].push(it));
  return cols;
}

function Columns({ t, items, parallax }: { t: Dict; items: GalleryItem[]; parallax: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
      {columns(items).map((col, ci) => (
        <div key={ci} {...(parallax ? { "data-parallax": SPEEDS[ci] } : {})} className={`flex flex-col gap-4 sm:gap-6 ${ci === 1 && parallax ? "lg:pt-24" : ""}`}>
          {col.map((item, i) => (
            <GalleryFigure key={item.image + i} item={item} shape={SHAPES[ci][i % SHAPES[ci].length]} program={programName(t, item.program)} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Gallery({ t }: { t: Dict }) {
  const g = t.gallery;
  if (!g.items.length) return null;
  const first = g.items.slice(0, FIRST_BATCH);
  const rest = g.items.slice(FIRST_BATCH);
  return (
    <section aria-labelledby="gallery-title" className="section-y relative overflow-hidden bg-limestone">
      <div className="container-x">
        <div className="relative z-10 mx-auto mb-28 max-w-2xl text-center">
          <p data-reveal className="eyebrow mb-6 justify-center">
            {g.eyebrow}
          </p>
          <h2 id="gallery-title" data-reveal className="headline mb-6">
            {g.title}
          </h2>
          <p data-reveal className="text-lg text-body-grey">
            {g.intro}
          </p>
        </div>

        <Columns t={t} items={first} parallax />
        {rest.length > 0 && (
          <details className="group/more mt-8 sm:mt-10">
            <summary className="mx-auto flex min-h-12 w-fit cursor-pointer list-none items-center gap-2 rounded-full border border-meki-green px-6 text-sm font-bold text-meki-green transition hover:bg-meki-green hover:text-white [&::-webkit-details-marker]:hidden group-open/more:mb-8">
              <span className="group-open/more:hidden">{g.showMore ?? "Show more photos"} ({rest.length})</span>
              <span className="hidden group-open/more:inline">{g.showLess ?? "Show fewer photos"}</span>
            </summary>
            <Columns t={t} items={rest} parallax={false} />
          </details>
        )}
        <p className="relative z-10 mt-24 text-center text-xs text-body-grey">{g.note}</p>
      </div>
    </section>
  );
}

function GalleryFigure({ item, shape: [shape, frame], program }: { item: GalleryItem; shape: [string, number]; program?: string }) {
  const caption = photoCaption(item.title, item.place);
  const resolved = resolveMedia(item.image);
  const media = { ...resolved, w: item.width ?? resolved.w, h: item.height ?? resolved.h };
  return (
    <figure className="group relative overflow-hidden rounded-[1.75rem] shadow-[var(--shadow-card)]">
      <div className={`relative ${shape} overflow-hidden`}>
        <Image
          src={media.src}
          alt=""
          fill
          // Single column below 640 px, two columns to 1024 px, three above: request the size actually rendered.
          sizes={coverSizes("(min-width:1280px) 400px, (min-width:1024px) 31vw, (min-width:640px) 48vw, 100vw", media, frame)}
          quality={85}
          className="object-cover transition-transform duration-[1600ms] ease-[var(--ease-premium)] group-hover:scale-110"
        />
      </div>
      <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-deep-green-3/90 via-deep-green-3/60 to-transparent p-4 pt-14 text-white">
        <span className="block text-sm font-bold leading-snug">{caption}</span>
        {program && <span className="mt-0.5 block text-xs text-mint-line">{program}</span>}
      </figcaption>
    </figure>
  );
}
