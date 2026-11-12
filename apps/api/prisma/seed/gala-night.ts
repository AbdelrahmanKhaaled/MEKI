import type { PrismaClient, SectionKey } from '../../src/generated/prisma/client';

/**
 * MEKI Gala Night — DRAFT skeleton (create-only).
 *
 * Confirmed (client-provided context, Phase 2 brief): the event name and that it takes place on 12 December.
 * NOT confirmed, therefore left empty: year, start/end time, timezone, venue, description, Arabic title,
 * speakers/guests, registration requirements, ticket prices, sponsorship packages.
 * The event stays DRAFT and unapproved; it cannot be published until approval + date/time/timezone exist.
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
        scheduleNoteEn: '12 December — year, time and venue to be confirmed',
        scheduleNoteAr: null,
        startsAt: null,
        endsAt: null,
        timezone: null,
        registrationMode: 'NONE',
        visibility: 'PUBLIC',
        isFeatured: false,
        status: 'DRAFT',
        provenance: 'PROPOSED',
        sourceRef: 'Client-provided context (Phase 2 brief): event name and 12 December date only',
        internalNotes:
          'PENDING CLIENT CONFIRMATION: year, start/end time, timezone, venue & address, description, Arabic copy, ' +
          'highlights, agenda, speakers/guests, registration/RSVP requirements, ticketing, sponsorship packages, ' +
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
          titleEn: key === 'EVENT_HERO' ? 'MEKI Gala Night' : null,
          sourceRef: 'Skeleton — content pending client confirmation',
        },
      });
    }
  });
  return true;
}
