/** Allowed raster formats, detected from magic bytes (never from extension or client MIME). SVG is rejected. */
export const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;
export type AllowedMime = keyof typeof ALLOWED_IMAGE_TYPES;

export function detectImageMime(buf: Buffer): AllowedMime | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

/**
 * MEKI client edits (24 Nov 2026): informational documents (the Gala sponsorship packages). Only PDF, detected from its header
 * ("%PDF-1.x") AND a trailing end-of-file marker — never from the extension or the client MIME type. Stored byte-for-byte.
 */
export const ALLOWED_DOCUMENT_TYPES = { 'application/pdf': 'pdf' } as const;
export type AllowedDocumentMime = keyof typeof ALLOWED_DOCUMENT_TYPES;

export function detectDocumentMime(buf: Buffer): AllowedDocumentMime | null {
  if (buf.length < 64) return null;
  if (!/^%PDF-[12]\.\d/.test(buf.subarray(0, 8).toString('latin1'))) return null;
  if (!buf.subarray(Math.max(0, buf.length - 2048)).toString('latin1').includes('%%EOF')) return null;
  return 'application/pdf';
}

export const isDocumentMime = (mime: string | null | undefined) => mime === 'application/pdf';

/** Display-safe original filename (traceability only; storage keys are always generated). */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  return (
    base
      .normalize('NFKC')
      // eslint-disable-next-line no-control-regex -- intentionally strips control characters
      .replace(/[\u0000-\u001f<>:"|?*]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200) || 'file'
  );
}
