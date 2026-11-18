import type { Locale } from "@/lib/i18n";

/**
 * Copy for the Phase 6 pages (About, Programs, Give, FAQ, Contact, legal shells).
 * Approved wording (mission, vision, tagline, nine program names, process, FAQ answers) is NOT duplicated here:
 * pages read it from the shared dictionary / published CMS content. This file holds only page chrome.
 * Arabic = draft translation pending MEKI approval. Nothing here states payment, receipt, tax or legal terms.
 */

export type PageKey = "home" | "about" | "programs" | "gala" | "give" | "faq" | "contact" | "privacy" | "terms" | "cookies";

/** Locale-relative path for each page ("" = homepage). Used for links and for locale switching. */
export const PAGE_PATH: Record<PageKey, string> = {
  home: "",
  about: "/about",
  programs: "/programs",
  gala: "/events/gala-night",
  give: "/give",
  faq: "/faq",
  contact: "/contact",
  privacy: "/privacy",
  terms: "/terms",
  cookies: "/cookies",
};

export const pageHref = (locale: Locale, key: PageKey) => `/${locale}${PAGE_PATH[key]}`;

type NavKey = "home" | "about" | "programs" | "give" | "faq" | "contact";
export const NAV_ORDER: NavKey[] = ["home", "about", "programs", "give", "faq", "contact"];

export interface MenuLink {
  /** page key for internal links (drives "current page" highlighting), `ext-<n>` for external links */
  key: string;
  href: string;
  label: string;
  external: boolean;
}
const PATH_TO_KEY = new Map<string, PageKey>(Object.entries(PAGE_PATH).map(([k, p]) => [p || "/", k as PageKey]));

/**
 * CMS-managed menus (Phase 6D). Admins edit the `nav-*` (header + footer "Explore") and `giving-*` (footer "Giving") items
 * of the home page's FOOTER section — the single navigation source. A published list is used ONLY when every entry has a
 * label and links to a known site page ("/", "/about", …) or an https URL; anything else — e.g. the "#anchor" links of the
 * former one-page site still in the seed — keeps the built-in menu, so a half-valid menu can never break navigation.
 * Gala Night and the Give button are fixed entries outside these lists; a Gala item in the list is ignored (no duplicate).
 */
export function resolveMenu(links: { href: string; label: string }[] | undefined, locale: Locale): MenuLink[] | null {
  if (!links?.length) return null;
  const out: MenuLink[] = [];
  for (const [i, l] of links.entries()) {
    const label = l.label?.trim();
    const href = l.href?.trim() ?? "";
    if (!label) return null;
    if (/^https:\/\/[^\s"'<>]+$/.test(href)) out.push({ key: `ext-${i}`, href, label, external: true });
    else if (PATH_TO_KEY.has(href)) {
      const key = PATH_TO_KEY.get(href)!;
      if (key !== "gala") out.push({ key, href: pageHref(locale, key), label, external: false });
    } else return null;
  }
  return out.length ? out : null;
}

type Meta = { title: string; description: string };

export type PagesDict = {
  nav: Record<NavKey, string>;
  meta: Record<"about" | "programs" | "give" | "faq" | "contact" | "privacy" | "terms" | "cookies", Meta>;
  about: { title: string; cta: string; ctaLabel: string; legacyNote: string };
  programs: { eyebrow: string; title: string; details: string; cta: string; ctaText: string; ctaLabel: string };
  give: {
    eyebrow: string;
    title: string;
    intro: string;
    stepsEyebrow: string;
    stepsTitle: string;
    transparencyEyebrow: string;
    transparencyTitle: string;
    transparencyNote: string;
    availabilityTitle: string;
    availabilityText: string;
    notifyEmail: string;
    notifyContact: string;
    explore: string;
  };
  faq: { eyebrow: string; title: string; intro: string; general: string; programs: string; giving: string; gala: string; pending: string; ctaTitle: string; ctaText: string; cta: string };
  contact: {
    eyebrow: string;
    title: string;
    intro: string;
    detailsTitle: string;
    email: string;
    phone: string;
    address: string;
    social: string;
    detailsPending: string;
    formTitle: string;
    name: string;
    emailField: string;
    subject: string;
    message: string;
    consent: string;
    submit: string;
    opening: string;
    opened: string;
    required: string;
    invalidEmail: string;
    formUnavailable: string;
    ctaTitle: string;
    ctaAbout: string;
    ctaPrograms: string;
  };
  legal: { eyebrow: string; titles: Record<"privacy" | "terms" | "cookies", string>; pendingTitle: string; pending: string; back: string };
};

export const pagesEn: PagesDict = {
  nav: { home: "Home", about: "About MEKI", programs: "Programs", give: "Give", faq: "FAQ", contact: "Contact" },
  meta: {
    about: { title: "About MEKI — Lasting Change, Built Together.", description: "MEKI partners with people, communities and institutions worldwide to deliver evidence-based development that lasts, inspired by the legacy of Misr El-Kheir." },
    programs: { title: "Nine Programs, One Strategy — MEKI", description: "Explore MEKI's nine evidence-based programs, from social solidarity and health to education, housing, water and scientific research." },
    give: { title: "Give — How Giving to MEKI Will Work", description: "How giving to MEKI is designed to work. Online giving opens soon." },
    faq: { title: "Frequently Asked Questions — MEKI", description: "Answers about MEKI, its programs, giving and the Gala Night." },
    contact: { title: "Contact MEKI", description: "Get in touch with MEKI through our official channels." },
    privacy: { title: "Privacy Policy — MEKI", description: "MEKI's privacy policy." },
    terms: { title: "Terms of Use — MEKI", description: "MEKI's terms of use." },
    cookies: { title: "Cookie Policy — MEKI", description: "MEKI's cookie policy." },
  },
  about: {
    title: "About MEKI",
    cta: "Explore Our Programs",
    ctaLabel: "Ready to see the work?",
    legacyNote: "The figures below describe the work of Misr El-Kheir in Egypt. They are not results achieved by MEKI.",
  },
  programs: {
    eyebrow: "Our programs",
    title: "Nine Programs, One Strategy",
    details: "Mandate and focus areas",
    cta: "How giving will work",
    ctaText: "Online giving opens soon. Learn how giving to MEKI is designed to work.",
    ctaLabel: "Support the work",
  },
  give: {
    eyebrow: "Give",
    title: "Giving, accounted for.",
    intro: "Responsible giving starts with clarity. Here is how giving to MEKI is designed to work once it opens.",
    stepsEyebrow: "How giving works",
    stepsTitle: "Four simple steps.",
    transparencyEyebrow: "Transparency & accountability",
    transparencyTitle: "Every contribution accounted for.",
    transparencyNote: "Payment methods, receipts and tax treatment are being confirmed with our fiscal sponsor and will be published once approved.",
    availabilityTitle: "Online giving opens soon.",
    availabilityText: "We are not accepting online gifts yet, and no payment is taken on this site. To hear when giving opens, get in touch with us.",
    notifyEmail: "Email us to be notified",
    notifyContact: "Contact us",
    explore: "Explore Our Programs",
  },
  faq: {
    eyebrow: "Questions",
    title: "Frequently asked questions",
    intro: "Clear answers about MEKI, its programs, giving and the Gala Night.",
    general: "General",
    programs: "Programs",
    giving: "Giving",
    gala: "Gala Night",
    pending: "To be confirmed",
    ctaTitle: "Still have a question?",
    ctaText: "We would be glad to hear from you.",
    cta: "Contact us",
  },
  contact: {
    eyebrow: "Contact",
    title: "Get in touch.",
    intro: "Questions about MEKI, our programs or the Gala Night? Reach us through our official channels.",
    detailsTitle: "Official channels",
    email: "Email",
    phone: "Phone",
    address: "Address",
    social: "Follow MEKI",
    detailsPending: "Official contact details will be published soon.",
    formTitle: "Send a message",
    name: "Full name",
    emailField: "Email",
    subject: "Subject",
    message: "Message",
    consent: "I understand this opens my own email app, and the message is sent from my email account.",
    submit: "Open in my email app",
    opening: "Opening your email app…",
    opened: "Your email app should have opened. Nothing is sent from this site; please send the message from your email app.",
    required: "This field is required.",
    invalidEmail: "Please enter a valid email address.",
    formUnavailable: "Our contact channel is being set up, so messages cannot be sent from this page yet. Please check back soon.",
    ctaTitle: "Learn more about MEKI",
    ctaAbout: "About MEKI",
    ctaPrograms: "Explore Our Programs",
  },
  legal: {
    eyebrow: "Legal",
    titles: { privacy: "Privacy Policy", terms: "Terms of Use", cookies: "Cookie Policy" },
    pendingTitle: "Coming soon",
    pending: "This document is being prepared and will be published once it has been approved by legal counsel and our fiscal sponsor.",
    back: "Back to home",
  },
};

export const pagesAr: PagesDict = {
  nav: { home: "الرئيسية", about: "عن MEKI", programs: "البرامج", give: "تبرّع", faq: "الأسئلة الشائعة", contact: "تواصل معنا" },
  meta: {
    about: { title: "عن MEKI — تغيير دائم، نبنيه معًا.", description: "تعمل MEKI مع الأفراد والمجتمعات والمؤسسات حول العالم لتحقيق تنمية قائمة على الأدلة تدوم، مستلهمة من إرث مصر الخير." },
    programs: { title: "تسعة برامج، استراتيجية واحدة — MEKI", description: "تعرّف على برامج MEKI التسعة القائمة على الأدلة." },
    give: { title: "تبرّع — كيف سيتم التبرع إلى MEKI", description: "كيف صُمّم التبرع إلى MEKI. التبرع الإلكتروني يُفتح قريبًا." },
    faq: { title: "الأسئلة الشائعة — MEKI", description: "إجابات عن MEKI وبرامجها والتبرع وأمسية الغالا." },
    contact: { title: "تواصل مع MEKI", description: "تواصل مع MEKI عبر قنواتنا الرسمية." },
    privacy: { title: "سياسة الخصوصية — MEKI", description: "سياسة الخصوصية الخاصة بـ MEKI." },
    terms: { title: "شروط الاستخدام — MEKI", description: "شروط استخدام MEKI." },
    cookies: { title: "سياسة ملفات تعريف الارتباط — MEKI", description: "سياسة ملفات تعريف الارتباط الخاصة بـ MEKI." },
  },
  about: { title: "عن MEKI", cta: "استكشف برامجنا", ctaLabel: "هل أنت مستعد لرؤية العمل؟", legacyNote: "الأرقام أدناه تخص عمل مصر الخير في مصر، وليست نتائج حققتها MEKI." },
  programs: {
    eyebrow: "برامجنا",
    title: "تسعة برامج، استراتيجية واحدة",
    details: "التفويض ومجالات التركيز",
    cta: "كيف سيتم التبرع",
    ctaText: "التبرع الإلكتروني يُفتح قريبًا. تعرّف على كيفية تصميم التبرع إلى MEKI.",
    ctaLabel: "ادعم العمل",
  },
  give: {
    eyebrow: "تبرّع",
    title: "عطاء محسوب بوضوح.",
    intro: "يبدأ العطاء المسؤول بالوضوح. هذه هي كيفية تصميم التبرع إلى MEKI عند إطلاقه.",
    stepsEyebrow: "كيف يتم التبرع",
    stepsTitle: "أربع خطوات بسيطة.",
    transparencyEyebrow: "الشفافية والمساءلة",
    transparencyTitle: "كل مساهمة محسوبة.",
    transparencyNote: "طرق الدفع والإيصالات والمعاملة الضريبية قيد التأكيد مع الجهة الراعية مالياً، وستُنشر بعد اعتمادها.",
    availabilityTitle: "التبرع الإلكتروني يُفتح قريبًا.",
    availabilityText: "لا نستقبل تبرعات إلكترونية بعد، ولا تُحصَّل أي مدفوعات عبر هذا الموقع. لمعرفة موعد الإطلاق، تواصل معنا.",
    notifyEmail: "راسلنا لنخطرك",
    notifyContact: "تواصل معنا",
    explore: "استكشف برامجنا",
  },
  faq: {
    eyebrow: "أسئلة",
    title: "الأسئلة الشائعة",
    intro: "إجابات واضحة عن MEKI وبرامجها والتبرع وأمسية الغالا.",
    general: "عام",
    programs: "البرامج",
    giving: "التبرع",
    gala: "أمسية الغالا",
    pending: "قيد التأكيد",
    ctaTitle: "هل لديك سؤال آخر؟",
    ctaText: "يسعدنا أن نسمع منك.",
    cta: "تواصل معنا",
  },
  contact: {
    eyebrow: "تواصل",
    title: "تواصل معنا.",
    intro: "أسئلة عن MEKI أو برامجنا أو أمسية الغالا؟ تواصل معنا عبر قنواتنا الرسمية.",
    detailsTitle: "القنوات الرسمية",
    email: "البريد الإلكتروني",
    phone: "الهاتف",
    address: "العنوان",
    social: "تابع MEKI",
    detailsPending: "ستُنشر بيانات التواصل الرسمية قريبًا.",
    formTitle: "أرسل رسالة",
    name: "الاسم الكامل",
    emailField: "البريد الإلكتروني",
    subject: "الموضوع",
    message: "الرسالة",
    consent: "أدرك أن هذا يفتح تطبيق البريد لديّ، وأن الرسالة تُرسَل من حسابي البريدي.",
    submit: "افتح في تطبيق البريد",
    opening: "جارٍ فتح تطبيق البريد…",
    opened: "يُفترض أن يكون تطبيق البريد قد فُتح. لا يُرسَل شيء من هذا الموقع؛ يرجى إرسال الرسالة من تطبيق البريد.",
    required: "هذا الحقل مطلوب.",
    invalidEmail: "يرجى إدخال بريد إلكتروني صحيح.",
    formUnavailable: "قناة التواصل قيد الإعداد، لذلك لا يمكن إرسال الرسائل من هذه الصفحة بعد. يرجى العودة قريبًا.",
    ctaTitle: "تعرّف أكثر على MEKI",
    ctaAbout: "عن MEKI",
    ctaPrograms: "استكشف برامجنا",
  },
  legal: {
    eyebrow: "قانوني",
    titles: { privacy: "سياسة الخصوصية", terms: "شروط الاستخدام", cookies: "سياسة ملفات تعريف الارتباط" },
    pendingTitle: "قريبًا",
    pending: "هذه الوثيقة قيد الإعداد، وستُنشر بعد اعتمادها من المستشار القانوني والجهة الراعية مالياً.",
    back: "العودة إلى الرئيسية",
  },
};

export const getPages = (locale: Locale): PagesDict => (locale === "ar" ? pagesAr : pagesEn);
