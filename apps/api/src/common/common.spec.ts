import { detectDocumentMime, detectImageMime, isDocumentMime, sanitizeFilename } from '../modules/media/media.validation';
import { SYSTEM_ROLES, ALL_PERMISSIONS } from '../modules/users/permissions.catalog';
import { SAFE_HREF } from './dto/shared.dto';
import { parseSort, slugify } from './utils';
import { localize } from './utils/localize';

describe('media validation', () => {
  it('detects formats from magic bytes only', () => {
    expect(detectImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('image/jpeg');
    expect(detectImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).toBe('image/png');
    expect(detectImageMime(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(detectImageMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(detectImageMime(Buffer.from('GIF89a........'))).toBeNull();
  });

  it('accepts a PDF only with a PDF header AND an end-of-file marker (24 Nov 2026 sponsorship packages)', () => {
    const body = 'x'.repeat(200);
    expect(detectDocumentMime(Buffer.from(`%PDF-1.7\n${body}\n%%EOF\n`))).toBe('application/pdf');
    expect(detectDocumentMime(Buffer.from(`%PDF-1.7\n${body}`))).toBeNull(); // truncated upload
    expect(detectDocumentMime(Buffer.from(`<html>%PDF-1.7 ${body} %%EOF`))).toBeNull(); // header must come first
    expect(detectDocumentMime(Buffer.from(`PK\u0003\u0004${body}%%EOF`))).toBeNull(); // e.g. a .docx renamed .pdf
    expect(detectImageMime(Buffer.from(`%PDF-1.7\n${body}\n%%EOF\n`))).toBeNull(); // never treated as an image
    expect(isDocumentMime('application/pdf')).toBe(true);
    expect(isDocumentMime('image/png')).toBe(false);
  });

  it('sanitises display filenames', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\x\\a<b>.png')).toBe('ab.png');
    expect(sanitizeFilename('صورة  المياه.jpg')).toBe('صورة المياه.jpg');
  });
});

describe('localize', () => {
  const row = { titleEn: 'Hello', titleAr: 'مرحبا', bodyEn: 'Body', bodyAr: null, nested: [{ labelEn: 'A', labelAr: null }], value: 5 };
  it('returns the bilingual shape without a locale', () => {
    expect(localize(row)).toBe(row);
  });
  it('flattens for English', () => {
    expect(localize(row, 'en')).toEqual({ title: 'Hello', body: 'Body', nested: [{ label: 'A' }], value: 5 });
  });
  it('falls back to English for missing Arabic and reports it', () => {
    expect(localize(row, 'ar')).toEqual({
      title: 'مرحبا',
      body: 'Body',
      translationFallback: ['body'],
      nested: [{ label: 'A', translationFallback: ['label'] }],
      value: 5,
    });
  });
  it('does not treat unrelated keys ending in "en" as translations', () => {
    expect(localize({ token: 'x', children: 1 }, 'ar')).toEqual({ token: 'x', children: 1 });
  });
});

describe('utils', () => {
  it('slugify', () => {
    expect(slugify('WASH, Environment & Climate Resilience')).toBe('wash-environment-and-climate-resilience');
    expect(slugify('دعم المستشفيات')).toBe('');
  });
  it('parseSort only allows listed fields', () => {
    expect(parseSort('nameEn:desc,passwordHash:asc', ['nameEn'], { sortOrder: 'asc' })).toEqual([{ nameEn: 'desc' }]);
    expect(parseSort(undefined, ['nameEn'], { sortOrder: 'asc' })).toEqual([{ sortOrder: 'asc' }]);
  });
  it('SAFE_HREF blocks script URLs', () => {
    ['#programmes', '/en/about', 'https://example.org/x', 'mailto:a@b.org'].forEach((h) => expect(SAFE_HREF.test(h)).toBe(true));
    ['javascript:alert(1)', 'data:text/html,x', 'http://insecure.org', '//evil.org'].forEach((h) => expect(SAFE_HREF.test(h)).toBe(false));
  });
});

describe('permission catalog', () => {
  it('every role only references known permissions', () => {
    for (const role of Object.values(SYSTEM_ROLES)) role.permissions.forEach((p) => expect(ALL_PERMISSIONS).toContain(p));
  });
  it('separation of duties', () => {
    expect(SYSTEM_ROLES.CAMPAIGN_MANAGER.permissions).not.toContain('campaigns.approve');
    expect(SYSTEM_ROLES.CONTENT_MANAGER.permissions).not.toContain('statistics.verify');
    expect(SYSTEM_ROLES.ADMINISTRATOR.permissions).not.toContain('roles.manage');
    // Finance may request/execute refunds and issue receipts, but never approve refunds or manage users/content.
    expect(SYSTEM_ROLES.FINANCE_MANAGER.permissions).not.toContain('refunds.approve');
    expect(SYSTEM_ROLES.FINANCE_MANAGER.permissions.filter((p) => !p.endsWith('.read')).sort()).toEqual(['receipts.issue', 'refunds.execute', 'refunds.request']);
  });
});
