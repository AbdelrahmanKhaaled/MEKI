// Web copies of the client's 24 Nov 2026 delivery that the website ships as built-in (fallback) images:
// the two approved hero photos ("Home P"), the nine program covers and the clear water-project photo.
// Everything else of the delivery goes to the CMS Media Library (deploy/staging/nov25). Originals are READ-ONLY (never modified).
//   node apps/web/scripts/build-client-delivery.mjs [<delivery root>]    →  public/images/work/<key>.webp + client-delivery.json
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const HERE = import.meta.dirname;
const ROOT = process.argv[2] ?? path.resolve(HERE, "../../../references/client-edits-2026-11-23/08-client-delivery-originals");
const manifest = JSON.parse(fs.readFileSync(path.resolve(HERE, "../../../deploy/staging/nov25/client-delivery.manifest.json"), "utf8"));
const OUT = path.resolve(HERE, "../public/images/work");
const STATIC = new Set(["hero-main", "hero-secondary", "cover", "water"]);
const rows = [];
for (const e of manifest.entries.filter((x) => STATIC.has(x.role))) {
  const src = path.join(ROOT, manifest.source, e.rel);
  const info = await sharp(fs.readFileSync(src), { failOn: "none", limitInputPixels: false })
    .rotate()
    .resize({ width: 2200, height: 2200, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 88, smartSubsample: false, effort: 6 })
    .toFile(path.join(OUT, `${e.key}.webp`));
  rows.push({ key: e.key, width: info.width, height: info.height, kb: Math.round(info.size / 1024), sourceFolder: e.folder, sourceFile: e.file, sha256: e.sha256, provenance: "client delivery 24 Nov 2026 (TransferNow)", consent: "UNCONFIRMED" });
  console.log(e.key, `${info.width}x${info.height}`, `${Math.round(info.size / 1024)}KB`);
}
fs.writeFileSync(path.join(OUT, "client-delivery.json"), JSON.stringify(rows, null, 2));
