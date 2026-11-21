import ExcelJS from 'exceljs';

/**
 * Phase 12 — parsing and validation of SDI report files. SDI has NOT supplied a sample yet, so nothing here assumes column names:
 * the importer maps columns explicitly. Limits are deliberately tight; anything unexpected is rejected, never guessed.
 */

export const REPORT_LIMITS = { maxBytes: 5 * 1024 * 1024, maxRows: 20_000, maxColumns: 80, maxCell: 2_000, maxHeader: 120 } as const;

export class ReportFileError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type Table = { headers: string[]; rows: string[][] };

/** RFC 4180 CSV (quotes, escaped quotes, CR/LF/CRLF, embedded newlines). UTF-8 with optional BOM. No type coercion at all. */
export function parseCsv(buf: Buffer): Table {
  let text = buf.toString('utf8');
  if (text.includes('�')) throw new ReportFileError('FILE_ENCODING', 'The CSV file is not valid UTF-8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes('\0')) throw new ReportFileError('FILE_BINARY', 'The CSV file contains binary data');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let i = 0;
  const pushCell = () => {
    if (cell.length > REPORT_LIMITS.maxCell) throw new ReportFileError('CELL_TOO_LONG', `A cell exceeds ${REPORT_LIMITS.maxCell} characters`);
    row.push(cell);
    cell = '';
  };
  const pushRow = () => {
    pushCell();
    if (row.length > REPORT_LIMITS.maxColumns) throw new ReportFileError('TOO_MANY_COLUMNS', `More than ${REPORT_LIMITS.maxColumns} columns`);
    if (!(row.length === 1 && row[0].trim() === '')) rows.push(row);
    if (rows.length > REPORT_LIMITS.maxRows + 1) throw new ReportFileError('TOO_MANY_ROWS', `More than ${REPORT_LIMITS.maxRows} rows`);
    row = [];
  };
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      cell += c;
      i++;
      continue;
    }
    if (c === '"' && cell === '') {
      quoted = true;
      i++;
    } else if (c === ',') {
      pushCell();
      i++;
    } else if (c === '\r' || c === '\n') {
      pushRow();
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
    } else {
      cell += c;
      i++;
    }
  }
  if (quoted) throw new ReportFileError('CSV_UNTERMINATED_QUOTE', 'The CSV file has an unterminated quoted value');
  if (cell !== '' || row.length) pushRow();
  return toTable(rows);
}

/** XLSX: first worksheet only. Formula cells are REFUSED (never evaluated, never trusted as values). Dates become ISO strings. */
export async function parseXlsx(buf: Buffer): Promise<Table> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw new ReportFileError('XLSX_INVALID', 'The spreadsheet could not be read');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new ReportFileError('XLSX_EMPTY', 'The spreadsheet has no worksheet');
  if (ws.rowCount > REPORT_LIMITS.maxRows + 1) throw new ReportFileError('TOO_MANY_ROWS', `More than ${REPORT_LIMITS.maxRows} rows`);
  if (ws.columnCount > REPORT_LIMITS.maxColumns) throw new ReportFileError('TOO_MANY_COLUMNS', `More than ${REPORT_LIMITS.maxColumns} columns`);
  const rows: string[][] = [];
  let formula = false;
  ws.eachRow({ includeEmpty: false }, (r) => {
    const out: string[] = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      const cell = r.getCell(c);
      if (cell.type === ExcelJS.ValueType.Formula) formula = true;
      let v: string;
      const raw = cell.value as unknown;
      if (cell.type === ExcelJS.ValueType.Formula) v = '';
      else if (raw instanceof Date) v = raw.toISOString();
      else if (raw === null || raw === undefined) v = '';
      else if (typeof raw === 'object' && raw !== null && 'richText' in raw) v = (raw as { richText: { text: string }[] }).richText.map((t) => t.text).join('');
      else if (typeof raw === 'object' && raw !== null && 'text' in raw) v = String((raw as { text: unknown }).text);
      else v = String(raw);
      if (v.length > REPORT_LIMITS.maxCell) throw new ReportFileError('CELL_TOO_LONG', `A cell exceeds ${REPORT_LIMITS.maxCell} characters`);
      out.push(v);
    }
    rows.push(out);
  });
  if (formula) throw new ReportFileError('XLSX_FORMULA', 'The spreadsheet contains formulas; export the report as values only');
  return toTable(rows);
}

function toTable(rows: string[][]): Table {
  if (rows.length === 0) throw new ReportFileError('FILE_EMPTY', 'The file has no header row');
  const headers = rows[0].map((h) => h.trim());
  if (headers.some((h) => h.length === 0 || h.length > REPORT_LIMITS.maxHeader)) throw new ReportFileError('HEADER_INVALID', 'Every column needs a header (max 120 characters)');
  if (new Set(headers.map((h) => h.toLowerCase())).size !== headers.length) throw new ReportFileError('HEADER_DUPLICATE', 'Column headers must be unique');
  if (headers.some(isFormulaLike)) throw new ReportFileError('HEADER_FORMULA', 'A column header looks like a spreadsheet formula');
  return { headers, rows: rows.slice(1).map((r) => headers.map((_, i) => (r[i] ?? '').trim())) };
}

/** Spreadsheet formula-injection guard for TEXT values (CWE-1236). Numbers are validated separately. */
export const isFormulaLike = (v: string) => /^[=+\-@\t\r]/.test(v);

/**
 * Strict money: digits, optional thousands separators in groups of 3, at most 2 decimals, optional leading "$" or "USD ".
 * Negative numbers, scientific notation, other symbols and locales with decimal commas are refused.
 */
export function parseAmount(v: string): string | null {
  const s = v.trim().replace(/^(?:\$|USD\s?)/i, '');
  if (!/^(?:\d{1,3}(?:,\d{3})+|\d{1,12})(?:\.\d{1,2})?$/.test(s)) return null;
  const n = s.replace(/,/g, '');
  const [int, dec = ''] = n.split('.');
  return `${BigInt(int).toString()}.${dec.padEnd(2, '0')}`;
}

export function parseQuantity(v: string): number | null {
  return /^\d{1,4}$/.test(v.trim()) && Number(v) > 0 ? Number(v) : null;
}

export type DateFormat = 'ISO' | 'MDY' | 'DMY';

/** Dates: ISO (YYYY-MM-DD[THH:mm[:ss][Z]]) or an explicitly chosen MDY / DMY with "/" (and optional HH:mm). Invalid dates refused. */
export function parseDate(v: string, fmt: DateFormat): Date | null {
  const s = v.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(s);
  if (iso) {
    const dt = new Date(iso[4] ? s.replace(' ', 'T') + (iso[7] ? '' : 'Z') : `${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
    return Number.isNaN(dt.getTime()) || dt.getUTCDate() !== Number(iso[3]) && !iso[7] ? null : dt;
  }
  if (fmt === 'ISO') return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(s);
  if (!m) return null;
  const [mo, d] = fmt === 'MDY' ? [Number(m[1]), Number(m[2])] : [Number(m[2]), Number(m[1])];
  const y = Number(m[3]);
  const h = m[4] ? Number(m[4]) : 0;
  const mi = m[4] ? Number(m[5]) : 0;
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d && h < 24 && mi < 60 ? dt : null;
}

/**
 * Phase 12B — SDI's sample export has the date and time in SEPARATE columns, in America/New_York local time
 * ("Payment Date (America/New_York)" = 11/18/2026, "Payment Time (America/New_York)" = 7:05 PM).
 */
export function parseTime(v: string): { h: number; m: number; s: number } | null {
  const t = v.trim();
  const ampm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp])\.?\s*[Mm]\.?$/.exec(t);
  if (ampm) {
    const h12 = Number(ampm[1]);
    const m = Number(ampm[2]);
    const s = ampm[3] ? Number(ampm[3]) : 0;
    if (h12 < 1 || h12 > 12 || m > 59 || s > 59) return null;
    const pm = ampm[4].toLowerCase() === 'p';
    return { h: (h12 % 12) + (pm ? 12 : 0), m, s };
  }
  const h24 = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (!h24) return null;
  const [h, m, s] = [Number(h24[1]), Number(h24[2]), h24[3] ? Number(h24[3]) : 0];
  return h < 24 && m < 60 && s < 60 ? { h, m, s } : null;
}

export function isValidTimeZone(tz: string): boolean {
  if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset (ms) of `tz` at the UTC instant `utcMs` (positive east of UTC). */
function tzOffset(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(utcMs));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - Math.floor(utcMs / 1000) * 1000;
}

/** Wall-clock time in `tz` → UTC instant (DST-aware; a non-existent spring-forward time resolves forward, never guessed silently backwards). */
export function zonedTimeToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  if (tz === 'UTC') return new Date(guess);
  let utc = guess - tzOffset(guess, tz);
  utc = guess - tzOffset(utc, tz); // second pass across a DST boundary
  return new Date(utc);
}

/**
 * Date (+ optional separate time column) in the importer-chosen format and time zone. An explicit ISO offset/Z always wins.
 * Without a time the instant is local midnight in `tz`. Invalid calendar dates and times are refused (null).
 */
export function parseDateTime(dateValue: string, timeValue: string | undefined, fmt: DateFormat, tz = 'UTC'): Date | null {
  const dv = dateValue.trim();
  const tv = timeValue?.trim() ?? '';
  const isoOffset = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(dv);
  if (isoOffset) return tv ? null : parseDate(dv, 'ISO');
  let y: number, mo: number, d: number;
  let time: { h: number; m: number; s: number } | null = { h: 0, m: 0, s: 0 };
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}:\d{2}(?::\d{2})?))?$/.exec(dv);
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp]\.?[Mm]\.?)?))?$/.exec(dv);
  if (iso) {
    [y, mo, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    if (iso[4]) time = parseTime(iso[4]);
  } else if (slash && fmt !== 'ISO') {
    [mo, d] = fmt === 'MDY' ? [Number(slash[1]), Number(slash[2])] : [Number(slash[2]), Number(slash[1])];
    y = Number(slash[3]);
    if (slash[4]) time = parseTime(slash[4]);
  } else return null;
  if (tv) {
    if ((iso && iso[4]) || (slash && slash[4])) return null; // time given twice
    time = parseTime(tv);
  }
  if (!time) return null;
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return zonedTimeToUtc(y, mo, d, time.h, time.m, time.s, tz);
}

/** MEKI booking reference: EB- + 12 Crockford characters. Whitespace/case/typographic dashes are normalised; nothing is "corrected". */
export const BOOKING_REF = /^EB-[0-9A-HJKMNP-TV-Z]{12}$/;
export function normaliseReference(v: string): string | null {
  const s = v.trim().toUpperCase().replace(/[‐-―−]/g, '-').replace(/\s+/g, '');
  const withDash = /^EB[0-9A-Z]{12}$/.test(s) ? `EB-${s.slice(2)}` : s;
  return BOOKING_REF.test(withDash) ? withDash : null;
}
