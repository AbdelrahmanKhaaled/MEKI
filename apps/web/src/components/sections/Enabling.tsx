import type { Dict } from "@/content/en";
import { Icon } from "../Icon";

export function Enabling({ t }: { t: Dict }) {
  const e = t.enabling;
  return (
    <section aria-labelledby="enabling-title" className="relative bg-limestone-2 py-24 lg:py-32">
      <div className="container-x grid gap-14 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <p data-reveal className="eyebrow mb-6">
            {e.eyebrow}
          </p>
          <h2 id="enabling-title" data-reveal className="mb-6 text-[clamp(1.9rem,3.4vw,2.8rem)]">
            {e.title}
          </h2>
          <p data-reveal className="text-body-grey">
            {e.intro}
          </p>
        </div>
        <ul data-stagger className="grid gap-px overflow-hidden rounded-[2rem] bg-stone-line md:grid-cols-3 lg:col-span-8">
          {e.items.map((item) => (
            <li key={item.name} data-stagger-item className="group relative bg-paper p-8 transition-colors duration-500 hover:bg-deep-green lg:p-10">
              <span className="absolute inset-x-8 top-0 h-px origin-left scale-x-0 bg-harvest-gold transition-transform duration-700 group-hover:scale-x-100 rtl:origin-right lg:inset-x-10" />
              <Icon name={item.icon} className="mb-10 size-9 text-meki-green transition-colors duration-500 group-hover:text-glow" />
              <h3 className="mb-2 text-2xl transition-colors duration-500 group-hover:text-white">{item.name}</h3>
              {item.tagline && <p className="mb-3 font-serif text-lg italic text-meki-green transition-colors duration-500 group-hover:text-glow">{item.tagline}</p>}
              <p className="text-[0.95rem] text-body-grey transition-colors duration-500 group-hover:text-mint-line">{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
