import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Zeffy webhook signature, exactly as documented (https://api.zeffy.com/api/docs, webhooks section):
 *   header  Zeffy-Signature: t=<unix seconds>,v1=<hex signature>
 *   v1      = hex( HMAC-SHA256(secret, "{t}.{rawBody}") ) computed over the RAW body, before any JSON parsing
 *   compare in constant time; reject when t is older than the tolerance (Zeffy recommends 5 minutes).
 * Several secrets may be configured (comma-separated) so a secret can be rotated without dropping deliveries.
 */
export type SignatureResult = { ok: true } | { ok: false; reason: 'missing' | 'malformed' | 'stale' | 'mismatch' | 'not_configured' };

export function parseSignatureHeader(header: string | string[] | undefined): { t: number; v1: string[] } | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw || raw.length > 1024) return null;
  let t: number | null = null;
  const v1: string[] = [];
  for (const part of raw.split(',')) {
    const [k, v] = part.trim().split('=', 2);
    if (k === 't' && v && /^\d{1,12}$/.test(v)) t = Number(v);
    else if (k === 'v1' && v && /^[0-9a-f]{64}$/i.test(v)) v1.push(v.toLowerCase());
  }
  return t === null || v1.length === 0 ? null : { t, v1 };
}

export function signPayload(secret: string, t: number, rawBody: Buffer | string): string {
  return createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex');
}

export function verifyZeffySignature(rawBody: Buffer, header: string | string[] | undefined, secrets: string[], toleranceSeconds: number, nowMs = Date.now()): SignatureResult {
  if (!secrets.length) return { ok: false, reason: 'not_configured' };
  if (!header) return { ok: false, reason: 'missing' };
  const parsed = parseSignatureHeader(header);
  if (!parsed) return { ok: false, reason: 'malformed' };
  const age = Math.floor(nowMs / 1000) - parsed.t;
  // stale or too far in the future (clock skew beyond the tolerance) → replay protection
  if (age > toleranceSeconds || age < -toleranceSeconds) return { ok: false, reason: 'stale' };
  for (const secret of secrets) {
    const expected = Buffer.from(signPayload(secret, parsed.t, rawBody), 'hex');
    for (const given of parsed.v1) {
      const g = Buffer.from(given, 'hex');
      if (g.length === expected.length && timingSafeEqual(g, expected)) return { ok: true };
    }
  }
  return { ok: false, reason: 'mismatch' };
}

export const splitSecrets = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
