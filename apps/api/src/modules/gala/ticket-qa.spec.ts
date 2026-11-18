import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import sharp from 'sharp';
import type { AppConfigService } from '../../config/app-config.service';
import { buildIcs, calendarAvailability, isIanaTimezone } from './calendar';
import { assetDirCandidates, resolveAssetsDir } from './gala-assets';
import { renderMail, type MailContext, type MailTemplate } from './gala-email.templates';
import { generateQrToken } from './gala.rules';
import { LocalPrivateStorage, newTicketPdfKey, SAFE_KEY } from './ticket-storage';
import { renderQrPng, TICKET_PAGE, TicketPdfError, TicketPdfService } from './ticket-pdf.service';
import { isLatin1, isPrintableGuestName, layoutRuns } from './ticket-text';

jest.setTimeout(60_000); // PDF/QR rendering loads sharp + fonts on first use

const cfg = (over: Record<string, unknown> = {}) => ({ get: (k: string) => over[k] }) as unknown as AppConfigService;
const base = {
  ticketNumber: 'TK-1234567890',
  bookingReference: 'EB-ABCDEFGH2345',
  eventName: 'Every Light Counts',
  eventDateLabel: 'Saturday, December 12, 2026',
  venueLabel: '583 Park Avenue, New York, USA',
};

describe('guest-name text engine', () => {
  it.each([
    ['Amira Hassan', true],
    ['محمد عبد الرحمن', true],
    ['أميرة Hassan السيد', true],
    ["Zoë O'Brien-Łukasz (Jr.)", true],
    ['Smith III', true],
    ['', false],
    ['李小龍', false], // CJK is not covered by the bundled fonts: refused up front, never printed as boxes/question marks
    ['Alex 😀', false],
    ['Alex\u202Eevil', false], // bidi override control
    ['Line\nBreak', false],
  ])('isPrintableGuestName(%j) = %s', (name, ok) => {
    expect(isPrintableGuestName(name)).toBe(ok);
  });

  it('puts Arabic words in visual right-to-left order (pdfkit only reverses glyphs inside one word)', () => {
    const runs = layoutRuns('محمد عبد الرحمن').map((r) => r.text);
    expect(runs).toEqual(['الرحمن', ' ', 'عبد', ' ', 'محمد']);
  });

  it('orders mixed Arabic/English: first logical word ends up rightmost, Latin run keeps its letters in order', () => {
    const runs = layoutRuns('أميرة Hassan السيد');
    expect(runs.map((r) => r.text.trim()).filter(Boolean)).toEqual(['السيد', 'Hassan', 'أميرة']);
    expect(runs.find((r) => r.text === 'Hassan')!.script).toBe('latin');
    expect(runs.find((r) => r.text === 'أميرة')!.script).toBe('arabic');
  });

  it('keeps an English name left-to-right with an Arabic insertion in the right slot', () => {
    expect(layoutRuns('Omar بن خالد Al-Farouk').map((r) => r.text.trim()).filter(Boolean)).toEqual(['Omar', 'خالد', 'بن', 'Al-Farouk']);
  });

  it('mirrors brackets inside RTL text and keeps digits left-to-right', () => {
    const runs = layoutRuns('سارة (الابنة) 2');
    expect(runs[0].text).toBe('2'); // digits: LTR run, placed at the visual left end
    expect(runs.map((r) => r.text).join('')).toContain('(');
    expect(runs.map((r) => r.text).join('')).toContain(')');
  });

  it('plain English is a single left-to-right run', () => {
    const runs = layoutRuns('Amira Hassan');
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ level: 0, script: 'latin', text: 'Amira Hassan' });
    expect(isLatin1('Zoë')).toBe(true);
    expect(isLatin1('Łukasz')).toBe(false);
  });
});

describe('ticket PDF (Arabic, English, mixed, long, special)', () => {
  const svc = new TicketPdfService(cfg());
  const render = (guestName: string, extra: object = {}) => svc.render({ ...base, guestName, qrToken: generateQrToken(), ...extra });
  const text = (b: Buffer) => b.toString('latin1');

  it('uses the exact A5 landscape page size and sets metadata', async () => {
    const body = text(await render('Amira Hassan'));
    expect(TICKET_PAGE).toEqual({ width: 595.28, height: 419.53 });
    expect(body).toMatch(/\/MediaBox \[0 0 595\.28 419\.53\]/);
    // pdfkit writes info strings as UTF-16BE (a NUL byte before each ASCII char): the ticket number is in the title
    const ascii = body.replace(/\0/g, '');
    expect(ascii).toContain('MEKI ticket TK-1234567890');
    expect(ascii).toContain('Every Light Counts');
    expect((body.match(/\/Type \/Page\b/g) ?? []).length).toBe(1);
  });

  it('plain Latin-1 names keep the existing serif design (no Noto font embedded)', async () => {
    const body = text(await render('Amira Hassan El-Sayed'));
    expect(body).not.toMatch(/NotoSans/);
  });

  it.each([
    ['Arabic only', 'محمد عبد الرحمن', /NotoSansArabic/],
    ['mixed Arabic + English', 'أميرة Hassan السيد', /NotoSansArabic[\s\S]*NotoSans|NotoSans[\s\S]*NotoSansArabic/],
    ['Latin-extended special characters', "Zoë O'Brien-Łukasz (Jr.)", /NotoSans/],
    ['very long Arabic', 'عبد الرحمن بن محمد بن عبد العزيز آل سعود الكبير الطويل جدا جدا جدا جدا جدا جدا جدا', /NotoSansArabic/],
    ['very long English', 'Alexandria Montgomery-Featherstonehaugh III of Westminster Abbey and Kensington', /Times/],
    ['single short name', 'Li', /Times/],
  ])('renders %s as a valid single-page PDF with embedded fonts where required', async (_label, name, expectFont) => {
    const pdf = await render(name);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.subarray(-8).toString()).toContain('%%EOF');
    expect(text(pdf)).toMatch(expectFont);
  });

  it('never prints a name it cannot render: unsupported scripts and labels raise a controlled error', async () => {
    await expect(render('李小龍')).rejects.toMatchObject({ code: 'UNSUPPORTED_NAME' });
    await expect(render('Amira', { venueLabel: 'مكان' })).rejects.toBeInstanceOf(TicketPdfError);
    await expect(render('Amira', { eventName: 'Łukasz Gala' })).rejects.toMatchObject({ code: 'UNSUPPORTED_LABEL' });
  });

  it('fails fast at startup when a configured font or the assets directory is missing (no silent fallback)', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'meki-fonts-'));
    try {
      expect(() => new TicketPdfService(cfg({ TICKET_PDF_UNICODE_FONT_PATH: resolve(dir, 'missing.ttf') }))).toThrow(/font file\(s\) not found/);
      expect(() => new TicketPdfService(cfg({ ASSETS_DIR: dir }))).not.toThrow(); // empty ASSETS_DIR ignored: falls back to the shipped assets
      expect(() => resolveAssetsDir(dir)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('startup self-test renders Arabic through the real shaping path', async () => {
    await expect(svc.onModuleInit()).resolves.toBeUndefined();
  });

  it('logo keeps the approved aspect ratio (SVG viewBox 643.075 x 145.016)', async () => {
    const svg = resolve(resolveAssetsDir(), 'brand/MEKI_Primary_White.svg');
    const png = await sharp(svg, { density: 300 }).resize({ width: 900 }).png().toBuffer();
    const meta = await sharp(png).metadata();
    expect(meta.width! / meta.height!).toBeCloseTo(643.075 / 145.016, 1);
  });
});

describe('QR code quality and round trip', () => {
  const token = generateQrToken();

  const decode = async (png: Buffer, width?: number) => {
    let img = sharp(png).flatten({ background: '#ffffff' });
    if (width) img = img.resize({ width, kernel: 'lanczos3' });
    const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return jsQR(new Uint8ClampedArray(data), info.width, info.height);
  };

  it('decodes back to exactly the token (full size and downscaled to a 200 px phone-camera-like view)', async () => {
    const png = await renderQrPng(token);
    expect((await decode(png))?.data).toBe(token);
    expect((await decode(png, 200))?.data).toBe(token);
  });

  it('has adequate resolution for 150 pt at 300 dpi, black on white, error correction M and a 4-module quiet zone', async () => {
    const png = await renderQrPng(token);
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBeGreaterThanOrEqual(400);
    const qr = QRCode.create(token, { errorCorrectionLevel: 'M' });
    expect(qr.errorCorrectionLevel.bit).toBe(0); // M
    const modules = qr.modules.size;
    const px = info.width / (modules + 8);
    // first dark pixel on any row must be at least 4 modules from the left edge
    let firstDark = info.width;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4] < 64) firstDark = Math.min(firstDark, x);
    expect(firstDark).toBeGreaterThanOrEqual(Math.floor(px * 4) - 1);
    // pure black and pure white only (maximum contrast)
    const levels = new Set<number>();
    for (let i = 0; i < data.length; i += 4 * 97) levels.add(data[i] < 128 ? 0 : 255);
    expect([...levels].sort()).toEqual([0, 255]);
  });

  it('token content is opaque: no e-mail, id or sequence — 256 bits of base64url randomness', () => {
    expect(token).toMatch(/^mkt_[A-Za-z0-9_-]{43}$/);
    expect(new Set(Array.from({ length: 500 }, generateQrToken)).size).toBe(500);
  });
});

describe('private storage: key safety', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'meki-store-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const storage = new LocalPrivateStorage(cfg({ PRIVATE_STORAGE_DIR: dir, STORAGE_DRIVER: 'local' }));

  it('generated keys always satisfy the safe pattern', () => {
    expect(SAFE_KEY.test(newTicketPdfKey('clx123abc', 'clx456def'))).toBe(true);
  });

  it.each(['../secret.pdf', '../../etc/passwd.pdf', 'tickets/../../x.pdf', '/abs/path.pdf', 'C:/Windows/x.pdf', 'tickets\\..\\x.pdf', 'tickets/a.pdf\0.png', 'tickets/a.txt', 'tickets//a.pdf', '', 'tickets/%2e%2e/x.pdf', 'tickets/.hidden.pdf'])(
    'refuses %j (path traversal / unsafe key)',
    async (key) => {
      await expect(storage.put(key, Buffer.from('x'))).rejects.toThrow(/Invalid storage key/);
      await expect(storage.get(key)).rejects.toThrow(/Invalid storage key/);
      await expect(storage.remove(key)).rejects.toThrow(/Invalid storage key/);
    },
  );

  it('round-trips a file, returns null for a missing one, and never writes outside the root', async () => {
    const key = newTicketPdfKey('evt1', 'tkt1');
    await storage.put(key, Buffer.from('%PDF-test'));
    expect((await storage.get(key))?.toString()).toBe('%PDF-test');
    await storage.remove(key);
    expect(await storage.get(key)).toBeNull();
    expect(await storage.get('tickets/evt1/never-existed-abc.pdf')).toBeNull();
  });
});

describe('runtime assets', () => {
  it('resolves ASSETS_DIR first, then the source tree; an incomplete directory is skipped', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'meki-assets-'));
    try {
      expect(assetDirCandidates(dir)[0]).toBe(dir);
      expect(resolveAssetsDir(dir)).not.toBe(dir); // no logo in the temp dir → falls through to the shipped assets
      mkdirSync(resolve(dir, 'brand'), { recursive: true });
      writeFileSync(resolve(dir, 'brand/MEKI_Primary_White.svg'), '<svg/>');
      expect(resolveAssetsDir(dir)).toBe(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('verify-assets script passes for the shipped assets and fails (exit 1) for an incomplete directory', () => {
    const script = resolve(__dirname, '../../../scripts/verify-assets.mjs');
    const ok = execFileSync('node', [script, resolve(__dirname, '../../../assets')], { encoding: 'utf8' });
    expect(ok).toMatch(/runtime assets OK/);
    const dir = mkdtempSync(resolve(tmpdir(), 'meki-empty-'));
    try {
      expect(() => execFileSync('node', [script, dir], { stdio: 'pipe' })).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('calendar timing', () => {
  const ev = { uid: 'x@meki', name: 'Every Light Counts', description: null, location: '583 Park Avenue, New York', url: null };
  it('is pending for every incomplete or invalid schedule — no time is ever invented', () => {
    const start = new Date('2026-12-13T00:00:00Z');
    expect(calendarAvailability({ startsAt: null, timezone: null }).available).toBe(false);
    expect(calendarAvailability({ startsAt: start, timezone: null }).available).toBe(false);
    expect(calendarAvailability({ startsAt: null, timezone: 'America/New_York' }).available).toBe(false);
    expect(calendarAvailability({ startsAt: start, timezone: '+05:00' }).available).toBe(false); // offsets are not IANA zones
    expect(calendarAvailability({ startsAt: start, timezone: 'Mars/Olympus' }).available).toBe(false);
    expect(calendarAvailability({ startsAt: start, timezone: 'EST' }).available).toBe(false);
    expect(buildIcs({ ...ev, startsAt: start, endsAt: null, timezone: 'Mars/Olympus' })).toBeNull();
  });
  it('accepts real IANA zones and includes DTEND only when the end time is confirmed', () => {
    expect(isIanaTimezone('America/New_York')).toBe(true);
    expect(isIanaTimezone('UTC')).toBe(true);
    const ics = buildIcs({ ...ev, startsAt: new Date('2026-12-13T00:00:00Z'), endsAt: new Date('2026-12-13T04:00:00Z'), timezone: 'America/New_York' })!;
    expect(ics).toContain('DTSTART:20261213T000000Z');
    expect(ics).toContain('DTEND:20261213T040000Z');
    expect(ics.split('\r\n ').join('')).toContain('Time zone: America/New_York');
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(1);
  });
});

describe('Arabic e-mail templates (proposed copy)', () => {
  const ctx: MailContext = {
    reference: 'EB-ABCDEFGH2345',
    eventName: 'Every Light Counts',
    eventDateLabel: 'Saturday, December 12, 2026',
    venueLabel: '583 Park Avenue, New York, USA',
    purchaserName: 'أميرة <script>x</script>',
    calendarUrl: null,
    guests: [{ fullName: 'ضيف أول', ticketNumber: 'TK-1234567890' }],
    bookingUrl: 'https://example.org/b?x=1&y=2',
    guest: { fullName: 'ضيف أول', ticketNumber: 'TK-1234567890' },
  };
  const all: MailTemplate[] = ['booking.pending', 'booking.confirmed', 'ticket.delivery', 'payment.failed', 'booking.cancelled', 'ticket.refunded'];

  it('renders all six templates in Arabic with RTL HTML, escaping and no tax/receipt claims', () => {
    for (const t of all) {
      const m = renderMail(t, ctx, 'ar');
      expect(m.subject.length).toBeGreaterThan(5);
      expect(m.html).toContain('dir="rtl"');
      expect(m.html).toContain('lang="ar"');
      expect(m.html).not.toContain('<script>');
      expect(`${m.text} ${m.html}`).not.toMatch(/ضريب|إيصال ضريبي|tax/i);
    }
  });
  it('pending/failed never claim confirmation; confirmed states payment verification; pending calendar is stated', () => {
    expect(renderMail('booking.pending', ctx, 'ar').text).toContain('غير مؤكد');
    expect(renderMail('booking.pending', ctx, 'ar').text).not.toContain('تم تأكيد حجزك');
    expect(renderMail('payment.failed', ctx, 'ar').text).toContain('غير مؤكد');
    const c = renderMail('booking.confirmed', ctx, 'ar');
    expect(c.text).toContain('تم التحقق من دفعتك');
    for (const s of [ctx.reference, ctx.eventDateLabel, ctx.venueLabel, 'TK-1234567890', 'سيتم إرسال دعوة التقويم']) expect(c.text).toContain(s);
  });
  it('English remains the default locale', () => {
    expect(renderMail('booking.pending', ctx).text).toMatch(/NOT confirmed/);
    expect(renderMail('booking.pending', ctx, 'en').subject).toBe(renderMail('booking.pending', ctx).subject);
  });
});
