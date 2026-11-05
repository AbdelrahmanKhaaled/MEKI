// Builds low-res contact sheets of client photo folders for curation.
// Reads client-resources READ-ONLY; writes sheets to the dir given as argv[2].
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../../client-resources/Imgaes/client-images");
const OUT = process.argv[2];
const folders = process.argv.slice(3);
const T = 220, COLS = 6, MAX = 36;
fs.mkdirSync(OUT, { recursive: true });

for (const [fi, folder] of folders.entries()) {
  const dir = path.join(ROOT, folder);
  const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort().slice(0, MAX);
  const tiles = [];
  for (const [i, f] of files.entries()) {
    try {
      const buf = await sharp(path.join(dir, f), { failOn: "none" }).rotate().resize(T, T, { fit: "cover" }).jpeg({ quality: 60 }).toBuffer();
      const label = Buffer.from(`<svg width="${T}" height="28"><rect width="40" height="28" fill="black"/><text x="6" y="20" font-size="18" fill="yellow" font-family="Arial">${i}</text></svg>`);
      tiles.push({ input: await sharp(buf).composite([{ input: label, top: 0, left: 0 }]).toBuffer(), i });
    } catch (e) { console.error("skip", f, e.message); }
  }
  const rows = Math.ceil(tiles.length / COLS);
  const sheet = sharp({ create: { width: COLS * T, height: rows * T, channels: 3, background: "#222" } })
    .composite(tiles.map((t) => ({ input: t.input, left: (t.i % COLS) * T, top: Math.floor(t.i / COLS) * T })));
  await sheet.jpeg({ quality: 70 }).toFile(path.join(OUT, `sheet-${fi}.jpg`));
  fs.writeFileSync(path.join(OUT, `sheet-${fi}.txt`), folder + "\n" + files.map((f, i) => `${i}\t${f}`).join("\n"));
  console.log(fi, folder, files.length);
}
