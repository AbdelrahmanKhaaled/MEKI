#!/usr/bin/env node
// Applies MEKI's 19 November 2026 Gala details to an EXISTING database through the audited admin API (never SQL):
// ticket price USD 500, capacity 350, and 3:30–8:30 PM America/New_York on 12 December 2026. Sales stay CLOSED.
// The seed only creates rows, so existing databases (staging, a VPS) need this once. Docs: docs/55 §1.
//
//   ADMIN_URL=http://localhost:3201 node deploy/staging/apply-nov19-gala.mjs          (credentials from .env.staging-admin)
// Requires an account with events.manage (price/capacity/schedule). It never touches salesEnabled.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ADMIN = (process.env.ADMIN_URL ?? 'http://localhost:3201').replace(/\/$/, '');
const cred = Object.fromEntries(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '.env.staging-admin'), 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
let cookie = '';
let csrf = '';
const call = async (method, path, body) => {
  const res = await fetch(`${ADMIN}/api/v1${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(csrf && method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const sid = (res.headers.getSetCookie?.() ?? []).find((c) => /meki_admin_sid=/.test(c));
  if (sid) cookie = sid.split(';')[0];
  return { status: res.status, json: await res.json().catch(() => null) };
};
const login = await call('POST', '/admin/auth/login', { email: cred.ADMIN_BOOTSTRAP_EMAIL, password: cred.ADMIN_BOOTSTRAP_PASSWORD });
if (login.status !== 200) throw new Error(`login failed: HTTP ${login.status} ${login.json?.error?.code ?? ''}`);
csrf = login.json.data.csrfToken;
const events = await call('GET', '/admin/gala/events');
const gala = (events.json?.data ?? []).find((e) => e.slug === 'gala-night');
if (!gala) throw new Error('gala-night event not found');
const before = (await call('GET', `/admin/events/${gala.id}/ticketing`)).json?.data;
const t = await call('PATCH', `/admin/events/${gala.id}/ticketing`, { ticketPrice: '500.00', capacity: 350 });
const e = await call('PATCH', `/admin/events/${gala.id}`, { startsAt: '2026-12-12T15:30:00-05:00', endsAt: '2026-12-12T20:30:00-05:00', timezone: 'America/New_York' });
const after = (await call('GET', `/admin/events/${gala.id}/ticketing`)).json?.data;
console.log(JSON.stringify({
  ticketing: { status: t.status, priceBefore: before?.ticketPrice, priceAfter: after?.ticketPrice, capacity: after?.capacity, salesEnabled: after?.salesEnabled },
  schedule: { status: e.status, startsAt: e.json?.data?.startsAt ?? null, endsAt: e.json?.data?.endsAt ?? null, timezone: e.json?.data?.timezone ?? null, error: e.json?.error?.code ?? null },
}));
await call('POST', '/admin/auth/logout');
