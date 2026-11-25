// Builds web copies of the APPROVED MEKI logo files (MEKI client edits, 23 Nov 2026 — "03-approved-logos", sent by marketing).
//
// - Reads the approved originals READ-ONLY from references/client-edits-2026-11-23/03-approved-logos (never modified or moved;
//   that folder is a client resource and is not committed).
// - Never redraws, recolours or stretches: logos are scaled proportionally (fit "inside"); the icon is a pixel crop of the
//   approved green artwork (the symbol only), padded onto a square canvas.
// - Writes NEW files (no existing brand file is overwritten) to apps/web/public/brand, apps/admin/public/brand, and the
//   link-sharing image to apps/web/public/og, plus a provenance manifest.
//
//   node apps/web/scripts/build-brand.mjs            (from the repo root; sharp is an apps/web dependency)
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SRC = path.join(ROOT, "references/client-edits-2026-11-23/03-approved-logos");
const WEB = path.join(ROOT, "apps/web/public");
const ADMIN = path.join(ROOT, "apps/admin/public");
const DEEP_GREEN = { r: 11, g: 59, b: 48, alpha: 1 }; // brand Deep Green #0B3B30 (globals.css --color-deep-green)

/** Approved variant → role, as instructed in "MEKI-US Website Edits for the IT Team" (item 15). */
const VARIANTS = {
  green: "MEKI_secondary_green.png", // light backgrounds
  white: "MEKI_secondary_rev.png", // dark green backgrounds (hero, Gala page, footer)
};

const manifest = { generatedFrom: "references/client-edits-2026-11-23/03-approved-logos", approvedBy: "MEKI marketing (client edits, 23 Nov 2026)", files: [] };
const out = async (pipeline, file, note) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const info = await pipeline.toFile(file);
  manifest.files.push({ file: path.relative(ROOT, file).replaceAll("\\", "/"), width: info.width, height: info.height, bytes: info.size, note });
  console.log(path.relative(ROOT, file), `${info.width}x${info.height}`, `${Math.round(info.size / 1024)}KB`);
};

for (const [role, name] of Object.entries(VARIANTS)) {
  const src = path.join(SRC, name);
  if (!fs.existsSync(src)) throw new Error(`Approved logo missing: ${src}`);
  const meta = await sharp(src).metadata();
  manifest.files.push({ source: name, width: meta.width, height: meta.height });
  const label = role === "green" ? "Green" : "White";
  // 1200 px wide: sharp at 3x the largest rendered width (header 150-170 px, footer 200 px, admin 160 px).
  for (const dir of [path.join(WEB, "brand"), path.join(ADMIN, "brand")]) {
    await out(sharp(src).resize({ width: 1200, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9, palette: true, quality: 100, effort: 10 }), path.join(dir, `MEKI_Secondary_${label}.png`), `${name}, proportional resize`);
  }
}

// Icon only (the symbol), cropped from the approved green artwork: the symbol ends at the first fully transparent column gap.
const green = path.join(SRC, VARIANTS.green);
const { data, info } = await sharp(green).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const colHasInk = (x) => {
  for (let y = 0; y < info.height; y++) if (data[(y * info.width + x) * 4 + 3] > 8) return true;
  return false;
};
let x = 0;
while (x < info.width && !colHasInk(x)) x++;
const left = x;
while (x < info.width && colHasInk(x)) x++;
const right = x; // first empty column after the symbol
let top = 0;
let bottom = info.height - 1;
const rowHasInk = (y) => {
  for (let c = left; c < right; c++) if (data[(y * info.width + c) * 4 + 3] > 8) return true;
  return false;
};
while (top < info.height && !rowHasInk(top)) top++;
while (bottom > top && !rowHasInk(bottom)) bottom--;
const box = { left, top, width: right - left, height: bottom - top + 1 };
if (box.width < 200 || box.width > info.width * 0.5) throw new Error(`Unexpected icon bounds ${JSON.stringify(box)}`);
const side = Math.max(box.width, box.height);
const pad = Math.round(side * 0.08);
const icon = await sharp(green)
  .extract(box)
  .extend({ top: Math.floor((side - box.height) / 2) + pad, bottom: Math.ceil((side - box.height) / 2) + pad, left: Math.floor((side - box.width) / 2) + pad, right: Math.ceil((side - box.width) / 2) + pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
manifest.iconCrop = box;
for (const size of [32, 192, 512]) {
  await out(sharp(icon).resize(size, size), path.join(WEB, "brand", `MEKI_Icon_Approved_${size}.png`), "symbol cropped from MEKI_secondary_green.png (icon only)");
}
await out(sharp(icon).resize(32, 32), path.join(ADMIN, "brand", "MEKI_Icon_Approved_32.png"), "symbol cropped from MEKI_secondary_green.png (icon only)");
// The same crop box applied to the approved white artwork (same 5920×1799 canvas) — for dark backgrounds.
const whiteIcon = await sharp(path.join(SRC, VARIANTS.white))
  .extract(box)
  .extend({ top: Math.floor((side - box.height) / 2) + pad, bottom: Math.ceil((side - box.height) / 2) + pad, left: Math.floor((side - box.width) / 2) + pad, right: Math.ceil((side - box.width) / 2) + pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
for (const dir of [path.join(WEB, "brand"), path.join(ADMIN, "brand")]) {
  await out(sharp(whiteIcon).resize(128, 128), path.join(dir, "MEKI_Icon_Approved_White_128.png"), "symbol cropped from MEKI_secondary_rev.png (icon only)");
}
await out(sharp(icon).resize(128, 128), path.join(WEB, "brand", "MEKI_Icon_Approved_Green_128.png"), "symbol cropped from MEKI_secondary_green.png (icon only)");
// Apple touch icon must be opaque: the green symbol on white.
await out(sharp(icon).resize(150, 150).extend({ top: 15, bottom: 15, left: 15, right: 15, background: "#ffffff" }).flatten({ background: "#ffffff" }).png(), path.join(WEB, "brand", "MEKI_Icon_Approved_Apple_180.png"), "symbol on white, 180x180");

// Link-sharing image 1200x630: the white approved logo, proportional, centred on brand Deep Green.
const whiteLogo = await sharp(path.join(SRC, VARIANTS.white)).resize({ width: 720, fit: "inside" }).png().toBuffer();
const wl = await sharp(whiteLogo).metadata();
await out(
  sharp({ create: { width: 1200, height: 630, channels: 4, background: DEEP_GREEN } })
    .composite([{ input: whiteLogo, left: Math.round((1200 - wl.width) / 2), top: Math.round((630 - wl.height) / 2) }])
    .flatten({ background: DEEP_GREEN })
    .jpeg({ quality: 90, mozjpeg: true }),
  path.join(WEB, "og", "meki-og-approved-logo.jpg"),
  "white approved logo (MEKI_secondary_rev.png) centred on Deep Green #0B3B30",
);

fs.writeFileSync(path.join(WEB, "brand", "approved-logo-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
