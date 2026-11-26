/**
 * MEKI Gala Night — page content (Phase 5A).
 *
 * Provenance:
 *  [C] confirmed by the client (latest brief): title, date, venue, individual ticket (guest's own name),
 *      experience elements, "Program subject to change."
 *  [C] MEKI update, 19 November 2026: USD 500 per guest (supersedes USD 750), capacity 350, event hours 3:30–8:30 PM
 *      America/New_York, and the agenda "The Evening in a Glimpse" (four acts, 3:30–8:15 PM). Speakers: TO BE CONFIRMED —
 *      the agenda shows roles only; no speaker name is published until MEKI confirms it. Zeffy's form price/capacity are
 *      SDI-side and still to be verified (docs/55).
 *  [C] MEKI "Website Comments.docx", 21 November 2026 (Phase 13B): "Refined Refreshments" replaces the alcohol-free card
 *      (exact client text); Arrival and Transfers content removed; dietary options Gluten-free, Vegan, Vegetarian, Nut allergy,
 *      Dairy-free; Gala venue pictures requested (authentic photos not yet supplied — rendered only from the published
 *      EVENT_VENUE CMS section, never stock or unrelated images). Captions follow "Title – Place".
 *  [C] "MEKI-US Website Edits for the IT Team" (22 Nov 2026, Gala items 14–23): photos instead of graphics, "Set-menu dinner",
 *      "Virgin bar", no "Craft display" (no sales or merchandise table), "The evening at a glance", "Welcome reception",
 *      "Opening with our host, Raya Abirached" (name confirmed in writing in that document), host section, venue cross street
 *      and ZIP, one ticket per guest with no plus-one, "Sponsor now" once the packages are supplied. Photos, the sponsorship
 *      packages, partner logos and a contact email come ONLY from the Gala CMS sections (Admin → Gala → Settings → Gala page).
 *  [P] proposed microcopy by the development team — needs MEKI approval.
 *  [T] TO BE CONFIRMED — shown to visitors only as an honest "to be confirmed" state; never invented.
 *
 * Not published here (kept out of the public page until approved): sponsorship tiers/prices/benefits (see
 * PROPOSED_SPONSORSHIP, development preview only), the six supported causes, payment,
 * refund and tax answers (fiscal sponsor), any booking/checkout flow.
 * The Arabic translation is approved.
 */

/** One agenda moment: local time (America/New_York), title, optional role/description (never an unconfirmed speaker name). */
export type TimelineItem = { time: string; title: string; note?: string; highlight?: boolean };
/** One act of the agenda ("The Evening in a Glimpse"). */
export type TimelineAct = { label: string; title: string; time: string; items: TimelineItem[] };
export type FaqItem = { q: string; a: string; pending?: boolean };
export type SponsorTier = { name: string; price: string; tagline: string; exclusive?: boolean; benefits: string[] };

export type GalaDict = {
  contactEmail?: string | null;
  meta: { title: string; description: string };
  draftNote: string;
  hero: { eyebrow: string; title: string; line: string; date: string; time: string; venue: string; cta: string; ctaNote: string };
  purpose: { eyebrow: string; title: string; body: string[] };
  /** `code` links a card to its CMS item (EVENT_HIGHLIGHTS) for the card photo and any edited wording. */
  experience: { eyebrow: string; title: string; intro: string; items: { code: string; title: string; text: string }[]; pendingNote: string };
  /** Host section (item 17). The photo comes only from the published EVENT_SPEAKERS section (code "host"). */
  host: { eyebrow: string; name: string; line: string };
  timeline: { eyebrow: string; title: string; hours: string; acts: TimelineAct[]; note: string };
  /** Phase 13B: arrival/transport removed at MEKI's request. `photos` labels the venue-photo gallery (photos come from the CMS). */
  venue: { eyebrow: string; title: string; name: string; address: string; mapLabel: string; photos: string };
  /** `contact` is shown only with a contact email published by MEKI (EVENT_CONTACT section or Site settings). */
  attendance: { eyebrow: string; title: string; ticket: string; price: string; rules: string[]; note: string; contact: string; bookNow?: string };
  /** `cta` appears only with the official sponsorship packages URL published in the EVENT_SPONSORSHIP section. */
  sponsorship: { eyebrow: string; title: string; body: string; pending: string; previewLabel: string; cta: string; partners: string; newTab: string; pdf: string; docNote: string; contact?: string };
  /** Alt text of the venue logo (venue area only). */
  venueLogoAlt: string;
  /** "Why we gather" photo gallery label (photos only from the published EVENT_ABOUT section). */
  purposePhotos: string;
  follow: { title: string; text: string };
  causes: { eyebrow: string; title: string; intro: string };
  /** Phase 12B: `donationRefund` is shown only once MEKI approved publishing SDI's policy; `cancellationsQ` identifies the item
   *  whose answer is replaced by the separately approved ticket refund policy. */
  faq: { eyebrow: string; title: string; pendingLabel: string; items: FaqItem[]; donationRefund: FaqItem; cancellationsQ: string };
  booking: {
    eyebrow: string;
    title: string;
    book: { title: string; text: string; cta: string; status: string };
    give: { title: string; text: string; cta: string; status: string; projectText: string; openStatus: string; closedStatus: string; newTab: string };
  };
  back: string;
};

export const galaEn: GalaDict = {
  meta: {
    title: "Every Light Counts — MEKI Gala Night",
    description: "Join MEKI for an evening in New York on Saturday, December 12, 2026, where every guest's light joins a shared illumination.",
  },
  draftNote: "",
  hero: {
    eyebrow: "MEKI Gala Night",
    title: "Every Light Counts",
    line: "One evening. Many lights. A shared illumination for lasting change.", // [P]
    date: "Saturday, December 12, 2026",
    time: "3:30 – 8:30 PM (New York time)",
    venue: "583 Park Avenue, New York",
    cta: "Book your place",
    ctaNote: "Booking details are being confirmed.",
  },
  purpose: {
    eyebrow: "Why we gather",
    title: "One light is small. Together, they illuminate.",
    body: [
      "Each guest at the Gala lights a lamp. Joined together, those individual lights become a shared illumination for MEKI's programs.", // [P] per Gala PDF (copy drafted)
      "It is the idea behind MEKI itself: partners across the world, building lasting change together.",
    ],
  },
  experience: {
    eyebrow: "The experience",
    title: "An evening designed with care.",
    intro: "What to expect on the night.",
    items: [
      { code: "black-tie", title: "Black-tie evening", text: "An elegant, formal setting in the heart of New York." },
      { code: "dinner", title: "Set-menu dinner", text: "A plated, halal set menu." }, // [C] item 19
      { code: "bar", title: "Virgin Drinks", text: "A curated selection of fresh juices, premium teas, coffee, and sparkling beverages, thoughtfully served throughout the evening" }, // [C] title: MEKI confirmation 24 Nov 2026 (supersedes "Virgin bar"); text: exact client text, 21 Nov 2026
      { code: "lamps", title: "Lamp-lighting moment", text: "Every guest's light joins the shared illumination." },
      // [C] item 19: "Craft display" removed — there is no sales or merchandise table.
      { code: "auction", title: "Live auction", text: "A live auction during the evening." }, // brands not named (confirmed 22 Nov)
    ],
    pendingNote: "Evening details are being finalized with the events team.",
  },
  host: { eyebrow: "Your host", name: "Raya Abirached", line: "Your host for the evening." }, // [C] item 17
  timeline: {
    eyebrow: "The program",
    title: "The evening at a glance", // [C] item 20
    hours: "Saturday, December 12, 2026 · 3:30 – 8:30 PM, New York time",
    acts: [
      {
        label: "Act I",
        title: "The Spark",
        time: "3:30 – 5:00 PM",
        items: [
          { time: "3:30 PM", title: "Welcome reception" }, // [C] item 20
          { time: "4:30 PM", title: "Opening with our host, Raya Abirached" }, // [C] item 20 (name confirmed in writing)
          { time: "4:45 PM", title: "A Vision Beyond Borders", note: "Keynote Speaker" },
        ],
      },
      {
        label: "Act II",
        title: "The Stories and the People",
        time: "5:00 – 6:15 PM",
        items: [
          { time: "5:00 PM", title: "Every Light Has a Story", note: "Film", highlight: true },
          { time: "5:10 PM", title: "Voices That Illuminate", note: "Guest of Honor Panel" },
          { time: "6:00 PM", title: "A Legacy of Giving", note: "Egypt's Timeless Tradition of Generosity" },
        ],
      },
      {
        label: "Act III",
        title: "The Power of Giving",
        time: "6:15 – 7:00 PM",
        items: [{ time: "6:15 PM", title: "The Moment to Make It Count", note: "Auction" }],
      },
      {
        label: "Act IV",
        title: "A Shared Celebration",
        time: "7:00 – 8:15 PM",
        items: [
          { time: "7:00 PM", title: "A Celebration of Shared Light", note: "Entertainment" },
          { time: "7:30 PM", title: "A Table of Shared Purpose", note: "Dinner" },
          { time: "8:15 PM", title: "The Light Carries On", note: "Close of the evening" },
        ],
      },
    ],
    note: "Speakers to be confirmed. Program subject to change.",
  },
  venue: {
    eyebrow: "The venue",
    title: "583 Park Avenue, New York",
    name: "Park Avenue, New York",
    // [C] item 21: cross street and ZIP code (583 Park Avenue is at East 63rd Street, New York, NY 10065 — public venue listings).
    address: "583 Park Avenue (at East 63rd Street), New York, NY 10065", // [C] MEKI confirmation, 24 Nov 2026
    mapLabel: "View on map",
    photos: "Venue photographs",
  },
  attendance: {
    eyebrow: "Attendance",
    title: "Join us for the evening.",
    ticket: "Individual ticket",
    price: "USD 500",
    bookNow: "Book Now",
    rules: ["One ticket per guest", "Each ticket carries the guest's own name", "No plus-one"], // [C] item 22
    note: "Booking and payment arrangements will be handled by our fiscal sponsor and are being confirmed. Nothing can be purchased on this page yet.",
    contact: "Questions? Email {email}",
  },
  sponsorship: {
    eyebrow: "Sponsorship",
    title: "Light the evening with us.",
    body: "MEKI welcomes partners who share its commitment to lasting change.",
    pending: "Sponsorship opportunities are being finalized. Details will be shared once they are confirmed.",
    previewLabel: "Development preview · proposed, not validated · not public",
    cta: "Sponsor now", // [C] item 23 — shown only with the official packages file/page
    partners: "Partners",
    newTab: "(opens in a new tab)",
    pdf: "Sponsorship packages, PDF, opens in a new tab",
    // Wording from the PDF itself (p. 10): informational only — no checkout, no acceptance implied.
    docNote: "Sponsorship packages (PDF). All amounts are proposed contributions; benefits are subject to final agreement and availability.",
    contact: "For inquiries, email {email}",
  },
  venueLogoAlt: "583 Park Avenue, New York",
  purposePhotos: "Photographs of the evening",
  follow: { title: "Follow us", text: "Follow MEKI for news about the Gala and our programs." },
  causes: {
    eyebrow: "Supported causes",
    title: "What your light supports.",
    intro: "",
  },
  faq: {
    eyebrow: "Questions",
    title: "Good to know",
    pendingLabel: "To be confirmed",
    items: [
      { q: "Dress code", a: "Black tie." },
      { q: "Dining and dietary requirements", a: "Dinner is a plated, halal meal. Other dietary requirements: gluten-free, vegan, vegetarian, nut allergy and dairy-free." },
      { q: "Accessibility", a: "The venue is accessible." },
      { q: "Venue", a: "583 Park Avenue, New York." },
      { q: "Bookings", a: "Bookings are confirmed. An individual ticket is USD 500 per guest, in the guest's own name." },
      { q: "Cancellations", a: "No cancellations are allowed." },
      { q: "Receipts", a: "Receipts are confirmed." },
    ],
    donationRefund: { q: "Donation refunds", a: "Donations to the Gala campaign are not refundable, as stated by our fiscal sponsor, Spring of Dignity International (SDI)." },
    cancellationsQ: "Cancellations",
  },
  booking: {
    eyebrow: "Booking & giving",
    title: "Two ways to take part.",
    book: {
      title: "Book your place",
      text: "Reserve an individual ticket in your own name.",
      cta: "Book your place",
      status: "Booking is not open yet. We will share the booking details as soon as they are confirmed.",
    },
    give: {
      title: "Donate without attending",
      text: "Support the Gala campaign even if you cannot join us.",
      cta: "Donate without attending",
      status: "Online giving is not open yet. No payment is taken on this page.",
      projectText: "Gala gifts support {project}, the single project approved with our fiscal sponsor, Spring of Dignity International (SDI).",
      openStatus: "Opens SDI's secure donation form on Zeffy. SDI receives the gift and issues your receipt.",
      closedStatus: "The Gala donation campaign has closed. Thank you to everyone who gave.",
      newTab: "(opens in a new tab)",
    },
  },
  back: "Back to home",
};

export const galaAr: GalaDict = {
  meta: {
    title: "كل نور له أثر — أمسية MEKI الخيرية",
    description: "انضموا إلى MEKI في أمسية بنيويورك يوم السبت 12 ديسمبر 2026، يلتقي فيها نور كل ضيف في إضاءة مشتركة.",
  },
  draftNote: "",
  hero: {
    eyebrow: "أمسية MEKI الخيرية",
    title: "كل نور له أثر",
    line: "أمسية واحدة، وأنوار كثيرة، وإضاءة مشتركة من أجل تغيير دائم.",
    date: "السبت، 12 ديسمبر 2026",
    time: "3:30 – 8:30 مساءً (بتوقيت نيويورك)",
    venue: "583 بارك أفينيو، نيويورك",
    cta: "احجز مكانك",
    ctaNote: "تفاصيل الحجز قيد التأكيد.",
  },
  purpose: {
    eyebrow: "لماذا نجتمع",
    title: "نور واحد صغير، لكنها معًا تضيء.",
    body: [
      "يُضيء كل ضيف في الأمسية مصباحه، وتتحد هذه الأنوار الفردية في إضاءة مشتركة لبرامج MEKI.",
      "هذه هي فكرة MEKI نفسها: شركاء حول العالم يبنون تغييرًا دائمًا معًا.",
    ],
  },
  experience: {
    eyebrow: "التجربة",
    title: "أمسية صُمّمت بعناية.",
    intro: "ما ينتظركم في الأمسية.",
    items: [
      { code: "black-tie", title: "أمسية رسمية", text: "أجواء أنيقة ورسمية في قلب نيويورك." },
      { code: "dinner", title: "عشاء بقائمة محددة", text: "قائمة طعام حلال محددة تُقدَّم على المائدة." },
      { code: "bar", title: "مشروبات منعشة", text: "تشكيلة مختارة من العصائر الطازجة والشاي الفاخر والقهوة والمشروبات الفوّارة، تُقدَّم بعناية طوال الأمسية" },
      { code: "lamps", title: "لحظة إضاءة المصابيح", text: "يلتقي نور كل ضيف في الإضاءة المشتركة." },
      { code: "auction", title: "مزاد حي", text: "مزاد حي خلال الأمسية." },
    ],
    pendingNote: "تفاصيل الأمسية قيد الاستكمال مع فريق الفعاليات.",
  },
  host: { eyebrow: "مقدّمة الأمسية", name: "رايا أبي راشد", line: "مقدّمة أمسيتكم." },
  timeline: {
    eyebrow: "البرنامج",
    title: "الأمسية في لمحة",
    hours: "السبت 12 ديسمبر 2026 · ‏3:30 – 8:30 مساءً بتوقيت نيويورك",
    acts: [
      {
        label: "الفصل الأول",
        title: "الشرارة",
        time: "3:30 – 5:00 مساءً",
        items: [
          { time: "3:30 م", title: "حفل الاستقبال" },
          { time: "4:30 م", title: "الافتتاح مع مقدّمة الأمسية رايا أبي راشد" },
          { time: "4:45 م", title: "رؤية تتجاوز الحدود", note: "المتحدث الرئيسي" },
        ],
      },
      {
        label: "الفصل الثاني",
        title: "الحكايات والناس",
        time: "5:00 – 6:15 مساءً",
        items: [
          { time: "5:00 م", title: "لكل نور حكاية", note: "فيلم", highlight: true },
          { time: "5:10 م", title: "أصوات تُضيء", note: "جلسة ضيوف الشرف" },
          { time: "6:00 م", title: "إرث من العطاء", note: "تقليد الكرم المصري العريق" },
        ],
      },
      {
        label: "الفصل الثالث",
        title: "قوة العطاء",
        time: "6:15 – 7:00 مساءً",
        items: [{ time: "6:15 م", title: "لحظة تصنع الفرق", note: "المزاد" }],
      },
      {
        label: "الفصل الرابع",
        title: "احتفال مشترك",
        time: "7:00 – 8:15 مساءً",
        items: [
          { time: "7:00 م", title: "احتفال بالنور المشترك", note: "فقرة ترفيهية" },
          { time: "7:30 م", title: "مائدة الهدف المشترك", note: "العشاء" },
          { time: "8:15 م", title: "يستمر النور", note: "ختام الأمسية" },
        ],
      },
    ],
    note: "المتحدثون قيد التأكيد. البرنامج قابل للتغيير.",
  },
  venue: {
    eyebrow: "المكان",
    title: "583 بارك أفينيو، نيويورك",
    name: "بارك أفينيو، نيويورك",
    address: "583 بارك أفينيو (عند الشارع 63 الشرقي)، نيويورك، NY 10065",
    mapLabel: "عرض على الخريطة",
    photos: "صور المكان",
  },
  attendance: {
    eyebrow: "الحضور",
    title: "انضموا إلينا في الأمسية.",
    ticket: "تذكرة فردية",
    price: "500 دولار أمريكي",
    bookNow: "احجز الآن",
    rules: ["تذكرة واحدة لكل ضيف", "تحمل كل تذكرة اسم الضيف نفسه", "لا يُسمح بمرافق"],
    note: "ستتولى الجهة الراعية مالياً ترتيبات الحجز والدفع وهي قيد التأكيد. لا يمكن شراء أي شيء من هذه الصفحة بعد.",
    contact: "لديك سؤال؟ راسلنا على {email}",
  },
  sponsorship: {
    eyebrow: "الرعاية",
    title: "أضيئوا الأمسية معنا.",
    body: "ترحب MEKI بالشركاء الذين يشاركونها التزامها بتغيير دائم.",
    pending: "فرص الرعاية قيد الاستكمال، وستُعلن تفاصيلها بعد تأكيدها.",
    previewLabel: "معاينة للتطوير · مقترح وغير معتمد · غير منشور",
    cta: "كن راعيًا الآن",
    partners: "الشركاء",
    newTab: "(يفتح في علامة تبويب جديدة)",
    pdf: "باقات الرعاية، ملف PDF، يفتح في علامة تبويب جديدة",
    docNote: "باقات الرعاية (PDF). جميع المبالغ مساهمات مقترحة، والمزايا رهن الاتفاق النهائي والتوافر.",
    contact: "للاستفسارات، تواصل معنا عبر {email}",
  },
  venueLogoAlt: "583 بارك أفينيو، نيويورك",
  purposePhotos: "صور من الأمسية",
  follow: { title: "تابعونا", text: "تابعوا MEKI للاطلاع على أخبار الأمسية وبرامجنا." },
  causes: { eyebrow: "القضايا المدعومة", title: "ما يدعمه نورك.", intro: "" },
  faq: {
    eyebrow: "أسئلة",
    title: "معلومات مفيدة",
    pendingLabel: "قيد التأكيد",
    items: [
      { q: "الزي", a: "زي رسمي (بلاك تاي)." },
      { q: "الطعام والاحتياجات الغذائية", a: "العشاء حلال ومُقدَّم على المائدة. الاحتياجات الغذائية الأخرى: خالٍ من الغلوتين، نباتي صرف، نباتي، حساسية المكسرات، وخالٍ من الألبان." },
      { q: "إمكانية الوصول", a: "المكان مجهز بالكامل لإمكانية الوصول." },
      { q: "المكان", a: "583 بارك أفينيو، نيويورك." },
      { q: "الحجز", a: "الحجوزات مؤكدة. سعر التذكرة الفردية 500 دولار أمريكي للضيف، باسمه." },
      { q: "الإلغاء", a: "لا يُسمح بإلغاء الحجوزات." },
      { q: "الإيصالات", a: "الإيصالات مؤكدة." },
    ],
    donationRefund: { q: "استرداد التبرعات", a: "التبرعات لحملة الأمسية غير قابلة للاسترداد، وفق ما أكدته الجهة الراعية مالياً Spring of Dignity International (SDI)." },
    cancellationsQ: "الإلغاء",
  },
  booking: {
    eyebrow: "الحجز والعطاء",
    title: "طريقتان للمشاركة.",
    book: { title: "احجز مكانك", text: "احجز تذكرة فردية باسمك.", cta: "احجز مكانك", status: "الحجز غير متاح بعد. سنشارك تفاصيله فور تأكيدها." },
    give: {
      title: "تبرّع دون حضور",
      text: "ادعم حملة الأمسية حتى لو تعذّر حضورك.",
      cta: "تبرّع دون حضور",
      status: "التبرع الإلكتروني غير متاح بعد. لا تُحصَّل أي مدفوعات من هذه الصفحة.",
      projectText: "تدعم تبرعات الأمسية {project}، وهو المشروع الوحيد المعتمد مع الجهة الراعية مالياً Spring of Dignity International (SDI).",
      openStatus: "يفتح نموذج التبرع الآمن الخاص بـ SDI على Zeffy. تتلقى SDI التبرع وتُصدر إيصالك.",
      closedStatus: "اختُتمت حملة تبرعات الأمسية. شكراً لكل من تبرّع.",
      newTab: "(يفتح في علامة تبويب جديدة)",
    },
  },
  back: "العودة إلى الرئيسية",
};

export const getGala = (locale: "en" | "ar"): GalaDict => (locale === "ar" ? galaAr : galaEn);

/**
 * PROPOSED sponsorship tiers from "Gala Page.pdf" — every package is marked "to be validated" there.
 * Rendered ONLY in a non-production development preview (NEXT_PUBLIC_GALA_PREVIEW=1). Never public.
 */
export const PROPOSED_SPONSORSHIP: SponsorTier[] = [
  {
    name: "Nova Partner",
    price: "USD 40,000",
    tagline: "The brightest light in the room.",
    exclusive: true,
    benefits: ["“Presented in partnership with” the evening", "Table of 10, front section, with a VIP welcome", "Logo on the invitation and at the top of the Gala page", "Thanked from the stage at the welcome and the close"],
  },
  {
    name: "Aurora Partner",
    price: "USD 20,000",
    tagline: "Light that spreads across the evening.",
    benefits: ["Table of 10, with dedicated registration", "Half-page profile in the printed program", "Insert in every guest gift", "Thanked from the stage at the close"],
  },
  {
    name: "Star Partner",
    price: "USD 10,000",
    tagline: "A light that guides the way.",
    benefits: ["Five seats at the Gala", "Logo on the photo wall and the partners page", "Shared partners slide on the screens", "Thanked collectively from the stage and on social media"],
  },
];
