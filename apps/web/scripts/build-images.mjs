// Builds web-ready copies of curated client photos.
// - Reads originals READ-ONLY from client-resources (never modified/moved).
// - Auto-orients, resizes to max 2000px (Lanczos), encodes WebP q88; sharp drops EXIF/GPS by default.
// - Writes public/images/work/<key>.webp and a provenance manifest.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import selection from "./selection.mjs";

const SRC = path.resolve(import.meta.dirname, "../../../client-resources/Imgaes/client-images");
const OUT = path.resolve(import.meta.dirname, "../public/images/work");
fs.mkdirSync(OUT, { recursive: true });
const manifest = [];
for (const [key, folder, file] of selection) {
  const out = path.join(OUT, `${key}.webp`);
  const info = await sharp(path.join(SRC, folder, file), { failOn: "none" })
    .rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
    // Client edits 23 Nov 2026 ("pictures are still of low quality"): q78 → q88 with full-resolution chroma (no 4:2:0 smearing of
    // fine detail) and maximum encoder effort. Same 2000 px bound, so Media Library dimensions stay exact.
    .webp({ quality: 88, smartSubsample: true, effort: 6 }).toFile(out);
  manifest.push({ key, width: info.width, height: info.height, sourceFolder: folder, sourceFile: file,
    provenance: "client-supplied Misr El-Kheir programme photography", consent: "UNCONFIRMED" });
  console.log(key, info.width, info.height, Math.round(info.size / 1024) + "KB");
}
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
