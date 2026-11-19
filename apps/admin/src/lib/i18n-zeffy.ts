/** Phase 8A interface copy (SDI / Zeffy integration). English + Arabic; the Arabic text is a technical draft pending MEKI review. */
type S = Record<string, string>;

export const zeffyEn = {
  title: "SDI / Zeffy", subtitle: "Payments received by Spring of Dignity International (SDI) on Zeffy, read by MEKI to verify bookings and donations. MEKI never collects card data.",
  status: "Integration status", apiKey: "Read API key", webhookSecret: "Webhook signing secret", galaCampaign: "Gala ticket campaign", donationCampaigns: "Donation campaigns", forms: "Hosted forms",
  configured: "Configured", missing: "Not configured", yes: "Yes", no: "No",
  api: "API connection", apiStates: { ok: "Connected (verified now)", error: "Error", unchecked: "Not checked yet", not_configured: "Not configured" } as S,
  webhook: "Webhook deliveries", lastVerified: "Last verified delivery", none: "None yet", failedEvents: "Failed events",
  lastRun: "Last reconciliation", never: "Never", autoConfirm: "Automatic booking confirmation", autoOff: "Off — awaiting SDI (booking-reference mapping)", autoOn: "On (test environments only)",
  checkout: "Hosted checkout for bookings", checkoutOff: "Unavailable — Zeffy has no checkout-creation API and the booking-reference mapping is pending SDI. Public ticket sales stay closed.",
  pending: "Pending from SDI: API key, webhook secret, campaign ids, hosted form URLs and how a MEKI booking reference reaches a payment (docs/32).",
  reconcile: "Reconcile now", reconcileTitle: "Read recent payments from Zeffy?", reconcileBody: "MEKI reads (never writes) SDI's payments for the selected period and re-applies the correlation rules. Nothing is marked paid by hand; a booking is confirmed only when every rule holds and automatic confirmation is enabled.",
  days: "Days to look back", reconcileDone: "{payments} payments read · {confirmed} confirmed · {matched} matched · {review} to review · {unmatched} unmatched · {ignored} ignored · {failed} failed",
  queue: "Review queue", payments: "Provider payments", search: "Zeffy payment id or MEKI reference", matchFilter: "Correlation", classFilter: "Type",
  cols: { created: "Paid (provider)", amount: "Amount", refunded: "Refunded", status: "Provider status", type: "Type", ref: "MEKI reference", match: "Correlation", reason: "Reason", payment: "Zeffy payment" } as S,
  match: { UNMATCHED: "Unmatched", NEEDS_REVIEW: "Needs review", MATCHED: "Matched (not applied)", CONFIRMED: "Confirmed", IGNORED: "Ignored" } as S,
  classes: { CHARITABLE_DONATION: "Donation", EVENT_TICKET_PAYMENT: "Ticket" } as S,
  empty: "No provider payments recorded yet.", emptyFiltered: "No provider payments match these filters.", deleted: "Deleted at provider",
  recheck: "Re-check", recheckTitle: "Re-read this payment from Zeffy?", recheckBody: "The payment is fetched again from SDI's Zeffy account and the same correlation rules are applied. This never marks a payment as paid.",
  separation: "Ticket payments are never added to donation figures. No tax-deductible or fair-market value is calculated — SDI issues receipts.",
};

export type ZeffyDict = typeof zeffyEn;

export const zeffyAr: ZeffyDict = {
  title: "SDI / Zeffy", subtitle: "المدفوعات التي تستلمها Spring of Dignity International (SDI) عبر Zeffy، وتقرؤها MEKI للتحقق من الحجوزات والتبرعات. لا تجمع MEKI بيانات البطاقات أبداً.",
  status: "حالة التكامل", apiKey: "مفتاح القراءة (API)", webhookSecret: "سر توقيع الإشعارات", galaCampaign: "حملة تذاكر الحفل", donationCampaigns: "حملات التبرع", forms: "النماذج المستضافة",
  configured: "مضبوط", missing: "غير مضبوط", yes: "نعم", no: "لا",
  api: "الاتصال بالواجهة البرمجية", apiStates: { ok: "متصل (تم التحقق الآن)", error: "خطأ", unchecked: "لم يُفحص بعد", not_configured: "غير مضبوط" },
  webhook: "إشعارات Webhook", lastVerified: "آخر إشعار موثّق", none: "لا يوجد بعد", failedEvents: "أحداث فاشلة",
  lastRun: "آخر مطابقة", never: "لم تتم", autoConfirm: "التأكيد التلقائي للحجوزات", autoOff: "متوقف — بانتظار SDI (ربط مرجع الحجز)", autoOn: "مفعّل (بيئات الاختبار فقط)",
  checkout: "الدفع المستضاف للحجوزات", checkoutOff: "غير متاح — لا توفر Zeffy واجهة لإنشاء جلسات دفع، وربط مرجع الحجز بانتظار SDI. تبقى مبيعات التذاكر مغلقة.",
  pending: "بانتظار SDI: مفتاح الواجهة البرمجية، سر الإشعارات، معرّفات الحملات، روابط النماذج المستضافة، وطريقة وصول مرجع حجز MEKI إلى الدفعة (docs/32).",
  reconcile: "مطابقة الآن", reconcileTitle: "قراءة المدفوعات الأخيرة من Zeffy؟", reconcileBody: "تقرأ MEKI (دون أي كتابة) مدفوعات SDI للفترة المحددة وتعيد تطبيق قواعد الربط. لا يُعلَّم أي دفع كمدفوع يدوياً؛ ولا يُؤكَّد الحجز إلا عند تحقق كل القواعد وتفعيل التأكيد التلقائي.",
  days: "عدد الأيام", reconcileDone: "قُرئت {payments} دفعة · {confirmed} مؤكدة · {matched} مطابقة · {review} للمراجعة · {unmatched} غير مطابقة · {ignored} متجاهلة · {failed} فاشلة",
  queue: "قائمة المراجعة", payments: "مدفوعات المزوّد", search: "معرّف دفعة Zeffy أو مرجع MEKI", matchFilter: "الربط", classFilter: "النوع",
  cols: { created: "تاريخ الدفع (المزوّد)", amount: "المبلغ", refunded: "المسترد", status: "حالة المزوّد", type: "النوع", ref: "مرجع MEKI", match: "الربط", reason: "السبب", payment: "دفعة Zeffy" },
  match: { UNMATCHED: "غير مطابقة", NEEDS_REVIEW: "تحتاج مراجعة", MATCHED: "مطابقة (لم تُطبّق)", CONFIRMED: "مؤكدة", IGNORED: "متجاهلة" },
  classes: { CHARITABLE_DONATION: "تبرع", EVENT_TICKET_PAYMENT: "تذكرة" },
  empty: "لا توجد مدفوعات مسجلة من المزوّد بعد.", emptyFiltered: "لا توجد مدفوعات مطابقة.", deleted: "محذوفة لدى المزوّد",
  recheck: "إعادة الفحص", recheckTitle: "إعادة قراءة هذه الدفعة من Zeffy؟", recheckBody: "تُقرأ الدفعة مجدداً من حساب SDI في Zeffy وتُطبّق قواعد الربط نفسها. لا يؤدي ذلك أبداً إلى تعليم الدفعة كمدفوعة.",
  separation: "لا تُضاف مدفوعات التذاكر أبداً إلى أرقام التبرعات. لا تُحسب أي قيمة قابلة للخصم الضريبي أو قيمة سوقية عادلة — تصدر SDI الإيصالات.",
};
