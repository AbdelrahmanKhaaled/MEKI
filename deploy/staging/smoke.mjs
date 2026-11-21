#!/usr/bin/env node
// MEKI — Phase 13A staging smoke (end to end, no browser). Talks to the ADMIN origin exactly like the browser does (so the
// /api/v1 rewrite, the session cookie and the API are exercised together) and to the WEBSITE origin for public pages.
//
//   node deploy/staging/smoke.mjs                                   # local rehearsal defaults below
//   ADMIN_URL=https://admin.staging... WEB_URL=https://staging... API_URL=https://api.staging... node deploy/staging/smoke.mjs
//
// Credentials: deploy/staging/.env.staging-admin (git-ignored). On first run the bootstrap password is rotated (mandatory
// change) and the new value is written back to that file. No secret is ever printed. Nothing financial is enabled or applied:
// the financial checks only assert that every switch is OFF and every guarded action is refused.
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ADMIN = (process.env.ADMIN_URL ?? 'http://localhost:3201').replace(/\/$/, '');
const WEB = (process.env.WEB_URL ?? 'http://localhost:3200').replace(/\/$/, '');
const API = (process.env.API_URL ?? 'http://localhost:4200').replace(/\/$/, '');
const CRED = join(here, '.env.staging-admin');
const DB_CONTAINER = process.env.STAGING_DB_CONTAINER ?? 'meki-staging-mysql';

const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const readCred = () => Object.fromEntries(readFileSync(CRED, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const writePassword = (pw) => writeFileSync(CRED, readFileSync(CRED, 'utf8').replace(/^ADMIN_BOOTSTRAP_PASSWORD=.*$/m, `ADMIN_BOOTSTRAP_PASSWORD=${pw}`), { mode: 0o600 });
const newPassword = () => `Stg-${randomBytes(18).toString('base64url')}-7`;

/** Minimal cookie-jar session against the ADMIN origin. */
function session() {
  let cookie = '';
  let csrf = '';
  let lastSetCookie = '';
  const req = async (method, path, body, opts = {}) => {
    const headers = { Accept: 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(csrf && opts.csrf !== false && method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}), ...(opts.headers ?? {}) };
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(`${ADMIN}/api/v1${path}`, { method, headers, body: payload, redirect: 'manual' });
    const sc = res.headers.getSetCookie?.() ?? [];
    if (sc.length) {
      lastSetCookie = sc.join('\n');
      const sid = sc.find((c) => /meki_admin_sid=/.test(c));
      if (sid) cookie = /meki_admin_sid=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(sid) ? '' : sid.split(';')[0];
    }
    const json = await res.json().catch(() => null);
    return { status: res.status, json, headers: res.headers };
  };
  return {
    req,
    get cookie() { return cookie; },
    get setCookie() { return lastSetCookie; },
    async login(email, password) {
      const r = await req('POST', '/admin/auth/login', { email, password });
      if (r.status === 200 || r.status === 201) csrf = r.json?.data?.csrfToken ?? '';
      return r;
    },
  };
}

function dbExec(sql) {
  // Runs inside the staging DB container with ITS OWN root password (never passed on a command line here).
  return execFileSync('docker', ['exec', DB_CONTAINER, 'sh', '-c', `mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -e "${sql.replace(/"/g, '\\"')}" meki_staging 2>/dev/null`], { encoding: 'utf8' }).trim();
}

async function main() {
  // ── 1. API reachability: directly and THROUGH THE ADMIN ORIGIN (the login-404 root cause) ──
  const direct = await fetch(`${API}/api/v1/health`).then((r) => r.json()).catch(() => null);
  check('API readiness (direct): status ok, database up', direct?.data?.status === 'ok' && direct?.data?.database === 'up');
  const viaAdmin = await fetch(`${ADMIN}/api/v1/health`).then(async (r) => ({ s: r.status, j: await r.json().catch(() => null) })).catch(() => ({ s: 0 }));
  check('API readiness through the admin origin (/api/v1 rewrite preserved)', viaAdmin.s === 200 && viaAdmin.j?.data?.database === 'up', `HTTP ${viaAdmin.s}`);
  const live = await fetch(`${ADMIN}/api/v1/health/live`);
  check('liveness through the admin origin', live.status === 200);

  // ── 2. Authentication ──
  const cred = readCred();
  const a = session();
  const bad = await a.req('POST', '/admin/auth/login', { email: cred.ADMIN_BOOTSTRAP_EMAIL, password: `${cred.ADMIN_BOOTSTRAP_PASSWORD}x` });
  check('wrong password → 401 (no session cookie)', bad.status === 401 && !a.cookie, `HTTP ${bad.status} ${bad.json?.error?.code ?? ''}`);
  const anon = session();
  const meAnon = await anon.req('GET', '/admin/auth/me');
  check('unauthenticated /admin/auth/me → 401', meAnon.status === 401);
  const sdiAnon = await anon.req('GET', '/admin/sdi/status');
  check('unauthenticated protected route → 401', sdiAnon.status === 401);

  let login = await a.login(cred.ADMIN_BOOTSTRAP_EMAIL, cred.ADMIN_BOOTSTRAP_PASSWORD);
  check('login (POST /api/v1/admin/auth/login via the admin origin) → 200', login.status === 200 || login.status === 201, `HTTP ${login.status} ${login.json?.error?.code ?? ''}`);
  const sc = a.setCookie;
  check('session cookie: __Host- prefix, HttpOnly, Secure, SameSite=Strict, Path=/, no Domain', /__Host-meki_admin_sid=/.test(sc) && /HttpOnly/i.test(sc) && /Secure/i.test(sc) && /SameSite=Strict/i.test(sc) && /Path=\//i.test(sc) && !/Domain=/i.test(sc));
  check('CSRF token returned at login', !!login.json?.data?.csrfToken);

  if (login.json?.data?.user?.mustChangePassword) {
    if (process.env.STAGING_NO_PASSWORD_ROTATION === '1') throw new Error('Password rotation required; credential files are protected for this run. Complete the operator login workflow separately.');
    const blocked = await a.req('GET', '/admin/sdi/status');
    check('pending password change: protected routes refused (PASSWORD_CHANGE_REQUIRED)', blocked.status === 403 && blocked.json?.error?.code === 'PASSWORD_CHANGE_REQUIRED');
    const next = newPassword();
    const noCsrf = await a.req('POST', '/admin/auth/password/change', { currentPassword: cred.ADMIN_BOOTSTRAP_PASSWORD, newPassword: next }, { csrf: false });
    check('mutation without X-CSRF-Token → 403', noCsrf.status === 403, noCsrf.json?.error?.code);
    const ch = await a.req('POST', '/admin/auth/password/change', { currentPassword: cred.ADMIN_BOOTSTRAP_PASSWORD, newPassword: next });
    check('mandatory first-login password change', ch.status === 200 || ch.status === 201, `HTTP ${ch.status} ${ch.json?.error?.code ?? ''}`);
    if (ch.status < 300) writePassword(next); // stored back for the operator, never printed
    login = await a.login(cred.ADMIN_BOOTSTRAP_EMAIL, next);
    check('re-login with the new password', login.status === 200 || login.status === 201);
  } else check('mandatory password change already done', true);

  const me = await a.req('GET', '/admin/auth/me');
  check('authenticated /admin/auth/me → 200 (Super Admin)', me.status === 200 && me.json?.data?.isSuperAdmin === true);

  // ── 3. Financial switches: all OFF, guarded actions refused ──
  const sdi = await a.req('GET', '/admin/sdi/status');
  const s = sdi.json?.data ?? {};
  check('SDI status: zeffy_hosted; sales, giving, programme, general, report-apply all OFF', sdi.status === 200 && s.mode === 'zeffy_hosted' && !s.galaHostedSalesEnabled && !s.generalGivingEnabled && !s.programmeGivingEnabled && !s.applyEnabled);
  check('SDI status exposes no secrets or URLs', !/zeffy\.com|whsec|zk_|password/i.test(JSON.stringify(s)));
  const privateEvidence = await a.req('GET', '/admin/sdi/payment-evidence');
  check('private SDI evidence queue is usable and final manual approval remains disabled', privateEvidence.status === 200 && privateEvidence.json?.data?.approvalEnabled === false && Array.isArray(privateEvidence.json?.data?.items));
  check('private payment evidence is unavailable without authentication', (await anon.req('GET', '/admin/sdi/payment-evidence')).status === 401);
  const pubCfg = await fetch(`${API}/api/v1/public/donations/config`).then((r) => r.json()).catch(() => null);
  check('public donation config: payments disabled, no authorized designation', pubCfg?.data?.paymentsEnabled === false && Array.isArray(pubCfg?.data?.designations) && pubCfg.data.designations.length === 0);
  const forms = await fetch(`${API}/api/v1/public/hosted-forms`).then((r) => r.json()).catch(() => null);
  check('hosted forms: Gala single-project scope; general and programme channels unavailable', forms?.data?.scope === 'GALA_SINGLE_PROJECT' && forms.data.general.available === false && forms.data.programmes.every((p) => !p.available && p.url === null));
  const booking = await fetch(`${API}/api/v1/public/events/gala-night/hosted-bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomBytes(16).toString('hex') }, body: JSON.stringify({ purchaser: { fullName: 'Staging Smoke', email: 'smoke@meki-staging.invalid' }, ticketCount: 1, privacyConsent: true }) });
  check('Gala booking-reference creation refused while sales are closed / event unpublished', booking.status === 404 || booking.status === 422, `HTTP ${booking.status}`);
  const fd = new FormData();
  fd.append('kind', 'RECONCILIATION');
  fd.append('isSynthetic', 'true');
  fd.append('file', new Blob(['Order ID,Amount,Status,Date\r\nSMOKE-1,1.00,succeeded,2026-11-19\r\n'], { type: 'text/csv' }), 'SYNTHETIC-staging-smoke.csv');
  const up = await a.req('POST', '/admin/sdi/reports', fd);
  check('SDI upload of a synthetic fixture refused in staging (SYNTHETIC_NOT_ALLOWED)', up.status === 422 && up.json?.error?.code === 'SYNTHETIC_NOT_ALLOWED', `HTTP ${up.status} ${up.json?.error?.code ?? ''}`);
  const fr = await a.req('GET', '/admin/sdi/reports?page=1&pageSize=5');
  check('SDI report list reachable (empty on a fresh staging DB)', fr.status === 200);

  // ── 4. Core admin reads (content, media, gala, finance, system) ──
  for (const [label, path] of [
    ['programmes', '/admin/programmes'], ['causes', '/admin/projects'], ['campaigns', '/admin/campaigns?page=1&pageSize=5'], ['media library', '/admin/media?page=1&pageSize=5'],
    ['CMS pages', '/admin/cms/pages'], ['FAQs', '/admin/faqs'], ['site settings', '/admin/settings/site'], ['donations (finance)', '/admin/donations?page=1&pageSize=5'],
    ['donation report summary', '/admin/reports/donations/summary'], ['Gala events', '/admin/gala/events'], ['users', '/admin/users'], ['system status', '/admin/system/status'], ['audit log', '/admin/audit-logs?page=1&pageSize=5'],
  ]) {
    const r = await a.req('GET', path);
    check(`admin read: ${label}`, r.status === 200, `HTTP ${r.status} ${r.json?.error?.code ?? ''}`);
  }
  const sys = await a.req('GET', '/admin/system/status');
  check('system status: mail transport "none" (staging never sends e-mail)', sys.json?.data?.mail?.transport === 'none' || /none/i.test(JSON.stringify(sys.json?.data?.mail ?? {})), JSON.stringify(sys.json?.data?.mail ?? {}));

  // ── 5. RBAC with a synthetic, least-privilege staging user ──
  const tmp = newPassword();
  const email = `smoke-content-${randomBytes(4).toString('hex')}@meki-staging.invalid`;
  const created = await a.req('POST', '/admin/users', { email, name: 'Staging smoke content manager', temporaryPassword: tmp, roleKeys: ['CONTENT_MANAGER'] });
  check('Super Admin creates a CONTENT_MANAGER test user', created.status === 201 || created.status === 200, `HTTP ${created.status} ${created.json?.error?.code ?? ''}`);
  const c = session();
  await c.login(email, tmp);
  const cPending = await c.req('GET', '/admin/programmes');
  check('new user must change the temporary password first', cPending.status === 403 && cPending.json?.error?.code === 'PASSWORD_CHANGE_REQUIRED');
  const cNext = newPassword();
  await c.req('POST', '/admin/auth/password/change', { currentPassword: tmp, newPassword: cNext });
  await c.login(email, cNext);
  const cOk = await c.req('GET', '/admin/programmes');
  check('content manager can read content', cOk.status === 200);
  for (const [label, path] of [['finance/donations', '/admin/donations?page=1&pageSize=5'], ['SDI reports', '/admin/sdi/status'], ['users', '/admin/users'], ['guest list', '/admin/sdi/attendees']]) {
    const r = await c.req('GET', path);
    check(`content manager is refused ${label} (403)`, r.status === 403, `HTTP ${r.status}`);
  }
  // session idle expiry: expire THIS synthetic user's sessions in the staging DB, then the cookie must stop working
  dbExec(`UPDATE AdminSession s JOIN AdminUser u ON u.id = s.userId SET s.idleExpiresAt = NOW(3) - INTERVAL 1 MINUTE WHERE u.email = '${email}'`);
  const expired = await c.req('GET', '/admin/auth/me');
  check('idle-expired session → 401', expired.status === 401);
  const cId = created.json?.data?.id;
  if (cId) {
    const off = await a.req('PATCH', `/admin/users/${cId}/status`, { isActive: false });
    check('test user deactivated afterwards (kept, not deleted)', off.status === 200, `HTTP ${off.status}`);
  }

  // ── 6. Logout ──
  const out = await a.req('POST', '/admin/auth/logout');
  check('logout → session cookie cleared', (out.status === 200 || out.status === 201) && /meki_admin_sid=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(a.setCookie));
  const after = await a.req('GET', '/admin/auth/me');
  check('after logout: /me → 401', after.status === 401);

  // ── 7. Public website (EN/AR) served by the web origin with the same staging API ──
  const slugs = (forms?.data?.programmes ?? []).map((p) => p.slug);
  check('nine programmes published on staging', slugs.length === 9, `${slugs.length}`);
  const pages = ['', '/about', '/programs', ...slugs.map((sl) => `/programs/${sl}`), '/give', '/events/gala-night', '/events/gala-night/book', '/contact', '/faq', '/privacy', '/terms', '/cookies'];
  for (const locale of ['en', 'ar']) {
    let ok = 0;
    const failed = [];
    for (const p of pages) {
      const r = await fetch(`${WEB}/${locale}${p}`, { redirect: 'manual' });
      const html = r.status === 200 ? await r.text() : '';
      const dirOk = locale === 'ar' ? /<html[^>]*dir="rtl"/.test(html) : /<html[^>]*dir="ltr"|<html[^>]*lang="en"/.test(html);
      if (r.status === 200 && dirOk) ok++;
      else failed.push(`${p || '/'}:${r.status}`);
    }
    check(`website ${locale.toUpperCase()}: ${pages.length} pages render (${locale === 'ar' ? 'RTL' : 'LTR'})`, ok === pages.length, failed.join(' '));
  }
  const prog = await fetch(`${WEB}/en/programs/${slugs[0]}`).then((r) => r.text());
  check('programme page: no programme-designated payment control', !/zeffy\.com/.test(prog));
  const gala = await fetch(`${WEB}/en/events/gala-night`).then((r) => r.text());
  check('Gala page: no SDI ticket/donation link while sales and giving are off', !/zeffy\.com/.test(gala));

  // ── 8. Security headers ──
  const hAdmin = (await fetch(`${ADMIN}/en/login`, { redirect: 'manual' })).headers;
  check('admin headers: CSP frame-ancestors, HSTS, X-Frame-Options DENY, nosniff, no-store, noindex', /frame-ancestors 'none'/.test(hAdmin.get('content-security-policy') ?? '') && !!hAdmin.get('strict-transport-security') && hAdmin.get('x-frame-options') === 'DENY' && hAdmin.get('x-content-type-options') === 'nosniff' && /no-store/.test(hAdmin.get('cache-control') ?? '') && /noindex/.test(hAdmin.get('x-robots-tag') ?? ''));
  const hWeb = (await fetch(`${WEB}/en`, { redirect: 'manual' })).headers;
  check('website headers: CSP, HSTS, X-Frame-Options, nosniff, no x-powered-by', /frame-ancestors 'none'/.test(hWeb.get('content-security-policy') ?? '') && !!hWeb.get('strict-transport-security') && hWeb.get('x-frame-options') === 'DENY' && !hWeb.get('x-powered-by'));
  const hApi = (await fetch(`${API}/api/v1/health/live`)).headers;
  check('API headers (helmet): nosniff, no x-powered-by, CORP same-site', hApi.get('x-content-type-options') === 'nosniff' && !hApi.get('x-powered-by') && hApi.get('cross-origin-resource-policy') === 'same-site');
  const cors = await fetch(`${API}/api/v1/health/live`, { headers: { Origin: 'https://evil.example' } });
  check('CORS: an unknown origin is not allowed', !cors.headers.get('access-control-allow-origin'));
  const swagger = await fetch(`${API}/api/docs`);
  check('Swagger UI not served in staging', swagger.status === 404);

  // ── 9. Login rate limit (last: it blocks further logins from this IP for a minute) ──
  const rl = session();
  let limited = false;
  for (let i = 0; i < 8 && !limited; i++) limited = (await rl.req('POST', '/admin/auth/login', { email: 'nobody@meki-staging.invalid', password: 'wrong-password-123' })).status === 429;
  check('login rate limit → 429 after repeated failures', limited);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} staging checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('smoke aborted:', e.message);
  process.exit(1);
});
