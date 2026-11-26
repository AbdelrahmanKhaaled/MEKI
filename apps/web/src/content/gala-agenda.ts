/**
 * MEKI Gala Night — the APPROVED agenda (client delivery, 26 Nov 2026), owned by the frontend.
 * Deliberately NOT read from the CMS / public event API / event approval: the page shows this agenda even when
 * /api/v1/public/events/gala-night/page answers 404. Edit this file (and redeploy) until the dashboard is synchronised.
 * Times are America/New_York, PM (the footer says so). Item `highlight` = the gold treatment.
 */
export type AgendaItem = { time: string; title: string; note: string; highlight?: boolean };
export type AgendaAct = { label: string; name: string; time: string; items: AgendaItem[] };
export type GalaAgendaCopy = {
  eyebrow: string;
  title: string;
  acts: AgendaAct[];
  footnote: string;
  brandLine: string;
  /** accessible name of the whole section */
  ariaLabel: string;
};

export const galaAgendaEn: GalaAgendaCopy = {
  eyebrow: "The Gala · An evening in four acts · 12 December",
  title: "The Evening in a Glimpse",
  ariaLabel: "The Gala evening agenda",
  acts: [
    {
      label: "Act I",
      name: "The Spark",
      time: "3:30 – 5:00 PM",
      items: [
        { time: "3:30", title: "Where Connections Begin", note: "Pre-event" },
        { time: "4:30", title: "The First Spark", note: "Raya Abirached · Master of Ceremonies" },
        { time: "4:45", title: "A Vision Beyond Borders", note: "Dr. Hassan el Khateeb" },
      ],
    },
    {
      label: "Act II",
      name: "The Stories and the People",
      time: "5:00 – 5:25 PM",
      items: [
        { time: "5:00", title: "Every Light Has a Story", note: "Film" },
        { time: "5:10", title: "Voices That Illuminate", note: "The Great Exchange · Panel" },
      ],
    },
    {
      label: "Act III",
      name: "The Power of Giving",
      time: "5:25 – 6:00 PM",
      items: [
        { time: "5:25", title: "A Legacy of Giving", note: "Egypt's Timeless Tradition of Generosity · Mr. Beshir Shousha" },
        { time: "5:35", title: "The Moment to Make It Count", note: "Paddle Raise · Every Light Counts", highlight: true },
      ],
    },
    {
      label: "Act IV",
      name: "A Shared Celebration",
      time: "6:00 – 8:15 PM",
      items: [
        { time: "6:00", title: "A Table of Shared Purpose", note: "Dinner" },
        { time: "7:00", title: "The Art of Giving", note: "Live Auction · Three Exclusive Pieces" },
        { time: "7:30", title: "A Celebration of Shared Light", note: "Entertainment · Hamza Namira" },
        { time: "8:15", title: "The Light Carries On", note: "Close of the evening" },
      ],
    },
  ],
  footnote: "All times PM, New York.",
  brandLine: "MEKI · Every Light Counts",
};

/** Arabic: names are transliterated (not translated); the Latin "MEKI · EVERY LIGHT COUNTS" brand line is kept as the brand. */
export const galaAgendaAr: GalaAgendaCopy = {
  eyebrow: "الأمسية · أمسية في أربعة فصول · 12 ديسمبر",
  title: "الأمسية في لمحة",
  ariaLabel: "برنامج أمسية الاحتفال",
  acts: [
    {
      label: "الفصل الأول",
      name: "الشرارة",
      time: "3:30 – 5:00 م",
      items: [
        { time: "3:30", title: "حيث تبدأ الصلات", note: "ما قبل الحفل" },
        { time: "4:30", title: "الشرارة الأولى", note: "رايا أبي راشد · مقدّمة الحفل" },
        { time: "4:45", title: "رؤية تتجاوز الحدود", note: "د. حسن الخطيب" },
      ],
    },
    {
      label: "الفصل الثاني",
      name: "الحكايات والناس",
      time: "5:00 – 5:25 م",
      items: [
        { time: "5:00", title: "لكل نور حكاية", note: "فيلم" },
        { time: "5:10", title: "أصوات تُضيء", note: "التبادل الكبير · جلسة حوارية" },
      ],
    },
    {
      label: "الفصل الثالث",
      name: "قوة العطاء",
      time: "5:25 – 6:00 م",
      items: [
        { time: "5:25", title: "إرث من العطاء", note: "تقليد الكرم المصري العريق · السيد بشير شوشة" },
        { time: "5:35", title: "لحظة تصنع الفرق", note: "نداء التبرع (Paddle Raise) · Every Light Counts", highlight: true },
      ],
    },
    {
      label: "الفصل الرابع",
      name: "احتفال مشترك",
      time: "6:00 – 8:15 م",
      items: [
        { time: "6:00", title: "مائدة الهدف المشترك", note: "العشاء" },
        { time: "7:00", title: "فن العطاء", note: "مزاد حي · ثلاث قطع حصرية" },
        { time: "7:30", title: "احتفال بالنور المشترك", note: "فقرة ترفيهية · حمزة نمير" },
        { time: "8:15", title: "يستمر النور", note: "ختام الأمسية" },
      ],
    },
  ],
  footnote: "جميع الأوقات مساءً بتوقيت نيويورك.",
  brandLine: "MEKI · Every Light Counts",
};
