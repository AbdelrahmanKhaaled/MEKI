import type { MailContext, MailMessage, MailTemplate } from './gala-email.templates';

/**
 * Arabic booking e-mails — PROPOSED translation by the development team, NOT approved by MEKI.
 * They are used only when GALA_EMAIL_ARABIC_APPROVED=true (otherwise Arabic bookings receive the English templates).
 * Event name, date and venue are the English values configured for the ticket (no Arabic event copy has been supplied).
 * Same rules as the English set: "confirmed" wording only after verified payment; no tax/receipt claims.
 */
const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const CALENDAR_PENDING = 'سيتم إرسال دعوة التقويم بعد أن تؤكد MEKI موعد الفعالية.';
const CHECK_IN = 'أبرز رمز QR الموجود في تذكرتك (مطبوعًا أو على هاتفك) مع إثبات هوية بصورة عند المدخل. يمكن مسح الرمز مرة واحدة فقط، فيرجى عدم مشاركته.';

function wrap(title: string, body: string) {
  return `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f4f6f5;font-family:Tahoma,Arial,sans-serif;color:#1d2b27"><div style="max-width:560px;margin:0 auto;padding:24px"><div style="background:#0b3b30;color:#fff;padding:18px 24px;border-radius:8px 8px 0 0"><div style="font-size:12px;letter-spacing:2px;color:#d6a146">MEKI</div><div style="font-size:20px;margin-top:4px">${esc(title)}</div></div><div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;line-height:1.7">${body}</div></div></body></html>`;
}

function details(c: MailContext) {
  const cal = c.calendarUrl ? `إضافة إلى التقويم: ${c.calendarUrl}` : CALENDAR_PENDING;
  return {
    text: [`الفعالية: ${c.eventName}`, `التاريخ: ${c.eventDateLabel}`, `المكان: ${c.venueLabel}`, `رقم الحجز: ${c.reference}`, cal].join('\n'),
    html: `<p>الفعالية: <bdi>${esc(c.eventName)}</bdi><br>التاريخ: <bdi>${esc(c.eventDateLabel)}</bdi><br>المكان: <bdi>${esc(c.venueLabel)}</bdi><br>رقم الحجز: <strong><bdi>${esc(c.reference)}</bdi></strong></p><p>${
      c.calendarUrl ? `<a href="${esc(c.calendarUrl)}">إضافة إلى التقويم</a>` : esc(CALENDAR_PENDING)
    }</p>`,
  };
}

function guests(c: MailContext) {
  return {
    text: c.guests.map((g) => `- ${g.fullName}${g.ticketNumber ? ` (التذكرة ${g.ticketNumber})` : ''}`).join('\n'),
    html: `<ul>${c.guests.map((g) => `<li>${esc(g.fullName)}${g.ticketNumber ? ` — التذكرة <code>${esc(g.ticketNumber)}</code>` : ''}</li>`).join('')}</ul>`,
  };
}

export function renderMailAr(template: MailTemplate, c: MailContext): MailMessage {
  const d = details(c);
  const g = guests(c);
  const link = c.bookingUrl
    ? { text: `\nلعرض حجزك وتنزيل تذاكرك بأمان: ${c.bookingUrl}\n`, html: `<p><a href="${esc(c.bookingUrl)}">عرض الحجز وتنزيل التذاكر</a></p>` }
    : { text: '', html: '' };
  switch (template) {
    case 'booking.pending':
      return {
        subject: `استلمنا طلب حجزك — ${c.reference}`,
        text: `عزيزي/عزيزتي ${c.purchaserName}،\n\nاستلمنا طلب حجزك لحضور ${c.eventName}. حجزك غير مؤكد بعد: سيتم تأكيده وإصدار التذاكر فقط بعد التحقق من الدفع.\n\n${d.text}\n\nالضيوف:\n${g.text}\n${link.text}\nإذا لم تُكمل الدفع فيمكنك العودة إلى صفحة الحجز والمحاولة مرة أخرى.\n`,
        html: wrap('تم استلام طلب الحجز', `<p>عزيزي/عزيزتي ${esc(c.purchaserName)}،</p><p>استلمنا طلب حجزك لحضور <strong><bdi>${esc(c.eventName)}</bdi></strong>. <strong>حجزك غير مؤكد بعد</strong> — سيتم تأكيده وإصدار التذاكر فقط بعد التحقق من الدفع.</p>${d.html}<p>الضيوف:</p>${g.html}${link.html}<p>إذا لم تُكمل الدفع فيمكنك العودة إلى صفحة الحجز والمحاولة مرة أخرى.</p>`),
      };
    case 'booking.confirmed':
      return {
        subject: `شكرًا لك — تم تأكيد حجزك (${c.reference})`,
        text: `عزيزي/عزيزتي ${c.purchaserName}،\n\nشكرًا لدعمك MEKI. تم التحقق من دفعتك وتم تأكيد حجزك لحضور ${c.eventName}.\n\n${d.text}\n\nالضيوف (يحصل كل ضيف على تذكرة فردية برمز QR فريد):\n${g.text}\n${link.text}\nتُصدر التذاكر باسم كل ضيف.\n`,
        html: wrap('تم تأكيد الحجز', `<p>عزيزي/عزيزتي ${esc(c.purchaserName)}،</p><p>شكرًا لدعمك MEKI. تم التحقق من دفعتك وتم تأكيد حجزك لحضور <strong><bdi>${esc(c.eventName)}</bdi></strong>.</p>${d.html}<p>الضيوف (يحصل كل ضيف على تذكرة فردية برمز QR فريد):</p>${g.html}${link.html}<p>تُصدر التذاكر باسم كل ضيف.</p>`),
      };
    case 'ticket.delivery':
      return {
        subject: `تذكرتك — ${c.eventName}`,
        text: `عزيزي/عزيزتي ${c.guest?.fullName ?? ''}،\n\nتجد تذكرتك لحضور ${c.eventName} مرفقة بصيغة PDF (التذكرة ${c.guest?.ticketNumber ?? ''}).\n\n${d.text}\n\n${c.checkInNote?.trim() || CHECK_IN}\n`,
        html: wrap('تذكرتك', `<p>عزيزي/عزيزتي ${esc(c.guest?.fullName ?? '')}،</p><p>تجد تذكرتك لحضور <strong><bdi>${esc(c.eventName)}</bdi></strong> مرفقة بصيغة PDF (التذكرة <code>${esc(c.guest?.ticketNumber)}</code>).</p>${d.html}<p>${esc(c.checkInNote?.trim() || CHECK_IN)}</p>`),
      };
    case 'payment.failed':
      return {
        subject: `لم يكتمل الدفع — ${c.reference}`,
        text: `عزيزي/عزيزتي ${c.purchaserName}،\n\nلم نتمكن من التحقق من دفعة لحجزك ${c.reference} لحضور ${c.eventName}، لذلك فالحجز غير مؤكد ولم تُصدر أي تذاكر.\n${link.text}\nيمكنك العودة إلى صفحة الحجز والمحاولة مرة أخرى.\n`,
        html: wrap('لم يكتمل الدفع', `<p>عزيزي/عزيزتي ${esc(c.purchaserName)}،</p><p>لم نتمكن من التحقق من دفعة لحجزك <strong><bdi>${esc(c.reference)}</bdi></strong> لحضور <bdi>${esc(c.eventName)}</bdi>، لذلك فالحجز غير مؤكد ولم تُصدر أي تذاكر.</p>${link.html}<p>يمكنك العودة إلى صفحة الحجز والمحاولة مرة أخرى.</p>`),
      };
    case 'booking.cancelled':
      return {
        subject: `تم إلغاء الحجز — ${c.reference}`,
        text: `عزيزي/عزيزتي ${c.purchaserName}،\n\nتم إلغاء حجزك ${c.reference} لحضور ${c.eventName} وأصبحت تذاكره غير صالحة.\n\nإذا تم دفع أي مبلغ فإن الجهة الراعية ماليًا تتولى أي استرداد وسيتم التواصل معك بشكل منفصل.\n`,
        html: wrap('تم إلغاء الحجز', `<p>عزيزي/عزيزتي ${esc(c.purchaserName)}،</p><p>تم إلغاء حجزك <strong><bdi>${esc(c.reference)}</bdi></strong> لحضور <bdi>${esc(c.eventName)}</bdi> وأصبحت تذاكره غير صالحة.</p><p>إذا تم دفع أي مبلغ فإن الجهة الراعية ماليًا تتولى أي استرداد وسيتم التواصل معك بشكل منفصل.</p>`),
      };
    case 'ticket.refunded':
      return {
        subject: `تم تسجيل الاسترداد — ${c.reference}`,
        text: `عزيزي/عزيزتي ${c.purchaserName}،\n\nتم تسجيل استرداد للحجز ${c.reference} (${c.eventName}). التذاكر المرتبطة به لم تعد صالحة ولا يمكن استخدامها للدخول.\n`,
        html: wrap('تم تسجيل الاسترداد', `<p>عزيزي/عزيزتي ${esc(c.purchaserName)}،</p><p>تم تسجيل استرداد للحجز <strong><bdi>${esc(c.reference)}</bdi></strong> (<bdi>${esc(c.eventName)}</bdi>). التذاكر المرتبطة به لم تعد صالحة ولا يمكن استخدامها للدخول.</p>`),
      };
  }
}
