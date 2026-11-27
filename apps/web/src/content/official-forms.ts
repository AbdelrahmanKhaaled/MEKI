/**
 * Copy for the hand-off to SDI's official Gala forms (English + Arabic). The Arabic text is a technical interface translation
 * drafted by the development team for review. No prices, dates or amounts here: those live on SDI's form and approved content.
 */
import type { OfficialFormKind } from "@/lib/official-forms";

type HandoffCopy = {
  eyebrow: string;
  title: string;
  text: string;
  points: string[];
  cta: string;
  newTab: string;
  confirmNote: string;
};

const en: Record<OfficialFormKind, HandoffCopy> = {
  ticket: {
    eyebrow: "Official ticket form",
    title: "Book on SDI's official Gala ticket form",
    text: "Tickets for the MEKI Gala Night are sold by our fiscal sponsor, SDI, on its official Givebutter page. Payment, your tickets and your receipt are handled there.",
    points: [
      "You will leave meki-us.org and continue on givebutter.com.",
      "Enter the attendee details the form asks for, including any dietary requirements.",
      "MEKI never sees or stores your card details.",
    ],
    cta: "Continue to the official ticket form",
    newTab: "(opens in a new tab)",
    confirmNote: "Opening the form does not book a place. Your booking is confirmed only by the e-mail you receive from SDI/Givebutter after payment.",
  },
  sponsor: {
    eyebrow: "Official sponsorship page",
    title: "Sponsor on SDI's official Gala sponsorship page",
    text: "Sponsorship contributions for the MEKI Gala Night are received by our fiscal sponsor, SDI, on its official Givebutter page.",
    points: [
      "You will leave meki-us.org and continue on givebutter.com.",
      "Choose your sponsorship level and enter the sponsor details requested on the page.",
      "MEKI never sees or stores your card details.",
    ],
    cta: "Continue to the official sponsorship page",
    newTab: "(opens in a new tab)",
    confirmNote: "Opening the page does not complete a sponsorship. Confirmation comes only from SDI/Givebutter after payment.",
  },
  donation: {
    eyebrow: "Official donation form",
    title: "Give on SDI's official Gala donation form",
    text: "Gala donations are received by our fiscal sponsor, SDI, on its official Zeffy form. SDI processes the gift and issues your receipt.",
    points: [
      "You will leave meki-us.org and continue on zeffy.com.",
      "A donation is not a ticket. To attend, book a place separately.",
      "MEKI never sees or stores your card details.",
    ],
    cta: "Continue to the official donation form",
    newTab: "(opens in a new tab)",
    confirmNote: "Opening the form does not complete a gift. Your gift is confirmed only by the receipt you receive from SDI/Zeffy.",
  },
};

const ar: Record<OfficialFormKind, HandoffCopy> = {
  ticket: {
    eyebrow: "نموذج التذاكر الرسمي",
    title: "احجز عبر صفحة تذاكر الأمسية الرسمية لدى SDI",
    text: "تُباع تذاكر أمسية MEKI الخيرية عبر الجهة الراعية مالياً SDI من خلال صفحتها الرسمية على Givebutter. يتم هناك الدفع وإصدار التذاكر والإيصال.",
    points: [
      "ستغادر موقع meki-us.org وتتابع على givebutter.com.",
      "أدخل بيانات الحضور التي يطلبها النموذج، بما في ذلك أي متطلبات غذائية.",
      "لا تطّلع MEKI على بيانات بطاقتك ولا تحفظها.",
    ],
    cta: "المتابعة إلى نموذج التذاكر الرسمي",
    newTab: "(يُفتح في علامة تبويب جديدة)",
    confirmNote: "فتح النموذج لا يعني حجز مقعد. يتأكد حجزك فقط بالبريد الإلكتروني الذي يصلك من SDI/Givebutter بعد الدفع.",
  },
  sponsor: {
    eyebrow: "صفحة الرعاية الرسمية",
    title: "ادعم كراعٍ عبر صفحة رعاية الأمسية الرسمية لدى SDI",
    text: "تتلقى الجهة الراعية مالياً SDI مساهمات رعاية أمسية MEKI الخيرية من خلال صفحتها الرسمية على Givebutter.",
    points: [
      "ستغادر موقع meki-us.org وتتابع على givebutter.com.",
      "اختر فئة الرعاية وأدخل بيانات الجهة الراعية المطلوبة في الصفحة.",
      "لا تطّلع MEKI على بيانات بطاقتك ولا تحفظها.",
    ],
    cta: "المتابعة إلى صفحة الرعاية الرسمية",
    newTab: "(يُفتح في علامة تبويب جديدة)",
    confirmNote: "فتح الصفحة لا يعني إتمام الرعاية. يتأكد ذلك فقط بالإشعار الذي يصلك من SDI/Givebutter بعد الدفع.",
  },
  donation: {
    eyebrow: "نموذج التبرع الرسمي",
    title: "تبرّع عبر نموذج تبرعات الأمسية الرسمي لدى SDI",
    text: "تتلقى الجهة الراعية مالياً SDI تبرعات الأمسية من خلال نموذجها الرسمي على Zeffy، وهي التي تعالج التبرع وتُصدر إيصالك.",
    points: [
      "ستغادر موقع meki-us.org وتتابع على zeffy.com.",
      "التبرع ليس تذكرة حضور. للحضور، احجز مقعدك بشكل منفصل.",
      "لا تطّلع MEKI على بيانات بطاقتك ولا تحفظها.",
    ],
    cta: "المتابعة إلى نموذج التبرع الرسمي",
    newTab: "(يُفتح في علامة تبويب جديدة)",
    confirmNote: "فتح النموذج لا يعني إتمام التبرع. يتأكد تبرعك فقط بالإيصال الذي يصلك من SDI/Zeffy.",
  },
};

export const getHandoffCopy = (locale: string, kind: OfficialFormKind): HandoffCopy => (locale === "ar" ? ar : en)[kind];
