// Web derivatives of the client's original photos. Originals are only READ (never modified or moved).
// Long edge ≤ 2560 px (never enlarged), auto-oriented, WebP q95 (the API re-encodes uploads once more at q90) with full-resolution chroma (the 23 Nov feedback: "pictures are
// still of low quality"); EXIF/GPS dropped by sharp. Deterministic for a given sharp version.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(join(HERE, '../../../apps/web/package.json'))('sharp');

export const MAX_EDGE = 2560;
export async function derive(buf, { maxEdge = MAX_EDGE } = {}) {
  const img = sharp(buf, { failOn: 'none', limitInputPixels: false }).rotate().resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true });
  const { data, info } = await img.webp({ quality: 95, smartSubsample: false, effort: 4 }).toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
