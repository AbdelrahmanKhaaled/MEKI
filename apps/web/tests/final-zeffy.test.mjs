import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { OFFICIAL_GALA_FORMS, isOfficialZeffyUrl, officialFormUrl } from '../src/lib/official-forms.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('official Gala forms are exactly the client-supplied Zeffy URLs', () => {
  assert.equal(OFFICIAL_GALA_FORMS.ticket, 'https://www.zeffy.com/en-US/ticketing/misr-el-kheir-foundation-gala-new-york');
  assert.equal(OFFICIAL_GALA_FORMS.donation, 'https://www.zeffy.com/en-US/donation-form/misr-el-kheir-foundation-gala-new-york-donation');
  for (const u of Object.values(OFFICIAL_GALA_FORMS)) assert.equal(isOfficialZeffyUrl(u), true);
});

test('hand-off is off unless its release switch is exactly "true"', () => {
  for (const v of [undefined, '', 'false', '1', 'TRUE', 'yes', ' true']) {
    assert.equal(officialFormUrl('ticket', v), null);
    assert.equal(officialFormUrl('donation', v), null);
  }
  assert.equal(officialFormUrl('ticket', 'true'), OFFICIAL_GALA_FORMS.ticket);
  assert.equal(officialFormUrl('donation', 'true'), OFFICIAL_GALA_FORMS.donation);
});

test('URL guard rejects look-alike, insecure or decorated URLs', () => {
  for (const u of ['http://www.zeffy.com/en-US/x', 'https://zeffy.com.evil.example/x', 'https://www.zeffy.com.evil.example/x', 'https://user:pw@www.zeffy.com/x', 'https://www.zeffy.com/x?next=evil', 'https://www.zeffy.com:8443/x', 'not a url'])
    assert.equal(isOfficialZeffyUrl(u), false, u);
});

test('pages keep the reference-first flow preferred and never fabricate an embed', () => {
  const flow = read('../src/components/booking/BookingFlow.tsx');
  assert.match(flow, /if \(officialFormUrl && !avail\.soldOut\) return <OfficialFormHandoff kind="ticket"/);
  const donate = read('../src/app/[locale]/events/gala-night/donate/page.tsx');
  assert.match(donate, /options\?\.available \? null : donationHandoffUrl\(\)/);
  const handoff = read('../src/components/booking/OfficialFormHandoff.tsx');
  assert.doesNotMatch(handoff, /<iframe/i);
  assert.match(handoff, /rel="noopener noreferrer external"/);
  for (const f of ['BookingFlow.tsx', 'OfficialFormHandoff.tsx']) assert.doesNotMatch(read(`../src/components/booking/${f}`), /zeffy\.com/);
});

test('hand-off copy is honest in both languages (no MEKI reference, confirmation from SDI/Zeffy)', async () => {
  const src = read('../src/content/official-forms.ts');
  assert.doesNotMatch(src, /EB-|DN-|USD|\$\d/);
  assert.match(src, /confirmed only by the e-mail you receive from SDI\/Zeffy/);
  assert.match(src, /يتأكد حجزك فقط/);
  assert.match(src, /يتأكد تبرعك فقط/);
});
