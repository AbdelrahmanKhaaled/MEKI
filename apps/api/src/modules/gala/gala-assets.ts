import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AppConfigService } from '../../config/app-config.service';

/** Marker file used to recognise a complete runtime asset directory. */
const LOGO = 'brand/MEKI_Secondary_White.png';

/**
 * Locates runtime assets (brand logos, bundled fonts). Order: ASSETS_DIR, apps/api/assets (source tree or a deployment that
 * ships the whole app folder), dist/assets (copied at build time — see nest-cli.json). Never relies on the working directory.
 * From src/modules/gala and dist/modules/gala alike, three levels up is apps/api and two levels up is dist.
 */
export function assetDirCandidates(configured?: string): string[] {
  return [configured, resolve(__dirname, '../../../assets'), resolve(__dirname, '../../assets')].filter((p): p is string => !!p);
}

export function resolveAssetsDir(configured?: string): string {
  const found = assetDirCandidates(configured).find((dir) => existsSync(resolve(dir, LOGO)));
  if (!found) {
    throw new Error(`Runtime assets not found (looked for ${LOGO} in: ${assetDirCandidates(configured).join(', ')}). Ship apps/api/assets with the API or set ASSETS_DIR.`);
  }
  return found;
}

export interface FontSet {
  latin: { regular: string; bold: string };
  arabic: { regular: string; bold: string };
}

/** Explicit overrides win; otherwise the bundled Noto fonts (SIL OFL 1.1). Every path must exist or startup fails. */
export function resolveTicketFonts(config: Pick<AppConfigService, 'get'>, assetsDir: string): FontSet {
  const f = (file: string) => resolve(assetsDir, 'fonts', file);
  const set: FontSet = {
    latin: {
      regular: config.get('TICKET_PDF_LATIN_FONT_PATH') ?? f('NotoSans-Regular.ttf'),
      bold: config.get('TICKET_PDF_LATIN_FONT_BOLD_PATH') ?? f('NotoSans-Bold.ttf'),
    },
    arabic: {
      regular: config.get('TICKET_PDF_UNICODE_FONT_PATH') ?? f('NotoSansArabic-Regular.ttf'),
      bold: config.get('TICKET_PDF_UNICODE_FONT_BOLD_PATH') ?? f('NotoSansArabic-Bold.ttf'),
    },
  };
  const missing = [set.latin.regular, set.latin.bold, set.arabic.regular, set.arabic.bold].filter((p) => !existsSync(p));
  if (missing.length) throw new Error(`Ticket PDF font file(s) not found: ${missing.join(', ')}`);
  return set;
}
