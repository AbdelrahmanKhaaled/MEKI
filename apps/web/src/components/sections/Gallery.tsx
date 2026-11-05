import Image from "next/image";
import type { Dict } from "@/content/en";
import { media } from "@/content/media";

/**
 * Editorial, layered gallery. Three columns drift at different parallax speeds for depth.
 * Photos: client-supplied Misr El-Kheir programme photography (consent to be confirmed).
 */
export function Gallery({ t }: { t: Dict }) {
  const g = t.gallery;
  const cols = [
    { speed: "0.02", items: [g.items[0], g.items[3]], shapes: ["aspect-[4/5] rounded-ss-[6rem]", "aspect-square"] },
    { speed: "-0.03", items: [g.items[1], g.items[4], g.items[6]], shapes: ["aspect-[4/3]", "aspect-[3/4] rounded-t-full", "aspect-[4/3]"] },
    { speed: "0.04", items: [g.items[2], g.items[5]], shapes: ["aspect-square", "aspect-[3/4] rounded-ee-[6rem]"] },
  ];
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

        <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {cols.map((col, ci) => (
            <div key={ci} data-parallax={col.speed} className={`flex flex-col gap-4 sm:gap-6 ${ci === 1 ? "lg:pt-24" : ""}`}>
              {col.items.map((item, i) => (
                <figure key={item.image} className="group relative overflow-hidden rounded-[1.75rem] shadow-[var(--shadow-card)]">
                  <div className={`relative ${col.shapes[i]} overflow-hidden`}>
                    <Image
                      src={media[item.image].src}
                      alt=""
                      fill
                      sizes="(min-width:1024px) 30vw, 50vw"
                      className="object-cover transition-transform duration-[1600ms] ease-[var(--ease-premium)] group-hover:scale-110"
                    />
                  </div>
                  <figcaption className="absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-deep-green-3/85 to-transparent p-4 pt-12 text-sm font-bold text-white opacity-90 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
                    {item.caption}
                  </figcaption>
                </figure>
              ))}
            </div>
          ))}
        </div>
        <p className="relative z-10 mt-24 text-center text-xs text-body-grey">{g.note}</p>
      </div>
    </section>
  );
}
