/**
 * Phase 14 — copy for the hosted giving flows (general / programme / Gala donation) and the donor status page.
 * [P] proposed microcopy by the development team — needs MEKI approval. Arabic is a DRAFT translation pending MEKI review.
 * Zakat wording never states a religious ruling: Zakat is offered only where MEKI's designated authority approved it and SDI accepted
 * the accounting restriction (server-side), and donors are pointed to their own scholar.
 */
import type { GivingGateReason } from "@meki/api-client";

type ReasonCopy = Record<GivingGateReason | "generic", string>;

export type GivingCopy = {
  form: {
    eyebrow: string;
    title: string;
    intro: string;
    previewBadge: string;
    previewNote: string;
    steps: string[];
    stepOf: string;
    destinationLabel: string;
    generalOption: string;
    generalHelp: string;
    programmeGroup: string;
    notPayable: string;
    typeLabel: string;
    typeHelp: string;
    sadaqah: { title: string; text: string };
    zakat: { title: string; text: string };
    zakatUnavailable: ReasonCopy;
    amountLabel: string;
    otherAmount: string;
    amountHelp: string;
    limits: string;
    next: string;
    back: string;
    detailsTitle: string;
    detailsHelp: string;
    fullName: string;
    email: string;
    reviewTitle: string;
    reviewIntro: string;
    review: { destination: string; type: string; amount: string; currency: string; form: string };
    terms: string[];
    accept: string;
    submit: string;
    submitting: string;
    closedTitle: string;
    closed: ReasonCopy;
    edit: string;
    /** Phase 14B: Gala-only launch mode — explicit disclosure the donor must accept */
    galaOffer: { title: string; text: string; accept: string; generalInterest: string; required: string };
    reviewInterest: string;
    reviewRedirected: string;
  };
  reference: {
    heading: string;
    intro: string;
    copy: string;
    copied: string;
    copyFailed: string;
    instructionsTitle: string;
    instructions: string[];
    typeInstruction: string;
    designationInstruction: string;
    openForm: string;
    newTab: string;
    formUnavailable: string;
    noPrefill: string;
    statusLink: string;
    receipts: string;
  };
  stages: { title: string; items: { title: string; text: string }[]; review: string; notCompleted: string };
  status: {
    metaTitle: string;
    eyebrow: string;
    title: string;
    verifying: string;
    verifyingText: string;
    noToken: string;
    notFound: string;
    rows: { reference: string; type: string; designation: string; amount: string; stage: string; interest: string };
    stageLabel: Record<"PENDING_EXTERNAL" | "NEEDS_REVIEW" | "NOT_COMPLETED" | "VERIFIED" | "ALLOCATED", string>;
    back: string;
  };
  gala: {
    eyebrow: string;
    title: string;
    intro: string;
    notTicket: string;
    bookLink: string;
    projectLabel: string;
    unavailableTitle: string;
    unavailable: string;
    directLink: string;
    directLinkNote: string;
    back: string;
  };
  classification: { ZAKAT: string; SADAQAH: string };
  designationGeneral: string;
  errors: Record<"required" | "email" | "amountInvalid" | "amountMin" | "amountMax" | "zakatUnavailable" | "network" | "closed" | "zakat" | "amount" | "invalid" | "rateLimited" | "conflict" | "unavailable" | "unknown", string>;
};

export const givingEn: GivingCopy = {
  form: {
    eyebrow: "Give",
    title: "Prepare your gift",
    intro: "Choose where your gift should go and whether it is Sadaqah or Zakat. You receive a MEKI reference, then complete the payment on the secure form of our fiscal sponsor, Spring of Dignity International (SDI).",
    previewBadge: "Preview · not open for payment",
    previewNote: "You can see how the gift would be prepared; no reference is issued and nothing is paid.",
    steps: ["Your gift", "Your details", "Review", "Reference"],
    stepOf: "Step {n} of {total}",
    destinationLabel: "Where it goes",
    generalOption: "Where it is needed most",
    generalHelp: "Unrestricted: MEKI's programs, as approved with our fiscal sponsor.",
    programmeGroup: "A specific program (your intention)",
    notPayable: "not open yet",
    typeLabel: "Type of gift",
    typeHelp: "Your choice is recorded with the reference and never changed.",
    sadaqah: { title: "Sadaqah", text: "Voluntary charity." },
    zakat: { title: "Zakat", text: "Offered only where MEKI's designated authority has approved it and our fiscal sponsor has accepted the restriction. If you are unsure whether your gift is Zakat, please ask your scholar." },
    zakatUnavailable: {
      generic: "Zakat is not available for this option.",
      ZAKAT_NOT_ENABLED: "Zakat giving is not open yet.",
      DONATION_TYPE_NOT_CONFIRMED: "Zakat giving is not open yet: our fiscal sponsor's form must first record the gift type.",
      NOT_ZAKAT_ELIGIBLE: "Zakat has not been approved for this destination.",
      NO_ZAKAT_TARGET: "Zakat needs a destination approved for Zakat; general giving has none.",
      REFERENCE_QUESTION_NOT_CONFIRMED: "Zakat is not available for this option.",
      NOT_AUTHORIZED_BY_SDI: "Zakat is not available for this option.",
      FORM_NOT_ENABLED: "Zakat is not available for this option.",
      DESIGNATION_NOT_CONFIRMED: "Zakat is not available for this option.",
      NO_FORM_FOR_PROGRAMME: "Zakat is not available for this option.",
      GALA_GIVING_NOT_AUTHORIZED: "Zakat is not available for this option.",
      GALA_ONLY_MODE_OFF: "Zakat is not available for this option.",
    },
    amountLabel: "Amount (USD)",
    otherAmount: "Other amount",
    amountHelp: "Your intended amount. The amount you pay is set and charged on SDI's form.",
    limits: "Between {min} and {max}.",
    next: "Continue",
    back: "Back",
    detailsTitle: "Your contact details",
    detailsHelp: "Used only to find your gift if you contact us. Payment details are entered on SDI's form, never here.",
    fullName: "Full name",
    email: "E-mail",
    reviewTitle: "Review your gift",
    reviewIntro: "Please check your intention before you receive your reference.",
    review: { destination: "Where it goes", type: "Type of gift", amount: "Intended amount", currency: "Currency", form: "Payment" },
    terms: [
      "Payment, receipt and tax information are handled by our fiscal sponsor, Spring of Dignity International (SDI), on its secure Zeffy form.",
      "Your gift is confirmed only after SDI's report shows the payment — usually the next business day. Returning from the form does not confirm it.",
      "A program choice is your intention. Funds are allocated as authorized under SDI's agreement with MEKI.",
    ],
    accept: "I have read the above and want to receive my MEKI reference.",
    submit: "Get my donation reference",
    submitting: "Creating your reference…",
    closedTitle: "Not open for payment yet",
    closed: {
      generic: "This giving option is not open yet. No payment can be made here.",
      NOT_AUTHORIZED_BY_SDI: "This giving option is not yet covered by our fiscal sponsor's agreement. No payment can be made here.",
      FORM_NOT_ENABLED: "Our fiscal sponsor's secure form for this option is not available yet.",
      DESIGNATION_NOT_CONFIRMED: "Our fiscal sponsor has not yet confirmed how program gifts are recorded.",
      NO_FORM_FOR_PROGRAMME: "Our fiscal sponsor has no form for this program yet.",
      REFERENCE_QUESTION_NOT_CONFIRMED: "Our fiscal sponsor's form cannot record a MEKI reference yet.",
      GALA_GIVING_NOT_AUTHORIZED: "Gala giving is not open.",
      ZAKAT_NOT_ENABLED: "Zakat giving is not open yet.",
      DONATION_TYPE_NOT_CONFIRMED: "Zakat giving is not open yet.",
      NOT_ZAKAT_ELIGIBLE: "Zakat has not been approved for this destination.",
      NO_ZAKAT_TARGET: "Zakat is not available for general giving.",
      GALA_ONLY_MODE_OFF: "This giving option is not open yet. No payment can be made here.",
    },
    edit: "Change",
    galaOffer: {
      title: "Giving to this option is not open yet",
      text: "Gifts restricted to {interest} are not yet covered by our fiscal sponsor's agreement. You can instead support {project} through the MEKI Gala campaign. Your gift would go to {project} — not to {interest}.",
      accept: "I understand. I want my gift to support {project} instead.",
      generalInterest: "general giving",
      required: "Please confirm where your gift will go, or choose another option.",
    },
    reviewInterest: "You started from",
    reviewRedirected: "Your gift goes to",
  },
  reference: {
    heading: "Your MEKI donation reference",
    intro: "Keep this reference. Your gift is pending until our fiscal sponsor's report confirms it.",
    copy: "Copy reference",
    copied: "Copied",
    copyFailed: "Copy did not work — please select the reference and copy it manually.",
    instructionsTitle: "What to do next",
    instructions: ["Copy the reference above.", "Open SDI's secure form.", "Paste the reference exactly into the question “{question}”.", "Complete the payment on the form. Zeffy e-mails your receipt on behalf of SDI."],
    typeInstruction: "For “{question}”, choose “{answer}”.",
    designationInstruction: "Choose “{designation}” where the form asks for the program or fund.",
    openForm: "Open SDI's secure form",
    newTab: "(opens in a new tab)",
    formUnavailable: "SDI's form is not available right now. Please keep your reference and try again later.",
    noPrefill: "The reference is not filled in automatically — please paste it into the form.",
    statusLink: "View my gift status",
    receipts: "MEKI does not issue tax receipts. Your receipt comes from SDI (via Zeffy).",
  },
  stages: {
    title: "How your gift progresses",
    items: [
      { title: "Your intention", text: "Recorded on MEKI with your reference." },
      { title: "Payment on SDI's form", text: "Pending until SDI's report shows it." },
      { title: "Payment verified", text: "Confirmed from SDI's approved report." },
      { title: "Allocation approved", text: "Funds allocated as authorized." },
    ],
    review: "Our team is reviewing a difference between SDI's report and your intention. We will contact you if needed.",
    notCompleted: "SDI's report shows this payment was not completed. No money was taken for this reference.",
  },
  status: {
    metaTitle: "Your gift status · MEKI",
    eyebrow: "Your gift",
    title: "Gift status",
    verifying: "Your payment is being verified.",
    verifyingText: "Thank you. Returning from the payment form does not confirm a gift: it is confirmed only when our fiscal sponsor's report shows the payment, usually the next business day.",
    noToken: "For your privacy, details are shown only in the browser tab where you prepared the gift. Your reference is still valid.",
    notFound: "We could not find this gift. Please check the reference.",
    rows: { reference: "Reference", type: "Type of gift", designation: "Where it goes", amount: "Intended amount", stage: "Status", interest: "You started from" },
    stageLabel: { PENDING_EXTERNAL: "Pending — awaiting SDI's report", NEEDS_REVIEW: "Under review", NOT_COMPLETED: "Not completed", VERIFIED: "Payment verified", ALLOCATED: "Payment verified · allocation approved" },
    back: "Back to giving",
  },
  gala: {
    eyebrow: "MEKI Gala Night",
    title: "Donate without attending",
    intro: "Support the Gala campaign even if you cannot join us. This is a donation, not admission.",
    notTicket: "Looking to attend? A ticket is booked separately.",
    bookLink: "Book your place",
    projectLabel: "Your gift supports",
    unavailableTitle: "Gala giving is not open",
    unavailable: "Online giving for the Gala is not open yet. No payment is taken on this page.",
    directLink: "Donate on SDI's form",
    directLinkNote: "Opens SDI's secure Gala donation form on Zeffy. SDI receives the gift and issues your receipt.",
    back: "Back to the Gala",
  },
  classification: { ZAKAT: "Zakat", SADAQAH: "Sadaqah" },
  designationGeneral: "Where it is needed most",
  errors: {
    required: "Please complete this field.",
    email: "Please enter a valid e-mail address.",
    amountInvalid: "Please enter an amount in US dollars, e.g. 50 or 50.00.",
    amountMin: "The amount is below the minimum.",
    amountMax: "The amount is above the maximum.",
    zakatUnavailable: "Zakat is not available for this destination. Please choose Sadaqah or another destination.",
    network: "We could not reach the server. Please check your connection and try again — your gift was not duplicated.",
    closed: "This giving option has just closed. Nothing was recorded.",
    zakat: "Zakat is no longer available for this destination. Nothing was recorded.",
    amount: "This amount cannot be accepted. Please change it.",
    invalid: "Please check the details and try again.",
    rateLimited: "Too many attempts. Please wait a minute and try again.",
    conflict: "Please start again.",
    unavailable: "References cannot be issued right now. Please try again later.",
    unknown: "Something went wrong. Please try again.",
  },
};

export const givingAr: GivingCopy = {
  form: {
    eyebrow: "تبرّع",
    title: "جهّز تبرعك",
    intro: "اختر وجهة تبرعك وما إذا كان صدقة أو زكاة. ستحصل على مرجع من MEKI، ثم تُكمل الدفع على النموذج الآمن للجهة الراعية مالياً Spring of Dignity International (SDI).",
    previewBadge: "معاينة · غير متاح للدفع",
    previewNote: "يمكنك رؤية كيفية تجهيز التبرع؛ لا يُصدر أي مرجع ولا يُدفع أي مبلغ.",
    steps: ["تبرعك", "بياناتك", "المراجعة", "المرجع"],
    stepOf: "الخطوة {n} من {total}",
    destinationLabel: "وجهة التبرع",
    generalOption: "حيث تشتد الحاجة",
    generalHelp: "تبرع غير مقيّد: لبرامج MEKI وفق ما اعتُمد مع الجهة الراعية مالياً.",
    programmeGroup: "برنامج محدد (نيّتك)",
    notPayable: "غير متاح بعد",
    typeLabel: "نوع التبرع",
    typeHelp: "يُسجَّل اختيارك مع المرجع ولا يُغيَّر أبداً.",
    sadaqah: { title: "صدقة", text: "تبرع تطوعي." },
    zakat: { title: "زكاة", text: "تُتاح فقط حيث اعتمدتها الجهة المختصة لدى MEKI وقبلت الجهة الراعية مالياً هذا القيد. إن لم تكن متأكداً من أن تبرعك زكاة، فاستشر من تثق بعلمه." },
    zakatUnavailable: {
      generic: "الزكاة غير متاحة لهذا الخيار.",
      ZAKAT_NOT_ENABLED: "تبرعات الزكاة غير متاحة بعد.",
      DONATION_TYPE_NOT_CONFIRMED: "تبرعات الزكاة غير متاحة بعد: يجب أولاً أن يسجّل نموذج الجهة الراعية نوع التبرع.",
      NOT_ZAKAT_ELIGIBLE: "لم تُعتمد الزكاة لهذه الوجهة.",
      NO_ZAKAT_TARGET: "تحتاج الزكاة إلى وجهة معتمدة للزكاة؛ والتبرع العام ليس كذلك.",
      REFERENCE_QUESTION_NOT_CONFIRMED: "الزكاة غير متاحة لهذا الخيار.",
      NOT_AUTHORIZED_BY_SDI: "الزكاة غير متاحة لهذا الخيار.",
      FORM_NOT_ENABLED: "الزكاة غير متاحة لهذا الخيار.",
      DESIGNATION_NOT_CONFIRMED: "الزكاة غير متاحة لهذا الخيار.",
      NO_FORM_FOR_PROGRAMME: "الزكاة غير متاحة لهذا الخيار.",
      GALA_GIVING_NOT_AUTHORIZED: "الزكاة غير متاحة لهذا الخيار.",
      GALA_ONLY_MODE_OFF: "الزكاة غير متاحة لهذا الخيار.",
    },
    amountLabel: "المبلغ (دولار أمريكي)",
    otherAmount: "مبلغ آخر",
    amountHelp: "المبلغ الذي تنويه. يُحدَّد المبلغ المدفوع ويُحصَّل على نموذج SDI.",
    limits: "بين {min} و{max}.",
    next: "متابعة",
    back: "رجوع",
    detailsTitle: "بيانات التواصل",
    detailsHelp: "تُستخدم فقط للعثور على تبرعك إذا تواصلت معنا. تُدخَل بيانات الدفع على نموذج SDI وليس هنا.",
    fullName: "الاسم الكامل",
    email: "البريد الإلكتروني",
    reviewTitle: "راجع تبرعك",
    reviewIntro: "يرجى التحقق من نيّتك قبل الحصول على المرجع.",
    review: { destination: "وجهة التبرع", type: "نوع التبرع", amount: "المبلغ المنوي", currency: "العملة", form: "الدفع" },
    terms: [
      "تتولى الجهة الراعية مالياً Spring of Dignity International (SDI) الدفع والإيصال ومعلومات الضرائب عبر نموذج Zeffy الآمن.",
      "لا يُؤكَّد تبرعك إلا بعد أن يُظهر تقرير SDI الدفعة — عادةً في يوم العمل التالي. العودة من النموذج لا تؤكده.",
      "اختيار البرنامج هو نيّتك. تُخصَّص الأموال وفق ما يُعتمد ضمن اتفاق SDI مع MEKI.",
    ],
    accept: "قرأت ما سبق وأرغب في الحصول على مرجع MEKI.",
    submit: "احصل على مرجع التبرع",
    submitting: "جارٍ إنشاء المرجع…",
    closedTitle: "غير متاح للدفع بعد",
    closed: {
      generic: "خيار التبرع هذا غير متاح بعد. لا يمكن الدفع هنا.",
      NOT_AUTHORIZED_BY_SDI: "خيار التبرع هذا غير مشمول بعد باتفاق الجهة الراعية مالياً. لا يمكن الدفع هنا.",
      FORM_NOT_ENABLED: "النموذج الآمن للجهة الراعية لهذا الخيار غير متاح بعد.",
      DESIGNATION_NOT_CONFIRMED: "لم تؤكد الجهة الراعية بعد كيفية تسجيل تبرعات البرامج.",
      NO_FORM_FOR_PROGRAMME: "لا يوجد لدى الجهة الراعية نموذج لهذا البرنامج بعد.",
      REFERENCE_QUESTION_NOT_CONFIRMED: "لا يستطيع نموذج الجهة الراعية تسجيل مرجع MEKI بعد.",
      GALA_GIVING_NOT_AUTHORIZED: "التبرع للأمسية غير متاح.",
      ZAKAT_NOT_ENABLED: "تبرعات الزكاة غير متاحة بعد.",
      DONATION_TYPE_NOT_CONFIRMED: "تبرعات الزكاة غير متاحة بعد.",
      NOT_ZAKAT_ELIGIBLE: "لم تُعتمد الزكاة لهذه الوجهة.",
      NO_ZAKAT_TARGET: "الزكاة غير متاحة للتبرع العام.",
      GALA_ONLY_MODE_OFF: "خيار التبرع هذا غير متاح بعد. لا يمكن الدفع هنا.",
    },
    edit: "تعديل",
    galaOffer: {
      title: "التبرع لهذا الخيار غير متاح بعد",
      text: "التبرعات المخصّصة لـ{interest} غير مشمولة بعد باتفاق الجهة الراعية مالياً. يمكنك بدلاً من ذلك دعم {project} عبر حملة أمسية MEKI. سيذهب تبرعك إلى {project} — وليس إلى {interest}.",
      accept: "أفهم ذلك، وأرغب في أن يدعم تبرعي {project} بدلاً من ذلك.",
      generalInterest: "التبرع العام",
      required: "يرجى تأكيد وجهة تبرعك أو اختيار خيار آخر.",
    },
    reviewInterest: "بدأت من",
    reviewRedirected: "يذهب تبرعك إلى",
  },
  reference: {
    heading: "مرجع تبرعك لدى MEKI",
    intro: "احتفظ بهذا المرجع. يبقى تبرعك قيد الانتظار حتى يؤكده تقرير الجهة الراعية مالياً.",
    copy: "نسخ المرجع",
    copied: "تم النسخ",
    copyFailed: "تعذّر النسخ — يرجى تحديد المرجع ونسخه يدوياً.",
    instructionsTitle: "الخطوات التالية",
    instructions: ["انسخ المرجع أعلاه.", "افتح نموذج SDI الآمن.", "الصق المرجع كما هو في السؤال «{question}».", "أكمل الدفع على النموذج. ترسل Zeffy إيصالك بالبريد نيابةً عن SDI."],
    typeInstruction: "في السؤال «{question}» اختر «{answer}».",
    designationInstruction: "اختر «{designation}» حيث يطلب النموذج البرنامج أو الصندوق.",
    openForm: "افتح نموذج SDI الآمن",
    newTab: "(يفتح في علامة تبويب جديدة)",
    formUnavailable: "نموذج SDI غير متاح حالياً. احتفظ بالمرجع وحاول لاحقاً.",
    noPrefill: "لا يُملأ المرجع تلقائياً — يرجى لصقه في النموذج.",
    statusLink: "عرض حالة تبرعي",
    receipts: "لا تُصدر MEKI إيصالات ضريبية. يصلك الإيصال من SDI (عبر Zeffy).",
  },
  stages: {
    title: "مراحل تبرعك",
    items: [
      { title: "نيّتك", text: "مسجّلة لدى MEKI مع المرجع." },
      { title: "الدفع على نموذج SDI", text: "قيد الانتظار حتى يُظهره تقرير SDI." },
      { title: "تم التحقق من الدفع", text: "مؤكَّد من تقرير SDI المعتمد." },
      { title: "اعتُمد التخصيص", text: "خُصّصت الأموال وفق المعتمد." },
    ],
    review: "يراجع فريقنا اختلافاً بين تقرير SDI ونيّتك، وسنتواصل معك عند الحاجة.",
    notCompleted: "يُظهر تقرير SDI أن هذه الدفعة لم تكتمل. لم يُحصَّل أي مبلغ لهذا المرجع.",
  },
  status: {
    metaTitle: "حالة تبرعك · MEKI",
    eyebrow: "تبرعك",
    title: "حالة التبرع",
    verifying: "يجري التحقق من دفعتك.",
    verifyingText: "شكراً لك. العودة من نموذج الدفع لا تؤكد التبرع: يُؤكَّد فقط عندما يُظهر تقرير الجهة الراعية مالياً الدفعة، عادةً في يوم العمل التالي.",
    noToken: "حفاظاً على خصوصيتك، تُعرض التفاصيل فقط في علامة التبويب التي جهّزت فيها التبرع. يبقى مرجعك صالحاً.",
    notFound: "تعذّر العثور على هذا التبرع. يرجى التحقق من المرجع.",
    rows: { reference: "المرجع", type: "نوع التبرع", designation: "وجهة التبرع", amount: "المبلغ المنوي", stage: "الحالة", interest: "بدأت من" },
    stageLabel: { PENDING_EXTERNAL: "قيد الانتظار — بانتظار تقرير SDI", NEEDS_REVIEW: "قيد المراجعة", NOT_COMPLETED: "لم يكتمل", VERIFIED: "تم التحقق من الدفع", ALLOCATED: "تم التحقق من الدفع · اعتُمد التخصيص" },
    back: "العودة إلى التبرع",
  },
  gala: {
    eyebrow: "أمسية MEKI الخيرية",
    title: "تبرّع دون حضور",
    intro: "ادعم حملة الأمسية حتى لو تعذّر حضورك. هذا تبرع وليس تذكرة دخول.",
    notTicket: "ترغب في الحضور؟ تُحجز التذكرة بشكل منفصل.",
    bookLink: "احجز مكانك",
    projectLabel: "يدعم تبرعك",
    unavailableTitle: "التبرع للأمسية غير متاح",
    unavailable: "التبرع الإلكتروني للأمسية غير متاح بعد. لا تُحصَّل أي مدفوعات من هذه الصفحة.",
    directLink: "تبرّع عبر نموذج SDI",
    directLinkNote: "يفتح نموذج التبرع الآمن الخاص بـ SDI على Zeffy. تتلقى SDI التبرع وتُصدر إيصالك.",
    back: "العودة إلى صفحة الأمسية",
  },
  classification: { ZAKAT: "زكاة", SADAQAH: "صدقة" },
  designationGeneral: "حيث تشتد الحاجة",
  errors: {
    required: "يرجى إكمال هذا الحقل.",
    email: "يرجى إدخال بريد إلكتروني صحيح.",
    amountInvalid: "يرجى إدخال مبلغ بالدولار الأمريكي، مثل 50 أو 50.00.",
    amountMin: "المبلغ أقل من الحد الأدنى.",
    amountMax: "المبلغ أعلى من الحد الأقصى.",
    zakatUnavailable: "الزكاة غير متاحة لهذه الوجهة. يرجى اختيار الصدقة أو وجهة أخرى.",
    network: "تعذّر الاتصال بالخادم. تحقق من الاتصال وحاول مجدداً — لن يتكرر تبرعك.",
    closed: "أُغلق خيار التبرع هذا للتو. لم يُسجَّل شيء.",
    zakat: "لم تعد الزكاة متاحة لهذه الوجهة. لم يُسجَّل شيء.",
    amount: "لا يمكن قبول هذا المبلغ. يرجى تعديله.",
    invalid: "يرجى التحقق من البيانات والمحاولة مجدداً.",
    rateLimited: "محاولات كثيرة. يرجى الانتظار دقيقة ثم المحاولة.",
    conflict: "يرجى البدء من جديد.",
    unavailable: "لا يمكن إصدار المراجع حالياً. يرجى المحاولة لاحقاً.",
    unknown: "حدث خطأ. يرجى المحاولة مجدداً.",
  },
};

export const getGivingCopy = (locale: "en" | "ar"): GivingCopy => (locale === "ar" ? givingAr : givingEn);
export const fillGiving = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
