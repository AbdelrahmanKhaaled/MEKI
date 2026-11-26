// Fails (exit 1) when a runtime asset required by the ticket PDF is missing from the production build output.
// Usage: node scripts/verify-assets.mjs [dir]   (default: dist/assets)
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'brand/MEKI_Secondary_White.png',
  'brand/MEKI_Icon_Gold.svg',
  'fonts/NotoSans-Regular.ttf',
  'fonts/NotoSans-Bold.ttf',
  'fonts/NotoSansArabic-Regular.ttf',
  'fonts/NotoSansArabic-Bold.ttf',
  'fonts/OFL-NotoSans.txt',
  'fonts/OFL-NotoSansArabic.txt',
];
const base = process.argv[2] ? resolve(process.argv[2]) : resolve(root, 'dist/assets');
const missing = required.filter((f) => !existsSync(resolve(base, f)) || statSync(resolve(base, f)).size === 0);
if (missing.length) {
  console.error(`Missing runtime assets in ${base}:`);
  for (const m of missing) console.error(`  ${m}`);
  process.exit(1);
}
console.log(`runtime assets OK in ${base} (${required.length} files)`);
