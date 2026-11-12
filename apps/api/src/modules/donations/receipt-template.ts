export interface ReceiptSnapshot {
  receiptNumber: string;
  issuedAt: string;
  isTest: boolean;
  donation: { reference: string; amount: string; currency: string; frequency: string; confirmedAt: string | null };
  donor: { name: string; organizationName: string | null; countryCode: string | null };
  purpose: { designation: string; titleEn: string | null; titleAr: string | null };
  issuer: {
    nameEn: string;
    nameAr: string | null;
    addressEn: string | null;
    addressAr: string | null;
    taxIdLabel: string | null;
    taxId: string | null;
  };
  /** Configured legal wording only; empty until MEKI legal/finance approve it. No tax claims by default. */
  footerEn: string | null;
  footerAr: string | null;
}

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const L = {
  en: {
    title: 'Donation receipt',
    number: 'Receipt number',
    date: 'Donation date',
    ref: 'Donation reference',
    donor: 'Donor',
    amount: 'Amount',
    purpose: 'Purpose',
    frequency: 'Frequency',
    general: 'General fund',
    monthly: 'Monthly',
    once: 'One-time',
    test: 'TEST RECEIPT — NOT A REAL DONATION',
    void: 'VOID',
  },
  ar: {
    title: 'إيصال تبرع',
    number: 'رقم الإيصال',
    date: 'تاريخ التبرع',
    ref: 'مرجع التبرع',
    donor: 'المتبرع',
    amount: 'المبلغ',
    purpose: 'الغرض',
    frequency: 'التكرار',
    general: 'الصندوق العام',
    monthly: 'شهري',
    once: 'مرة واحدة',
    test: 'إيصال تجريبي — ليس تبرعًا حقيقيًا',
    void: 'ملغى',
  },
} as const;

/** Self-contained, escaped HTML (input for a future PDF renderer). Arabic is rendered RTL. */
export function renderReceiptHtml(s: ReceiptSnapshot, locale: 'en' | 'ar', status: 'ISSUED' | 'VOID'): string {
  const t = L[locale];
  const ar = locale === 'ar';
  const issuer = ar ? (s.issuer.nameAr ?? s.issuer.nameEn) : s.issuer.nameEn;
  const address = ar ? (s.issuer.addressAr ?? s.issuer.addressEn) : s.issuer.addressEn;
  const purpose = s.purpose.designation === 'GENERAL_FUND' ? t.general : ar ? (s.purpose.titleAr ?? s.purpose.titleEn) : s.purpose.titleEn;
  const date = s.donation.confirmedAt ? new Date(s.donation.confirmedAt).toISOString().slice(0, 10) : '';
  const footer = ar ? (s.footerAr ?? s.footerEn) : s.footerEn;
  const row = (k: string, v: unknown) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`;
  return `<!doctype html>
<html lang="${locale}" dir="${ar ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(t.title)} ${esc(s.receiptNumber)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:2rem auto;color:#1d2a24}th{text-align:start;padding:.4rem 1rem .4rem 0;color:#555}td{padding:.4rem 0}
.banner{background:#b00020;color:#fff;padding:.5rem;text-align:center;font-weight:bold}.amount{unicode-bidi:isolate;direction:ltr}</style></head>
<body>
${s.isTest ? `<div class="banner">${esc(t.test)}</div>` : ''}${status === 'VOID' ? `<div class="banner">${esc(t.void)}</div>` : ''}
<h1>${esc(t.title)}</h1>
<p><strong>${esc(issuer)}</strong>${address ? `<br>${esc(address)}` : ''}${s.issuer.taxId ? `<br>${esc(s.issuer.taxIdLabel ?? '')} ${esc(s.issuer.taxId)}` : ''}</p>
<table>
${row(t.number, s.receiptNumber)}
${row(t.ref, s.donation.reference)}
${row(t.date, date)}
${row(t.donor, s.donor.organizationName ? `${s.donor.organizationName} (${s.donor.name})` : s.donor.name)}
<tr><th>${esc(t.amount)}</th><td class="amount">${esc(s.donation.amount)} ${esc(s.donation.currency)}</td></tr>
${row(t.purpose, purpose)}
${row(t.frequency, s.donation.frequency === 'MONTHLY' ? t.monthly : t.once)}
</table>
${footer ? `<p>${esc(footer)}</p>` : ''}
</body></html>`;
}

export const RECEIPT_PDF_RENDERER = Symbol('RECEIPT_PDF_RENDERER');

/** PDF generation port. A headless-browser or PDF library adapter (with Arabic shaping) plugs in here. */
export interface ReceiptPdfRenderer {
  readonly available: boolean;
  render(html: string): Promise<Buffer>;
}

export class NotConfiguredPdfRenderer implements ReceiptPdfRenderer {
  readonly available = false;
  async render(): Promise<Buffer> {
    throw new Error('PDF rendering is not configured');
  }
}
