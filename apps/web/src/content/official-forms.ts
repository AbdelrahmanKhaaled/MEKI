/**
 * Copy for the hand-off to SDI's official Zeffy forms (English + Arabic). The Arabic text is a technical interface translation
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
    text: "Tickets for the MEKI Gala Night are sold by our fiscal sponsor, SDI, on its official Zeffy form. Payment, your tickets and your receipt are handled there.",
    points: [
      "You will leave meki-us.org and continue on zeffy.com.",
      "Enter the attendee details the form asks for, including any dietary requirements.",
      "MEKI never sees or stores your card details.",
    ],
    cta: "Continue to the official ticket form",
    newTab: "(opens in a new tab)",
    confirmNote: "Opening the form does not book a place. Your booking is confirmed only by the e-mail you receive from SDI/Zeffy after payment.",
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
    title: "احجز عبر نموذج تذاكر الأمسية الرسمي لدى SDI",
    text: "تُباع تذاكر أمسية MEKI الخيرية عبر الجهة الراعية مالياً SDI من خلال نموذجها الرسمي على Zeffy. يتم هناك الدفع وإصدار التذاكر والإيصال.",
    points: [
      "ستغادر موقع meki-us.org وتتابع على zeffy.com.",
      "أدخل بيانات الحضور التي يطلبها النموذج، بما في ذلك أي متطلبات غذائية.",
      "لا تطّلع MEKI على بيانات بطاقتك ولا تحفظها.",
    ],
    cta: "المتابعة إلى نموذج التذاكر الرسمي",
    newTab: "(يُفتح في علامة تبويب جديدة)",
    confirmNote: "فتح النموذج لا يعني حجز مقعد. يتأكد حجزك فقط بالبريد الإلكتروني الذي يصلك من SDI/Zeffy بعد الدفع.",
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
