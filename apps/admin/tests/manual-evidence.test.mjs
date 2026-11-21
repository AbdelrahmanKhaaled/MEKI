import assert from 'node:assert/strict';
import test from 'node:test';
import { evidenceAr, evidenceEn } from '../src/lib/i18n-evidence.ts';
import { NAV } from '../src/lib/navigation.ts';

test('private evidence queue requires finance permission and has EN/AR field and review-state parity', () => {
  const route = NAV.flatMap((g) => g.items).find((i) => i.key === 'sdiEvidence');
  assert.equal(route.href, '/payments/sdi-evidence');
  assert.deepEqual(route.anyOf, ['sdi.reports.upload']);
  assert.deepEqual(Object.keys(evidenceEn.fields), Object.keys(evidenceAr.fields));
  assert.deepEqual(Object.keys(evidenceEn.states), Object.keys(evidenceAr.states));
  for (const value of Object.values(evidenceAr.fields)) assert.ok(value.trim());
  assert.match(evidenceEn.disabled, /authentic SDI confirmation email/);
  assert.match(evidenceEn.privacy, /does not establish bank settlement/);
});

test('every error code the evidence API returns has EN and AR text (no raw codes shown to administrators)', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const api = readFileSync(join(import.meta.dirname, '../../api/src/modules/sdi/manual-evidence.service.ts'), 'utf8');
  const codes = [...new Set([...api.matchAll(/code: "([A-Z_]+)"/g)].map((m) => m[1]))];
  assert.ok(codes.length >= 15, `found ${codes.length} codes`);
  for (const k of codes) assert.ok(evidenceEn.errors[k] && evidenceAr.errors[k], k);
  assert.match(evidenceEn.errors.EXTERNAL_ID_ALREADY_CLAIMED, /Another evidence request/);
});

test('the evidence page shows translated errors and never the internal user id', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const page = readFileSync(join(import.meta.dirname, '../src/features/finance/sdi/ManualEvidencePage.tsx'), 'utf8');
  assert.match(page, /c\.errors\[e\.code\]/);
  assert.doesNotMatch(page, /error\.message|error\?\.message/);
  assert.doesNotMatch(page, /\{selected\.submittedById\}|\{h\.actorId\}/);
  assert.match(page, /selected\.submittedById !== user\?\.id/); // never your own submission
});
