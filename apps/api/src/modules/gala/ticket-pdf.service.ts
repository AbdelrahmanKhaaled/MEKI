import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { AppConfigService } from '../../config/app-config.service';
import { resolveAssetsDir, resolveTicketFonts, type FontSet } from './gala-assets';
import { isLatin1, isPrintableGuestName, layoutRuns, type TextRun } from './ticket-text';

export interface TicketPdfInput {
  ticketNumber: string;
  guestName: string;
  bookingReference: string;
  eventName: string;
  eventDateLabel: string;
  venueLabel: string;
  checkInNote?: string | null;
  /** The opaque QR token — rendered only into the QR image, never as text */
  qrToken: string;
}

/** Controlled failure: the ticket is left without a PDF (retryable) — a broken PDF is never produced. */
export class TicketPdfError extends Error {
  constructor(
    message: string,
    readonly code: 'UNSUPPORTED_NAME' | 'UNSUPPORTED_LABEL' | 'ASSET_MISSING',
  ) {
    super(message);
  }
}

// Brand tokens (apps/web globals): deep green, MEKI green, harvest gold.
const DEEP_GREEN = '#0b3b30';
const MEKI_GREEN = '#008066';
const GOLD = '#d6a146';
const INK = '#1d2b27';
const MUTED = '#5a6b66';

export const DEFAULT_CHECK_IN_NOTE =
  'Present this ticket (printed or on your phone) with photo ID at the entrance. Your QR code admits one guest and can be scanned once only. Please do not share or post it.';

export const TICKET_PAGE = { width: 595.28, height: 419.53 } as const; // A5 landscape in PDF points
const SPLIT = 392;
const QR_SIZE_PT = 150;

/**
 * QR image for a ticket token: error correction M (≈15 %), 4-module quiet zone (the QR standard minimum), 560 px so that
 * 150 pt printed at 300 dpi (≈625 px) is never upscaled by more than 12 %. Black on white only — maximum contrast.
 */
export function renderQrPng(token: string): Promise<Buffer> {
  return QRCode.toBuffer(token, { errorCorrectionLevel: 'M', margin: 4, width: 560, type: 'png', color: { dark: '#000000', light: '#ffffff' } });
}

/** Printable ASCII/Latin-1 punctuation for labels printed with the built-in fonts. */
const assertLatin1 = (label: string, value: string) => {
  if (!isLatin1(value)) throw new TicketPdfError(`${label} contains characters the ticket template cannot print`, 'UNSUPPORTED_LABEL');
};

type AnyDoc = InstanceType<typeof PDFDocument> & { _font: { ascender: number } };

@Injectable()
export class TicketPdfService implements OnModuleInit {
  private readonly logger = new Logger(TicketPdfService.name);
  private readonly assetsDir: string;
  private readonly fonts: FontSet;
  private logo?: Promise<Buffer | null>;

  /** Throws at construction (= application startup) when assets or configured fonts are missing: never a silent fallback. */
  constructor(config: AppConfigService) {
    this.assetsDir = resolveAssetsDir(config.get('ASSETS_DIR'));
    this.fonts = resolveTicketFonts(config, this.assetsDir);
  }

  /** Startup self-test: all four fonts must parse and Arabic shaping must work, otherwise the API refuses to start. */
  async onModuleInit() {
    const buf = await this.render({
      ticketNumber: 'TK-SELFTEST00',
      guestName: 'محمد Self Test',
      bookingReference: 'EB-SELFTEST0000',
      eventName: 'Self test',
      eventDateLabel: 'Self test',
      venueLabel: 'Self test',
      qrToken: `mkt_${'A'.repeat(43)}`,
    });
    if (buf.subarray(0, 5).toString() !== '%PDF-') throw new TicketPdfError('Ticket PDF self-test failed', 'ASSET_MISSING');
    this.logger.log(`ticket PDF ready (assets: ${this.assetsDir})`);
  }

  /** Official MEKI logo (white variant for the green panel), rasterised from the approved SVG — never redrawn. */
  private loadLogo(): Promise<Buffer> {
    this.logo ??= sharp(readFileSync(resolve(this.assetsDir, 'brand/MEKI_Primary_White.svg')), { density: 300 }).resize({ width: 900 }).png().toBuffer();
    return this.logo as Promise<Buffer>;
  }

  // ───────── guest-name rendering (Arabic / Latin / mixed) ─────────

  private fontFor(run: TextRun, bold: boolean) {
    const set = run.script === 'arabic' ? this.fonts.arabic : this.fonts.latin;
    return bold ? set.bold : set.regular;
  }

  private widthOf(doc: AnyDoc, runs: TextRun[], size: number, bold: boolean) {
    return runs.reduce((w, r) => w + doc.font(this.fontFor(r, bold)).fontSize(size).widthOfString(r.text), 0);
  }

  /**
   * Draws one line: runs in visual order, each in the font of its script, baselines aligned across fonts. Shrinks from
   * `size` to `minSize`; if it still does not fit, the LOGICAL text is shortened with an ellipsis (never clipped mid-glyph).
   */
  private drawName(doc: AnyDoc, name: string, x: number, y: number, maxWidth: number, size: number, minSize: number, color: string, bold = false) {
    let text = name;
    let runs = layoutRuns(text);
    let s = size;
    while (s > minSize && this.widthOf(doc, runs, s, bold) > maxWidth) s -= 0.5;
    if (this.widthOf(doc, runs, s, bold) > maxWidth) {
      const chars = Array.from(text);
      while (chars.length > 1 && this.widthOf(doc, layoutRuns(chars.join('') + '…'), s, bold) > maxWidth) chars.pop();
      text = chars.join('').trimEnd() + '…';
      runs = layoutRuns(text);
    }
    const ref = (doc.font(this.fonts.latin.regular).fontSize(s), doc._font.ascender);
    let cx = x;
    for (const r of runs) {
      doc.font(this.fontFor(r, bold)).fontSize(s);
      const dy = ((ref - doc._font.ascender) * s) / 1000; // align baselines of different fonts
      doc.fillColor(color).text(r.text, cx, y + dy, { lineBreak: false });
      cx += doc.widthOfString(r.text);
    }
    return s;
  }

  // ───────── ticket ─────────

  /** One printable A5-landscape ticket. Deterministic apart from the PDF creation date. */
  async render(t: TicketPdfInput): Promise<Buffer> {
    if (!isPrintableGuestName(t.guestName)) throw new TicketPdfError('Guest name contains characters outside the supported Latin and Arabic scripts', 'UNSUPPORTED_NAME');
    for (const [label, v] of [['eventName', t.eventName], ['eventDateLabel', t.eventDateLabel], ['venueLabel', t.venueLabel], ['checkInNote', t.checkInNote ?? '']] as const) assertLatin1(label, v);

    const [qr, logo] = await Promise.all([renderQrPng(t.qrToken), this.loadLogo()]);
    const { width: W, height: H } = TICKET_PAGE;
    const doc = new PDFDocument({
      size: [W, H],
      margin: 0,
      compress: true,
      info: { Title: `MEKI ticket ${t.ticketNumber}`, Author: 'MEKI', Subject: t.eventName, Keywords: 'ticket, MEKI', Producer: 'MEKI ticketing' },
    }) as AnyDoc;
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((res, rej) => {
      doc.on('end', () => res(Buffer.concat(chunks)));
      doc.on('error', rej);
    });

    // Left: deep green panel
    doc.rect(0, 0, SPLIT, H).fill(DEEP_GREEN);
    doc.rect(SPLIT, 0, W - SPLIT, H).fill('#ffffff');
    doc.lineWidth(0.8).strokeColor(GOLD).rect(12, 12, W - 24, H - 24).stroke();
    doc.lineWidth(1.2).moveTo(SPLIT, 12).lineTo(SPLIT, H - 12).dash(3, { space: 3 }).stroke().undash();

    doc.image(logo, 36, 34, { width: 128 }); // 900 px wide source, aspect ratio preserved by pdfkit (width only)

    doc.font('Helvetica-Bold').fontSize(8).fillColor(GOLD).text('ADMIT ONE', 36, 92, { characterSpacing: 2.2 });
    doc.font('Times-Bold').fontSize(30).fillColor('#ffffff').text(t.eventName, 36, 112, { width: SPLIT - 72, lineGap: 1 });
    const afterTitle = doc.y + 8;
    doc.lineWidth(0.8).strokeColor(GOLD).moveTo(36, afterTitle).lineTo(120, afterTitle).stroke();

    // Guest: classic serif for plain Latin-1 names (existing design); Noto Sans / Noto Sans Arabic runs otherwise.
    doc.font('Helvetica-Bold').fontSize(7).fillColor(GOLD).text('GUEST', 36, afterTitle + 14, { characterSpacing: 1.6 });
    const nameBox = SPLIT - 72;
    if (isLatin1(t.guestName)) {
      let size = 22;
      doc.font('Times-Roman');
      while (size > 12 && doc.fontSize(size).widthOfString(t.guestName) > nameBox) size -= 1;
      doc.font('Times-Roman').fontSize(size).fillColor('#ffffff').text(t.guestName, 36, afterTitle + 26, { width: nameBox, lineBreak: false, ellipsis: true });
    } else {
      this.drawName(doc, t.guestName, 36, afterTitle + 24, nameBox, 21, 12, '#ffffff');
    }

    // Date + venue
    const rowY = afterTitle + 70;
    doc.font('Helvetica-Bold').fontSize(7).fillColor(GOLD).text('DATE', 36, rowY, { characterSpacing: 1.6 });
    doc.font('Helvetica').fontSize(10.5).fillColor('#ffffff').text(t.eventDateLabel, 36, rowY + 11, { width: 160 });
    doc.font('Helvetica-Bold').fontSize(7).fillColor(GOLD).text('VENUE', 206, rowY, { characterSpacing: 1.6 });
    doc.font('Helvetica').fontSize(10.5).fillColor('#ffffff').text(t.venueLabel, 206, rowY + 11, { width: SPLIT - 206 - 30 });

    // References
    const refY = H - 78;
    doc.font('Helvetica-Bold').fontSize(7).fillColor(GOLD).text('BOOKING REFERENCE', 36, refY, { characterSpacing: 1.4 });
    doc.font('Courier-Bold').fontSize(12).fillColor('#ffffff').text(t.bookingReference, 36, refY + 11);
    doc.font('Helvetica-Bold').fontSize(7).fillColor(GOLD).text('TICKET NUMBER', 206, refY, { characterSpacing: 1.4 });
    doc.font('Courier-Bold').fontSize(12).fillColor('#ffffff').text(t.ticketNumber, 206, refY + 11);
    doc.font('Helvetica').fontSize(6.5).fillColor('#a9c4bc').text('Non-transferable · issued in the name of the guest above', 36, H - 38, { width: SPLIT - 60 });

    // Right: QR + instructions
    const qrX = SPLIT + (W - SPLIT - QR_SIZE_PT) / 2;
    doc.image(qr, qrX, 40, { width: QR_SIZE_PT, height: QR_SIZE_PT });
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MEKI_GREEN).text('SCAN AT ENTRY', SPLIT + 12, 198, { width: W - SPLIT - 24, align: 'center', characterSpacing: 1.6 });
    doc.font('Courier').fontSize(9).fillColor(INK).text(t.ticketNumber, SPLIT + 12, 214, { width: W - SPLIT - 24, align: 'center' });
    doc.lineWidth(0.6).strokeColor(GOLD).moveTo(SPLIT + 36, 238).lineTo(W - 36, 238).stroke();
    doc.font('Helvetica-Bold').fontSize(7).fillColor(DEEP_GREEN).text('CHECK-IN', SPLIT + 20, 250, { characterSpacing: 1.4 });
    doc.font('Helvetica').fontSize(7.6).fillColor(MUTED).text(t.checkInNote?.trim() || DEFAULT_CHECK_IN_NOTE, SPLIT + 20, 262, { width: W - SPLIT - 40, lineGap: 1.5 });

    doc.end();
    return done;
  }
}
