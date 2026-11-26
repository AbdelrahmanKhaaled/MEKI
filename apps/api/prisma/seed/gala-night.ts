import type { PrismaClient, SectionKey } from '../../src/generated/prisma/client';

/**
 * MEKI Gala Night — DRAFT skeleton (create-only).
 *
 * Confirmed (client-provided context, Phase 2 brief): the event name and that it takes place on 12 December.
 * Confirmed by MEKI on 19 November 2026: Saturday 12 December 2026, 3:30–8:30 PM America/New_York (UTC−5 in December).
 * NOT confirmed, therefore left empty: description, Arabic title, speakers/guests, registration requirements, sponsorship packages.
 * The event stays DRAFT and unapproved; publishing still needs MEKI's content approval.
 * Create-only: an existing event row is NEVER modified by the seed — existing databases are updated by an administrator
 * in the dashboard (audited), see docs/55.
 */
export const GALA_CODE = 'EVT-GALA-NIGHT';

const SECTION_SKELETON: SectionKey[] = [
  'EVENT_HERO',
  'EVENT_ABOUT',
  'EVENT_HIGHLIGHTS',
  'EVENT_AGENDA',
  'EVENT_SPEAKERS',
  'EVENT_VENUE',
  'EVENT_SPONSORSHIP',
  'EVENT_CAMPAIGNS',
  'EVENT_FAQ',
  'EVENT_REGISTRATION',
  'EVENT_CONTACT',
];

/**
 * Items of the skeleton sections (25 Nov 2026). Partners: Bokra and The Waterway are named by MEKI but the partnerships are NOT
 * officially signed → entries exist HIDDEN with NO logo (the website needs a published, visible item with a logo to show one).
 * Contact: the confirmed Gala inquiries address (MEKI, 25 Nov 2026).
 */
export const GALA_INQUIRIES_EMAIL = 'Inquiries@meki-us.org';
const SKELETON_ITEMS: Partial<Record<SectionKey, { code: string; titleEn?: string; titleAr?: string; textEn?: string; textAr?: string; href?: string; provenance: 'PROPOSED' | 'VERIFIED_SOURCE'; isVisible: boolean; sortOrder: number }[]>> = {
  EVENT_AGENDA: [
    {
      code: 'act-1',
      titleEn: 'The Spark',
      titleAr: 'الشرارة',
      textEn: JSON.stringify({
        label: 'Act I',
        time: '3:30 – 5:00 PM',
        items: [
          { time: '3:30 PM', title: 'Welcome reception' },
          { time: '4:30 PM', title: 'Opening with our host, Raya Abirached' },
          { time: '4:45 PM', title: 'A Vision Beyond Borders', note: 'Keynote Speaker' },
        ],
      }),
      textAr: JSON.stringify({
        label: 'الفصل الأول',
        time: '3:30 – 5:00 مساءً',
        items: [
          { time: '3:30 م', title: 'حفل الاستقبال' },
          { time: '4:30 م', title: 'الافتتاح مع مقدّمة الأمسية رايا أبي راشد' },
          { time: '4:45 م', title: 'رؤية تتجاوز الحدود', note: 'المتحدث الرئيسي' },
        ],
      }),
      provenance: 'VERIFIED_SOURCE',
      isVisible: true,
      sortOrder: 10,
    },
    {
      code: 'act-2',
      titleEn: 'The Stories and the People',
      titleAr: 'الحكايات والناس',
      textEn: JSON.stringify({
        label: 'Act II',
        time: '5:00 – 6:15 PM',
        items: [
          { time: '5:00 PM', title: 'Every Light Has a Story', note: 'Film', highlight: true },
          { time: '5:10 PM', title: 'Voices That Illuminate', note: 'Guest of Honor Panel' },
          { time: '6:00 PM', title: 'A Legacy of Giving', note: "Egypt's Timeless Tradition of Generosity" },
        ],
      }),
      textAr: JSON.stringify({
        label: 'الفصل الثاني',
        time: '5:00 – 6:15 مساءً',
        items: [
          { time: '5:00 م', title: 'لكل نور حكاية', note: 'فيلم', highlight: true },
          { time: '5:10 م', title: 'أصوات تُضيء', note: 'جلسة ضيوف الشرف' },
          { time: '6:00 م', title: 'إرث من العطاء', note: 'تقليد الكرم المصري العريق' },
        ],
      }),
      provenance: 'VERIFIED_SOURCE',
      isVisible: true,
      sortOrder: 20,
    },
    {
      code: 'act-3',
      titleEn: 'The Power of Giving',
      titleAr: 'قوة العطاء',
      textEn: JSON.stringify({
        label: 'Act III',
        time: '6:15 – 7:00 PM',
        items: [{ time: '6:15 PM', title: 'The Moment to Make It Count', note: 'Auction' }],
      }),
      textAr: JSON.stringify({
        label: 'الفصل الثالث',
        time: '6:15 – 7:00 مساءً',
        items: [{ time: '6:15 م', title: 'لحظة تصنع الفرق', note: 'المزاد' }],
      }),
      provenance: 'VERIFIED_SOURCE',
      isVisible: true,
      sortOrder: 30,
    },
    {
      code: 'act-4',
      titleEn: 'A Shared Celebration',
      titleAr: 'احتفال مشترك',
      textEn: JSON.stringify({
        label: 'Act IV',
        time: '7:00 – 8:15 PM',
        items: [
          { time: '7:00 PM', title: 'A Celebration of Shared Light', note: 'Entertainment' },
          { time: '7:30 PM', title: 'A Table of Shared Purpose', note: 'Dinner' },
          { time: '8:15 PM', title: 'The Light Carries On', note: 'Close of the evening' },
        ],
      }),
      textAr: JSON.stringify({
        label: 'الفصل الرابع',
        time: '7:00 – 8:15 مساءً',
        items: [
          { time: '7:00 م', title: 'احتفال بالنور المشترك', note: 'فقرة ترفيهية' },
          { time: '7:30 م', title: 'مائدة الهدف المشترك', note: 'العشاء' },
          { time: '8:15 م', title: 'يستمر النور', note: 'ختام الأمسية' },
        ],
      }),
      provenance: 'VERIFIED_SOURCE',
      isVisible: true,
      sortOrder: 40,
    },
  ],
  EVENT_SPONSORSHIP: [
    { code: 'partner-bokra', titleEn: 'Bokra', provenance: 'PROPOSED', isVisible: false, sortOrder: 10 },
    { code: 'partner-waterway', titleEn: 'The Waterway', provenance: 'PROPOSED', isVisible: false, sortOrder: 20 },
  ],
  EVENT_CONTACT: [{ code: 'email', href: `mailto:${GALA_INQUIRIES_EMAIL}`, provenance: 'VERIFIED_SOURCE', isVisible: true, sortOrder: 10 }],
};

/** Returns true when created, false when it already existed (never modified). */
export async function seedGalaNightDraft(prisma: PrismaClient): Promise<boolean> {
  if (await prisma.event.findUnique({ where: { code: GALA_CODE } })) return false;

  await prisma.$transaction(async (tx) => {
    const page = await tx.page.create({
      data: { slug: 'event-gala-night', titleEn: 'MEKI Gala Night', status: 'DRAFT', provenance: 'PROPOSED' },
    });
    await tx.event.create({
      data: {
        code: GALA_CODE,
        slug: 'gala-night',
        titleEn: 'MEKI Gala Night',
        titleAr: null, // Arabic title pending approved translation
        scheduleNoteEn: 'Saturday 12 December 2026, 3:30–8:30 PM (New York time)',
        scheduleNoteAr: null,
        // 3:30 PM and 8:30 PM America/New_York on 2026-12-12 (EST, UTC−5)
        startsAt: new Date('2026-12-12T20:30:00.000Z'),
        endsAt: new Date('2026-12-13T01:30:00.000Z'),
        timezone: 'America/New_York',
        registrationMode: 'NONE',
        visibility: 'PUBLIC',
        isFeatured: false,
        status: 'DRAFT',
        provenance: 'PROPOSED',
        sourceRef: 'Client-provided context (Phase 2 brief) + MEKI update 2026-11-19 (date, hours, time zone)',
        internalNotes:
          'PENDING CLIENT CONFIRMATION: description, Arabic copy, highlights, speakers/guests (agenda roles only), ' +
          'registration/RSVP requirements, sponsorship packages, ' +
          'related campaign(s), contact details, imagery. Do not publish until MEKI approves the content.',
        pageId: page.id,
      },
    });
    // Empty, hidden-until-published section skeleton so the dashboard can fill it in immediately.
    for (const [i, key] of SECTION_SKELETON.entries()) {
      await tx.pageSection.create({
        data: {
          pageId: page.id,
          key,
          sortOrder: (i + 1) * 10,
          isVisible: true,
          status: 'DRAFT',
          provenance: 'PROPOSED',
          titleEn: key === 'EVENT_HERO' ? 'MEKI Gala Night' : key === 'EVENT_AGENDA' ? 'The evening at a glance' : null,
          titleAr: key === 'EVENT_AGENDA' ? 'الأمسية في لمحة' : null,
          eyebrowEn: key === 'EVENT_AGENDA' ? 'The program' : null,
          eyebrowAr: key === 'EVENT_AGENDA' ? 'البرنامج' : null,
          subtitleEn: key === 'EVENT_AGENDA' ? 'Saturday, December 12, 2026 · 3:30 – 8:30 PM, New York time' : null,
          subtitleAr: key === 'EVENT_AGENDA' ? 'السبت 12 ديسمبر 2026 · ‏3:30 – 8:30 مساءً بتوقيت نيويورك' : null,
          bodyEn: key === 'EVENT_AGENDA' ? 'Speakers to be confirmed. Program subject to change.' : null,
          bodyAr: key === 'EVENT_AGENDA' ? 'المتحدثون قيد التأكيد. البرنامج قابل للتغيير.' : null,
          sourceRef: 'Skeleton — content pending client confirmation',
          ...(SKELETON_ITEMS[key] ? { items: { create: SKELETON_ITEMS[key] } } : {}),
        },
      });
    }
  });
  return true;
}

/**
 * Phase 5B ticket sale configuration for the Gala (create-only; never updates an existing row).
 * Values: Phase 5B brief, updated by MEKI on 19 November 2026 — USD 500 per guest (supersedes USD 750) and capacity 350.
 * Sales are seeded CLOSED (`salesEnabled = false`): MEKI/SDI must approve opening them. The SDI Zeffy form's own price and
 * capacity are configured by SDI and must be verified separately (docs/55). No fair-market value is stored here.
 */
export async function seedGalaTicketConfig(prisma: PrismaClient): Promise<boolean> {
  const event = await prisma.event.findUnique({ where: { code: GALA_CODE }, select: { id: true } });
  if (!event) return false;
  if (await prisma.eventTicketConfig.findUnique({ where: { eventId: event.id } })) return false;
  await prisma.eventTicketConfig.create({
    data: {
      eventId: event.id,
      ticketNameEn: 'Individual ticket',
      ticketPrice: '500.00',
      currency: 'USD',
      salesEnabled: false,
      maxTicketsPerBooking: 10,
      capacity: 350, // MEKI, 19 November 2026
      displayNameEn: 'Every Light Counts',
      eventDateLabelEn: 'Saturday, December 12, 2026',
      venueLabelEn: '583 Park Avenue, New York, USA',
      provenance: 'PROPOSED',
    },
  });
  return true;
}
