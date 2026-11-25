import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";

const web = path.resolve(import.meta.dirname, "..");
const repo = path.resolve(web, "../..");
const references = path.join(repo, "references/client-edits-2026-11-23");
const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const manifest = await readJson(path.join(repo, "deploy/staging/nov25/client-delivery.manifest.json"));
const originalRoot = path.join(references, "08-client-delivery-originals");
const covers = await readJson(path.join(web, "public/images/work/client-delivery.json"));
const gallery = [];
const seen = new Set();

async function original(file, hash) {
  const bytes = await fs.readFile(file);
  if (createHash("sha256").update(bytes).digest("hex") !== hash) throw new Error("Original changed: " + file);
  return bytes;
}

await fs.mkdir(path.join(web, "public/images/gallery"), { recursive: true });
for (const entry of manifest.entries) {
  if (seen.has(entry.sha256)) throw new Error("Duplicate original: " + entry.rel);
  seen.add(entry.sha256);
  const bytes = await original(path.join(originalRoot, manifest.source, entry.rel), entry.sha256);
  if (!entry.program) continue;
  const cover = covers.find((row) => row.key === entry.key);
  const url = "/images/" + (cover ? "work" : "gallery") + "/" + entry.key + ".webp";
  const input = entry.converted ? await original(path.join(originalRoot, entry.converted), entry.convertedSha256) : bytes;
  const dimensions = cover ?? await sharp(input).rotate()
    .resize({ width: 2560, height: 2560, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 89, effort: 4 }).toFile(path.join(web, "public", url));
  const { program, role, titleEn, titleAr, placeEn, placeAr } = entry;
  gallery.push({ url, width: dimensions.width, height: dimensions.height, program, role, titleEn, titleAr, placeEn, placeAr });
}
await fs.writeFile(path.join(web, "src/content/delivery-gallery.json"), JSON.stringify(gallery, null, 2) + "\n");

const { assets } = await readJson(path.join(repo, "deploy/staging/apply-nov23-client-edits.data.json"));
const gala = path.join(web, "public/gala");
await fs.mkdir(gala, { recursive: true });
for (const entry of assets.files) {
  const bytes = await original(path.join(references, "06-gala-assets", entry.file), entry.sha256);
  await fs.writeFile(path.join(gala, entry.key + path.extname(entry.file)), bytes);
}
