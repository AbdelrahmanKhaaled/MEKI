import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import photos from "../src/content/delivery-gallery.json" with { type: "json" };
import manifest from "../../../deploy/staging/nov25/client-delivery.manifest.json" with { type: "json" };

const web = path.resolve(import.meta.dirname, "..");
test("Delivered program photos have a unique public file, the source folder's program and bilingual captions", async () => {
  assert.equal(photos.length, 100);
  assert.equal(new Set(photos.map((photo) => photo.url)).size, photos.length);
  const hashes = new Set();
  for (const photo of photos) {
    const original = manifest.entries.find((entry) => entry.key === path.basename(photo.url, ".webp"));
    assert.equal(photo.program, original.program);
    if (original.folder === "disability") assert.equal(photo.program, "heritage-culture");
    assert.ok(photo.titleEn && photo.titleAr && photo.placeEn && photo.placeAr);
    const bytes = await readFile(path.join(web, "public", photo.url));
    hashes.add(createHash("sha256").update(bytes).digest("hex"));
    const { format, width, height } = await sharp(bytes).metadata();
    assert.equal(format, "webp");
    assert.deepEqual([width, height], [photo.width, photo.height]);
    assert.ok(Math.max(width, height) <= Math.min(2560, Math.max(original.width, original.height)));
  }
  assert.equal(hashes.size, photos.length);
});

test("Public sponsorship PDF is byte-identical to the supplied package", async () => {
  const pdf = await readFile(path.join(web, "public/gala/sponsorship-packages.pdf"));
  assert.equal(createHash("sha256").update(pdf).digest("hex"), "2de2df2573d53d72a6dc1da249a468965dd02796c62cb8e0ea41c9f8afbae6ab");
});
