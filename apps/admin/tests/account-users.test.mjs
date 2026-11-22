import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { accountAr, accountEn } from '../src/lib/i18n-account.ts';
import { NAV } from '../src/lib/navigation.ts';
import { passwordProblems } from '../src/lib/password-policy.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const keysDeep = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keysDeep(v, `${p}${k}.`) : [`${p}${k}`])).sort();

test('first sign-in with a temporary password is not a dead end: AppShell renders the forced change form', () => {
  assert.match(read('../src/components/layout/AppShell.tsx'), /<AccountGate>\{children\}<\/AccountGate>/);
  assert.match(read('../src/features/account/AccountGate.tsx'), /user\?\.mustChangePassword \? <ChangePasswordForm forced \/>/);
  const svc = read('../src/services/users.ts');
  assert.match(svc, /apiPost\("\/admin\/auth\/password\/change"/);
  // a wrong current password (401) must not sign the user out
  assert.match(read('../src/lib/api.ts'), /path !== "\/admin\/auth\/password\/change"/);
});

test('Users & Roles is a real route gated by users.read; header offers a voluntary password change', () => {
  const item = NAV.flatMap((g) => g.items).find((i) => i.key === 'users');
  assert.equal(item.href, '/users');
  assert.deepEqual(item.anyOf, ['users.read']);
  assert.match(read('../src/components/layout/Header.tsx'), /account\/password/);
  for (const r of ['users', 'account/password']) assert.ok(read(`../src/app/[locale]/(dashboard)/${r}/page.tsx`).includes('notFound'));
});

test('password guidance mirrors the API policy', () => {
  assert.deepEqual(passwordProblems('short1'), ['short']);
  assert.deepEqual(passwordProblems('onlyletterslong'), ['mix']);
  assert.deepEqual(passwordProblems('a'.repeat(129) + '1'), ['long']);
  assert.deepEqual(passwordProblems('finance-lead-2026', 'finance-lead@meki-us.org'), ['email']);
  assert.deepEqual(passwordProblems('Correct horse 2026!', 'admin@meki-us.org'), []);
});

test('account and users copy has EN/AR parity and no empty Arabic strings', () => {
  assert.deepEqual(keysDeep(accountAr), keysDeep(accountEn));
  const walk = (o) => Object.values(o).forEach((v) => (typeof v === 'string' ? assert.ok(v.trim()) : walk(v)));
  walk(accountAr);
});

test('user management never shows or stores passwords and relies on API rules', () => {
  const page = read('../src/features/users/UsersPage.tsx');
  assert.doesNotMatch(page, /localStorage|sessionStorage|console\./);
  assert.match(page, /autoComplete="new-password"/);
  assert.match(page, /u\.id !== me\?\.id/); // no self-deactivation button (the API also refuses)
});
