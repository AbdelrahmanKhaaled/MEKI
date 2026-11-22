import assert from 'node:assert/strict';
import test from 'node:test';
import { buildIntentRequest, giveHref, isRoutable, newGivingForm, resolveRoute } from '../src/lib/giving.ts';

const noZakat = { allowed: false, reason: 'NOT_ZAKAT_ELIGIBLE' };
const options = { channels: { general: { available: false, reason: 'NOT_AUTHORIZED_BY_SDI', zakat: noZakat } }, programmes: [{ slug: 'health', name: 'Health', payable: false, reason: 'NOT_AUTHORIZED_BY_SDI', zakat: noZakat }], galaOnly: { active: true, project: { name: 'Approved Gala project' }, eventSlug: 'gala-night', zakat: noZakat } };

test('Gala alternative requires explicit acceptance and preserves programme as interest only', () => {
  const preview = resolveRoute(options, 'health', false, 'General');
  assert.equal(preview.kind, 'galaOffer');
  assert.equal(preview.available, false);
  assert.equal(preview.interestName, 'Health');
  const accepted = resolveRoute(options, 'health', true, 'General');
  assert.equal(accepted.available, true);
  assert.equal(accepted.destinationName, 'Approved Gala project');
  assert.equal(accepted.zakat.allowed, false);
  const request = buildIntentRequest('general', { ...newGivingForm('health'), acceptGala: true, classification: 'SADAQAH', amount: '50', fullName: 'Test Donor', email: 'test@example.invalid' }, 'ar', 'gala-night', true);
  assert.equal(request.intentType, 'GALA_DONATION');
  assert.equal(request.sourceInterest, 'health');
  assert.equal(request.acknowledgeGalaDestination, true);
  assert.ok(!('programmeSlug' in request));
});

test('own authorized programme channel takes priority; disabled mode offers no payment route', () => {
  const own = { ...options, programmes: [{ ...options.programmes[0], payable: true }] };
  assert.equal(resolveRoute(own, 'health', false, 'General').kind, 'own');
  const closed = { ...options, galaOnly: { ...options.galaOnly, active: false } };
  assert.equal(resolveRoute(closed, 'health', true, 'General').available, false);
  assert.equal(isRoutable(closed, 'health'), false);
  assert.equal(isRoutable(options, 'health'), true);
});

test('EN and AR Give links carry source and valid amount without access tokens', () => {
  for (const locale of ['en', 'ar']) {
    assert.equal(giveHref(locale, { programmeSlug: 'health', amount: '50.00' }), `/${locale}/give?programme=health&amount=50.00#prepare`);
    assert.equal(giveHref(locale, { programmeSlug: '../invalid', amount: '-5' }), `/${locale}/give#prepare`);
  }
});

// ── component guarantees (static) ──
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { givingAr, givingEn } from '../src/content/giving.ts';
const src = (p) => readFileSync(join(import.meta.dirname, '../src', p), 'utf8');

test('every Give button: routes to the real journey when payable, otherwise the truthful dialog (with a preview link)', () => {
  const provider = src('components/DonateProvider.tsx');
  assert.match(provider, /if \(isRoutable\(giving, slug\)\) \{\s*router\.push\(giveHref\(/);
  assert.match(provider, /data-testid="donate-dialog-preview"/);
  assert.match(provider, /clientApi<PublicGivingOptions>\(`\/public\/giving\/options\?locale=/);
  const quick = src('components/QuickDonate.tsx');
  assert.match(quick, /programmeSlug: k0 === "programme" \? s0 : undefined, amountValue: String\(value\)/);
});

test('giving form: a Gala offer is never payable without the donor ticking the acceptance box; changing the programme resets it', () => {
  const form = src('components/giving/GivingForm.tsx');
  assert.match(form, /if \(offer && !form\.acceptGala\) \{/);
  assert.match(form, /data-testid="gala-only-accept"/);
  assert.match(form, /acceptGala: false \}\)\}/); // destination change resets the acceptance
  assert.match(form, /!!offer && form\.acceptGala\)/);
  assert.match(form, /\[f0\.reviewInterest, interestName\], \[f0\.reviewRedirected, destinationName\]/);
});

test('Gala donation page has no ungated reference-less SDI link', () => {
  const page = src('app/[locale]/events/gala-night/donate/page.tsx');
  // Final release (client instruction): the ONLY external route is the official-form hand-off behind its own release switch
  // (default OFF, src/lib/official-forms.ts) and only when the DN- reference flow is not open. No hard-coded link on the page.
  assert.doesNotMatch(page, /directUrl|target="_blank"|https?:\/\/[^\s"]*zeffy/i);
  assert.match(page, /const handoff = options\?\.available \? null : donationHandoffUrl\(\);/);
  assert.match(page, /<GivingForm locale=\{locale\} mode="gala"/);
});

test('Gala-only disclosure copy: EN/AR parity; says plainly the gift does NOT go to the programme', () => {
  for (const k of ['title', 'text', 'accept', 'generalInterest', 'required']) assert.ok(givingEn.form.galaOffer[k] && givingAr.form.galaOffer[k], k);
  assert.match(givingEn.form.galaOffer.text, /not to \{interest\}/);
  assert.match(givingAr.form.galaOffer.text, /وليس إلى \{interest\}/);
  assert.ok(givingEn.form.reviewInterest && givingAr.form.reviewRedirected && givingAr.status.rows.interest);
});

test('mobile homepage programme panel has its own Give button carrying the programme interest', () => {
  const s = src('components/sections/Programmes.tsx');
  const mobile = s.slice(s.indexOf('Mobile inline panel'), s.indexOf('Sticky visual panel'));
  assert.match(mobile, /<GiveButton selection=\{\{ destination: item\.name, programmeSlug: item\.slug \}\}/);
});
