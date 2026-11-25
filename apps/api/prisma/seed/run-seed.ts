/**
 * Baseline seed — SAFE, IDEMPOTENT, CREATE-ONLY.
 *
 *  - Every record has a stable key (code / slug / composite unique). Existing rows are NEVER updated,
 *    so edits made later through the Admin Dashboard are preserved on every re-run.
 *  - Nothing is deleted, truncated or reset.
 *  - No admin accounts (see scripts/bootstrap-admin.ts and prisma/seed-dev-accounts.ts),
 *    no donors, donations, payments, receipts, targets, totals or progress figures.
 *  - Proposed campaigns are DRAFT, unapproved, donations closed.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PrismaClient } from '../../src/generated/prisma/client';
import type { Prisma, SectionKey, Provenance } from '../../src/generated/prisma/client';
import { ALL_PERMISSIONS, PERMISSION_GRANTS, PERMISSIONS, SUPER_ADMIN, SYSTEM_ROLES } from '../../src/modules/users/permissions.catalog';
import { seedGalaNightDraft, seedGalaTicketConfig } from './gala-night';
import { buildSectionSnapshot } from '../../src/modules/cms/section-snapshot';
import { ar, CAMPAIGN_SOURCES, en, ENABLING_SLUGS, MANDATE_WORDING, SECTION_MEDIA, SOURCES, STAT_META, webMedia } from './seed-data';

export interface SeedReport {
  created: Record<string, number>;
  existing: Record<string, number>;
}

const WEB_PUBLIC = resolve(__dirname, '../../../web/public');

export async function runSeed(prisma: PrismaClient, log: (msg: string) => void = () => undefined): Promise<SeedReport> {
  const report: SeedReport = { created: {}, existing: {} };
  const tally = (entity: string, created: boolean) => {
    const bucket = created ? report.created : report.existing;
    bucket[entity] = (bucket[entity] ?? 0) + 1;
  };

  /** Create-only helper: returns the existing row untouched, or creates it. */
  async function ensure<T>(entity: string, find: () => Promise<T | null>, create: () => Promise<T>): Promise<T> {
    const found = await find();
    if (found) {
      tally(entity, false);
      return found;
    }
    const row = await create();
    tally(entity, true);
    return row;
  }

  // ───────── permissions & roles ─────────
  for (const key of ALL_PERMISSIONS) {
    await ensure(
      'permission',
      () => prisma.permission.findUnique({ where: { key } }),
      () => prisma.permission.create({ data: { key, group: PERMISSIONS[key].group, description: PERMISSIONS[key].description } }),
    );
  }
  const permissionIds = new Map((await prisma.permission.findMany()).map((p) => [p.key, p.id]));

  for (const [key, def] of Object.entries(SYSTEM_ROLES)) {
    const existing = await prisma.role.findUnique({ where: { key } });
    if (existing) {
      tally('role', false);
      // New catalog permissions are auto-granted to SUPER_ADMIN only; other roles' assignments belong to admins.
      if (key === SUPER_ADMIN) {
        await prisma.rolePermission.createMany({
          data: def.permissions.map((p) => ({ roleId: existing.id, permissionId: permissionIds.get(p)! })),
          skipDuplicates: true,
        });
      }
      continue;
    }
    await prisma.role.create({
      data: {
        key,
        name: def.name,
        description: def.description,
        isSystem: true,
        permissions: { create: def.permissions.map((p) => ({ permissionId: permissionIds.get(p)! })) },
      },
    });
    tally('role', true);
  }

  // ───────── versioned permission grants (apply once per version) ─────────
  for (const { version, grants } of PERMISSION_GRANTS) {
    const action = `seed.permission_grant:${version}`;
    if (await prisma.auditLog.findFirst({ where: { action } })) {
      tally('permissionGrant', false);
      continue;
    }
    for (const [roleKey, perms] of Object.entries(grants)) {
      const role = await prisma.role.findUnique({ where: { key: roleKey } });
      if (!role || !perms?.length) continue;
      await prisma.rolePermission.createMany({
        data: perms.map((p) => ({ roleId: role.id, permissionId: permissionIds.get(p)! })),
        skipDuplicates: true,
      });
    }
    await prisma.auditLog.create({ data: { action, entityType: 'Role', metadata: grants as Prisma.InputJsonValue } });
    tally('permissionGrant', true);
  }

  // ───────── media (curated web images; files already in apps/web/public) ─────────
  const manifestPath = resolve(WEB_PUBLIC, 'images/work/manifest.json');
  // + the 24 Nov 2026 client delivery (hero photos, program covers, water photo): apps/web/scripts/build-client-delivery.mjs
  const deliveryPath = resolve(WEB_PUBLIC, 'images/work/client-delivery.json');
  const manifest: { key: string; sourceFolder?: string; sourceFile?: string }[] = [
    ...(existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : []),
    ...(existsSync(deliveryPath) ? JSON.parse(readFileSync(deliveryPath, 'utf8')) : []),
  ];
  const cap = (g?: { title: string; place?: string }) => (g ? (g.place ? `${g.title} – ${g.place}` : g.title) : undefined);
  const galleryCaptions = new Map(en.gallery.items.map((g, i) => [g.image as string, { en: cap(g), ar: cap(ar.gallery.items[i]) }]));
  const mediaIds = new Map<string, string>();
  for (const [key, meta] of Object.entries(webMedia)) {
    const file = resolve(WEB_PUBLIC, `.${meta.src}`);
    const src = manifest.find((m) => m.key === key);
    const caption = galleryCaptions.get(key);
    const row = await ensure(
      'mediaAsset',
      () => prisma.mediaAsset.findUnique({ where: { code: `web:${key}` } }),
      () =>
        prisma.mediaAsset.create({
          data: {
            code: `web:${key}`,
            storageDriver: 'WEB_STATIC',
            storageKey: meta.src,
            originalName: src?.sourceFile ?? null,
            sourceFolder: src?.sourceFolder ?? null,
            mimeType: 'image/webp',
            sizeBytes: existsSync(file) ? statSync(file).size : 0,
            checksum: existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null,
            width: meta.w,
            height: meta.h,
            category: 'GALLERY',
            captionEn: caption?.en ?? null,
            captionAr: caption?.ar ?? null,
            credit: 'Misr El-Kheir programme photography (client-supplied)',
            consentStatus: 'UNKNOWN', // must be confirmed by MEKI before production publication
            provenance: 'VERIFIED_SOURCE',
          },
        }),
    );
    mediaIds.set(key, row.id);
  }
  const mediaId = (key?: string | null) => (key ? (mediaIds.get(key) ?? null) : null);

  // ───────── site & donation settings (singletons) ─────────
  await ensure(
    'siteSetting',
    () => prisma.siteSetting.findUnique({ where: { id: 'default' } }),
    () =>
      prisma.siteSetting.create({
        data: {
          id: 'default',
          orgNameEn: 'MEKI',
          orgNameAr: 'MEKI',
          taglineEn: en.footer.tagline,
          taglineAr: ar.footer.tagline,
          legacyLineEn: en.footer.legacy,
          legacyLineAr: ar.footer.legacy,
          // Approved logo files (MEKI client edits, 23 Nov 2026 — apps/web/scripts/build-brand.mjs)
          logoPrimaryUrl: '/brand/MEKI_Secondary_Green.png',
          logoInverseUrl: '/brand/MEKI_Secondary_White.png',
          logoIconUrl: '/brand/MEKI_Icon_Approved_512.png',
          contactEmail: null, // not supplied by MEKI yet — never invented
          contactPhone: null,
          socialLinks: en.footer.social, // Instagram @meki.intr confirmed by MEKI (22 Nov 2026); other accounts to be sent
          defaultLocale: 'en',
          supportedLocales: ['en', 'ar'],
          footerNoteEn: en.footer.contactPending,
          footerNoteAr: ar.footer.contactPending,
          copyrightEn: en.footer.rights,
          copyrightAr: ar.footer.rights,
          seoTitleEn: en.meta.title,
          seoTitleAr: ar.meta.title,
          seoDescriptionEn: en.meta.description,
          seoDescriptionAr: ar.meta.description,
        },
      }),
  );
  await ensure(
    'donationSetting',
    () => prisma.donationSetting.findUnique({ where: { id: 'default' } }),
    () =>
      prisma.donationSetting.create({
        data: {
          id: 'default',
          defaultCurrency: 'USD', // preview currency; USD-only vs multi-currency is a client decision
          displayCurrencies: ['USD'],
          suggestedAmounts: [25, 50, 100, 250], // PROPOSED preview amounts (QuickDonate.tsx)
          allowCustomAmount: true,
          allowOneTime: true,
          allowRecurring: false, // UI shows "Monthly" as preview; depends on provider support
          paymentsEnabled: false,
          paymentProvider: null,
          previewNoticeEn: en.quick.note,
          previewNoticeAr: ar.quick.note,
          provenance: 'PROPOSED',
        },
      }),
  );

  // ───────── programmes (9) + enabling functions (3) ─────────
  const programmeIds = new Map<string, string>();
  for (const [i, p] of en.programmes.items.entries()) {
    const pa = ar.programmes.items[i];
    const alt = MANDATE_WORDING[p.slug];
    const row = await ensure(
      'programme',
      () => prisma.programme.findUnique({ where: { code: `PRG-${p.n}` } }),
      () =>
        prisma.programme.create({
          data: {
            code: `PRG-${p.n}`,
            slug: p.slug,
            kind: 'PROGRAMME',
            number: Number(p.n),
            nameEn: p.name,
            nameAr: pa.name,
            altNameEn: alt?.en ?? null,
            altNameAr: alt?.ar ?? null,
            shortDescEn: p.short,
            shortDescAr: pa.short,
            mandateEn: p.mandate,
            mandateAr: pa.mandate,
            focusAreasEn: p.themes,
            focusAreasAr: pa.themes,
            focusAreaDetailsEn: p.areaTexts,
            focusAreaDetailsAr: pa.areaTexts,
            pageTitleEn: p.pageTitle ?? null,
            pageTitleAr: pa.pageTitle ?? null,
            summaryEn: p.summary,
            summaryAr: pa.summary,
            outcomesEn: p.outcomes,
            outcomesAr: pa.outcomes,
            icon: p.icon,
            coverMediaId: mediaId(p.image),
            sortOrder: (i + 1) * 10,
            isFeatured: true,
            status: 'PUBLISHED',
            publishedAt: new Date(),
            provenance: 'VERIFIED_SOURCE',
            sourceRef: `${SOURCES.brand24}; mandate/focus areas: ${SOURCES.portfolio}; alt wording: ${SOURCES.mandates}; Arabic: proposed translation`,
          },
        }),
    );
    programmeIds.set(p.slug, row.id);
  }
  for (const [i, f] of en.enabling.items.entries()) {
    const fa = ar.enabling.items[i];
    await ensure(
      'programme',
      () => prisma.programme.findUnique({ where: { code: `ENB-0${i + 1}` } }),
      () =>
        prisma.programme.create({
          data: {
            code: `ENB-0${i + 1}`,
            slug: ENABLING_SLUGS[i],
            kind: 'ENABLING_FUNCTION', // capabilities, not programmes — never donation campaigns by default
            nameEn: f.name,
            nameAr: fa.name,
            shortDescEn: f.tagline,
            shortDescAr: fa.tagline,
            summaryEn: f.text,
            summaryAr: fa.text,
            icon: f.icon,
            sortOrder: (i + 1) * 10,
            status: 'PUBLISHED',
            publishedAt: new Date(),
            provenance: 'VERIFIED_SOURCE',
            sourceRef: `${SOURCES.brand24}; ${SOURCES.portfolio}; Arabic: proposed translation`,
          },
        }),
    );
  }

  // ───────── projects + proposed campaigns (DRAFT, unapproved) ─────────
  for (const [i, c] of en.campaigns.items.entries()) {
    const ca = ar.campaigns.items[i];
    const src = CAMPAIGN_SOURCES[c.slug];
    const project = await ensure(
      'project',
      () => prisma.project.findUnique({ where: { code: `PRJ-${c.slug.toUpperCase()}` } }),
      () =>
        prisma.project.create({
          data: {
            code: `PRJ-${c.slug.toUpperCase()}`,
            slug: c.slug,
            programmeId: programmeIds.get(c.programmeSlug) ?? null,
            nameEn: c.title,
            nameAr: ca.title,
            locationEn: src?.locationEn ?? null,
            locationAr: src?.locationAr ?? null,
            sourceFolder: src?.folder ?? null,
            provenance: 'PROPOSED',
            sourceRef: 'Client photo folder (project subject); programme mapping proposed by development team',
            status: 'DRAFT',
          },
        }),
    );
    await ensure(
      'campaign',
      () => prisma.campaign.findUnique({ where: { code: `CMP-${c.slug.toUpperCase()}` } }),
      () =>
        prisma.campaign.create({
          data: {
            code: `CMP-${c.slug.toUpperCase()}`,
            slug: c.slug,
            programmeId: programmeIds.get(c.programmeSlug) ?? null,
            projectId: project.id,
            titleEn: c.title,
            titleAr: ca.title,
            summaryEn: c.text,
            summaryAr: ca.text,
            locationEn: src?.locationEn ?? null,
            locationAr: src?.locationAr ?? null,
            coverMediaId: mediaId(c.image),
            currency: 'USD',
            allowCustomAmount: true,
            targetAmount: null, // never fabricated
            isFeatured: true,
            sortOrder: (i + 1) * 10,
            status: 'DRAFT',
            provenance: 'PROPOSED',
            donationsOpen: false,
            sourceRef: `Preview card on landing page; photo folder "${src?.folder ?? 'n/a'}". NOT an approved fundraiser.`,
          },
        }),
    );
  }

  // ───────── impact statistics (verified source, with attribution) ─────────
  for (const [i, s] of en.impact.stats.entries()) {
    const sa = ar.impact.stats[i];
    const meta = STAT_META[i];
    await ensure(
      'impactStatistic',
      () => prisma.impactStatistic.findUnique({ where: { code: meta.code } }),
      () =>
        prisma.impactStatistic.create({
          data: {
            code: meta.code,
            labelEn: s.label,
            labelAr: sa.label,
            value: s.value,
            prefix: s.prefix || null,
            suffix: s.suffix || null,
            unit: meta.unit,
            displayFormat: meta.displayFormat,
            sourceRef: SOURCES.brand25,
            attributionEn: en.impact.attribution,
            attributionAr: ar.impact.attribution,
            reportingPeriodEn: meta.periodEn,
            reportingPeriodAr: meta.periodAr,
            verificationStatus: 'VERIFIED',
            verifiedAt: new Date(),
            sortOrder: (i + 1) * 10,
            status: 'PUBLISHED',
            publishedAt: new Date(),
            provenance: 'VERIFIED_SOURCE',
          },
        }),
    );
  }

  // ───────── FAQ (development-team copy shown on the preview site) ─────────
  for (const [i, f] of en.faq.items.entries()) {
    const fa = ar.faq.items[i];
    await ensure(
      'faq',
      () => prisma.faq.findUnique({ where: { code: `faq-${i + 1}` } }),
      () =>
        prisma.faq.create({
          data: {
            code: `faq-${i + 1}`,
            questionEn: f.q,
            questionAr: fa.q,
            answerEn: f.a,
            answerAr: fa.a,
            category: 'giving',
            sortOrder: (i + 1) * 10,
            status: 'PUBLISHED',
            publishedAt: new Date(),
            provenance: 'PROPOSED',
          },
        }),
    );
  }

  // ───────── homepage CMS ─────────
  const page = await ensure(
    'page',
    () => prisma.page.findUnique({ where: { slug: 'home' } }),
    () =>
      prisma.page.create({
        data: {
          slug: 'home',
          titleEn: 'Home',
          titleAr: 'الرئيسية',
          seoTitleEn: en.meta.title,
          seoTitleAr: ar.meta.title,
          seoDescriptionEn: en.meta.description,
          seoDescriptionAr: ar.meta.description,
          status: 'PUBLISHED',
          publishedAt: new Date(),
          provenance: 'PROPOSED',
        },
      }),
  );

  type ItemSeed = { code: string; titleEn?: string; titleAr?: string; textEn?: string; textAr?: string; icon?: string; href?: string; media?: string; provenance?: Provenance };
  type SectionSeed = Omit<Prisma.PageSectionUncheckedCreateInput, 'pageId' | 'key' | 'mediaId' | 'sortOrder'> & { key: SectionKey; media?: string; items?: ItemSeed[] };

  const omit = (o: Record<string, string>, keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
  const pairItems = <A, B>(xs: A[], ys: B[], map: (x: A, y: B, i: number) => ItemSeed) => xs.map((x, i) => map(x, ys[i], i));

  const sections: SectionSeed[] = [
    {
      key: 'HERO', anchor: 'top', provenance: 'VERIFIED_SOURCE', sourceRef: `${SOURCES.brand25} (tagline, legacy line, boilerplate)`,
      eyebrowEn: en.hero.eyebrow, eyebrowAr: ar.hero.eyebrow, titleEn: en.hero.titleA, titleAr: ar.hero.titleA, subtitleEn: en.hero.titleB, subtitleAr: ar.hero.titleB,
      bodyEn: en.hero.lead, bodyAr: ar.hero.lead,
      ctaPrimaryLabelEn: en.hero.ctaPrimary, ctaPrimaryLabelAr: ar.hero.ctaPrimary, ctaPrimaryHref: '#programmes',
      ctaSecondaryLabelEn: en.hero.ctaSecondary, ctaSecondaryLabelAr: ar.hero.ctaSecondary, ctaSecondaryHref: '#giving',
      labelsEn: { photoCaption: en.hero.photoCaption, scroll: en.hero.scroll }, labelsAr: { photoCaption: ar.hero.photoCaption, scroll: ar.hero.scroll },
    },
    {
      key: 'QUICK_DONATE', anchor: 'give', provenance: 'PROPOSED', sourceRef: SOURCES.landing,
      titleEn: en.quick.title, titleAr: ar.quick.title, bodyEn: en.quick.note, bodyAr: ar.quick.note,
      labelsEn: omit(en.quick, ['title', 'note']),
      labelsAr: omit(ar.quick, ['title', 'note']),
    },
    {
      key: 'TRUST', provenance: 'PROPOSED', sourceRef: `${SOURCES.landing} (derived from ${SOURCES.brand25})`,
      items: pairItems(en.trust, ar.trust, (x, y, i) => ({ code: `trust-${i + 1}`, titleEn: x.title, titleAr: y.title, textEn: x.text, textAr: y.text })),
    },
    {
      key: 'ABOUT', anchor: 'who-we-are', provenance: 'VERIFIED_SOURCE', sourceRef: SOURCES.brand4,
      eyebrowEn: en.about.eyebrow, eyebrowAr: ar.about.eyebrow, titleEn: en.about.title, titleAr: ar.about.title, bodyEn: en.about.body, bodyAr: ar.about.body,
      labelsEn: { legacy: en.about.legacy, captionA: en.about.captionA, captionB: en.about.captionB, legacyTitle: en.about.legacyTitle, legacyTagline: en.about.legacyTagline },
      labelsAr: { legacy: ar.about.legacy, captionA: ar.about.captionA, captionB: ar.about.captionB, legacyTitle: ar.about.legacyTitle, legacyTagline: ar.about.legacyTagline },
      // MEKI Legacy (Programs Word document, 25 Nov 2026): the three paragraphs of the About page section
      items: pairItems(en.about.legacyParas, ar.about.legacyParas, (x, y, i) => ({ code: `legacy-${i + 1}`, textEn: x, textAr: y })),
    },
    {
      key: 'VISION_MISSION', provenance: 'VERIFIED_SOURCE', sourceRef: `${SOURCES.brand4} (vision & mission verbatim; headings proposed)`,
      eyebrowEn: en.about.vmEyebrow, eyebrowAr: ar.about.vmEyebrow, titleEn: en.about.vmTitle, titleAr: ar.about.vmTitle, subtitleEn: en.about.vmTagline, subtitleAr: ar.about.vmTagline,
      items: [
        { code: 'vision', titleEn: en.about.visionLabel, titleAr: ar.about.visionLabel, textEn: en.about.vision, textAr: ar.about.vision, provenance: 'VERIFIED_SOURCE' },
        { code: 'mission', titleEn: en.about.missionLabel, titleAr: ar.about.missionLabel, textEn: en.about.mission, textAr: ar.about.mission, provenance: 'VERIFIED_SOURCE' },
      ],
    },
    {
      key: 'HOW_WE_WORK', anchor: 'how-we-work', provenance: 'PROPOSED', sourceRef: `${SOURCES.landing} (verbs from mission, ${SOURCES.brand4})`,
      eyebrowEn: en.how.eyebrow, eyebrowAr: ar.how.eyebrow, titleEn: en.how.title, titleAr: ar.how.title, bodyEn: en.how.intro, bodyAr: ar.how.intro,
      items: pairItems(en.how.items, ar.how.items, (x, y, i) => ({ code: `verb-${i + 1}`, titleEn: x.verb, titleAr: y.verb, textEn: x.text, textAr: y.text })),
    },
    {
      key: 'IMPACT', anchor: 'impact', provenance: 'VERIFIED_SOURCE', sourceRef: `${SOURCES.brand25} (figures served from ImpactStatistic)`,
      eyebrowEn: en.impact.eyebrow, eyebrowAr: ar.impact.eyebrow, titleEn: en.impact.title, titleAr: ar.impact.title, bodyEn: en.impact.intro, bodyAr: ar.impact.intro,
      labelsEn: { attribution: en.impact.attribution }, labelsAr: { attribution: ar.impact.attribution },
    },
    {
      key: 'PROGRAMMES', anchor: 'programmes', provenance: 'PROPOSED', sourceRef: `${SOURCES.landing} (programme data served from Programme)`,
      eyebrowEn: en.programmes.eyebrow, eyebrowAr: ar.programmes.eyebrow, titleEn: en.programmes.title, titleAr: ar.programmes.title, bodyEn: en.programmes.intro, bodyAr: ar.programmes.intro,
      labelsEn: { mandateLabel: en.programmes.mandateLabel, themesLabel: en.programmes.themesLabel, outcomesLabel: en.programmes.outcomesLabel, give: en.programmes.give, howTitle: en.programmes.howTitle },
      labelsAr: { mandateLabel: ar.programmes.mandateLabel, themesLabel: ar.programmes.themesLabel, outcomesLabel: ar.programmes.outcomesLabel, give: ar.programmes.give, howTitle: ar.programmes.howTitle },
      // "How it works" — five numbered steps (MEKI client edits, 22 Nov 2026)
      items: pairItems(en.programmes.how, ar.programmes.how, (x, y, i) => ({ code: `how-${i + 1}`, titleEn: x.title, titleAr: y.title, textEn: x.text, textAr: y.text, provenance: 'VERIFIED_SOURCE' })),
    },
    {
      key: 'ENABLING', provenance: 'VERIFIED_SOURCE', sourceRef: `${SOURCES.brand24}; ${SOURCES.portfolio} (functions served from Programme kind=ENABLING_FUNCTION)`,
      eyebrowEn: en.enabling.eyebrow, eyebrowAr: ar.enabling.eyebrow, titleEn: en.enabling.title, titleAr: ar.enabling.title, bodyEn: en.enabling.intro, bodyAr: ar.enabling.intro,
    },
    {
      key: 'CAMPAIGNS', anchor: 'campaigns', provenance: 'PROPOSED', sourceRef: `${SOURCES.landing} (campaigns served only once approved)`,
      eyebrowEn: en.campaigns.eyebrow, eyebrowAr: ar.campaigns.eyebrow, titleEn: en.campaigns.title, titleAr: ar.campaigns.title, bodyEn: en.campaigns.intro, bodyAr: ar.campaigns.intro,
      labelsEn: { badge: en.campaigns.badge, donate: en.campaigns.donate, prev: en.campaigns.prev, next: en.campaigns.next, noFigures: en.campaigns.noFigures },
      labelsAr: { badge: ar.campaigns.badge, donate: ar.campaigns.donate, prev: ar.campaigns.prev, next: ar.campaigns.next, noFigures: ar.campaigns.noFigures },
    },
    {
      key: 'WHY', provenance: 'PROPOSED', sourceRef: SOURCES.landing,
      eyebrowEn: en.why.eyebrow, eyebrowAr: ar.why.eyebrow, titleEn: en.why.quote, titleAr: ar.why.quote, bodyEn: en.why.lead, bodyAr: ar.why.lead,
      items: pairItems(en.why.items, ar.why.items, (x, y, i) => ({ code: `why-${i + 1}`, titleEn: x.title, titleAr: y.title, textEn: x.text, textAr: y.text })),
    },
    {
      key: 'PROCESS', anchor: 'giving', provenance: 'PROPOSED', sourceRef: SOURCES.landing,
      eyebrowEn: en.process.eyebrow, eyebrowAr: ar.process.eyebrow, titleEn: en.process.title, titleAr: ar.process.title, bodyEn: en.process.intro, bodyAr: ar.process.intro,
      labelsEn: { neverTitle: en.process.neverTitle, status: en.process.status }, labelsAr: { neverTitle: ar.process.neverTitle, status: ar.process.status },
      items: [
        ...pairItems(en.process.steps, ar.process.steps, (x, y, i) => ({ code: `step-${i + 1}`, titleEn: x.title, titleAr: y.title, textEn: x.text, textAr: y.text })),
        ...pairItems(en.process.never, ar.process.never, (x, y, i) => ({ code: `never-${i + 1}`, textEn: x, textAr: y })),
      ],
    },
    {
      key: 'GALLERY', anchor: 'our-work', provenance: 'PROPOSED', sourceRef: `${SOURCES.landing}; captions are working labels from source folders`,
      eyebrowEn: en.gallery.eyebrow, eyebrowAr: ar.gallery.eyebrow, titleEn: en.gallery.title, titleAr: ar.gallery.title, bodyEn: en.gallery.intro, bodyAr: ar.gallery.intro,
      labelsEn: { note: en.gallery.note }, labelsAr: { note: ar.gallery.note },
      // Title = item title, Place = item text, Program = item href "/programs/<slug>" (MEKI client edits, 22–23 Nov 2026).
      items: pairItems(en.gallery.items, ar.gallery.items, (x, y, i) => ({ code: `photo-${i + 1}`, titleEn: x.title, titleAr: y.title, textEn: x.place, textAr: y.place, href: x.program ? `/programs/${x.program}` : undefined, media: x.image })),
    },
    {
      key: 'FAQ', anchor: 'faq', provenance: 'PROPOSED', sourceRef: `${SOURCES.landing} (questions served from Faq)`,
      eyebrowEn: en.faq.eyebrow, eyebrowAr: ar.faq.eyebrow, titleEn: en.faq.title, titleAr: ar.faq.title, bodyEn: en.faq.intro, bodyAr: ar.faq.intro,
    },
    {
      key: 'FINAL_CTA', provenance: 'PROPOSED', sourceRef: `${SOURCES.landing}; chips: ${SOURCES.brand24}`,
      titleEn: en.final.titleA, titleAr: ar.final.titleA, subtitleEn: en.final.titleB, subtitleAr: ar.final.titleB, bodyEn: en.final.text, bodyAr: ar.final.text,
      ctaPrimaryLabelEn: en.final.ctaPrimary, ctaPrimaryLabelAr: ar.final.ctaPrimary, ctaPrimaryHref: '#give',
      ctaSecondaryLabelEn: en.final.ctaSecondary, ctaSecondaryLabelAr: ar.final.ctaSecondary, ctaSecondaryHref: '#programmes',
      labelsEn: { chipProgrammes: en.final.chipProgrammes, chipAccount: en.final.chipAccount },
      labelsAr: { chipProgrammes: ar.final.chipProgrammes, chipAccount: ar.final.chipAccount },
    },
    {
      key: 'FOOTER', provenance: 'PROPOSED', sourceRef: `${SOURCES.landing}; tagline/legacy: ${SOURCES.brand25}`,
      titleEn: en.footer.tagline, titleAr: ar.footer.tagline, subtitleEn: en.footer.legacy, subtitleAr: ar.footer.legacy,
      labelsEn: { explore: en.footer.explore, programmes: en.footer.programmes, giving: en.footer.giving, contactTitle: en.footer.contactTitle, contactPending: en.footer.contactPending, legalPending: en.footer.legalPending, rights: en.footer.rights, backToTop: en.footer.backToTop },
      labelsAr: { explore: ar.footer.explore, programmes: ar.footer.programmes, giving: ar.footer.giving, contactTitle: ar.footer.contactTitle, contactPending: ar.footer.contactPending, legalPending: ar.footer.legalPending, rights: ar.footer.rights, backToTop: ar.footer.backToTop },
      items: [
        ...pairItems(en.nav.links, ar.nav.links, (x, y, i) => ({ code: `nav-${i + 1}`, titleEn: x.label, titleAr: y.label, href: x.href })),
        ...pairItems(en.footer.givingLinks, ar.footer.givingLinks, (x, y, i) => ({ code: `giving-${i + 1}`, titleEn: x.label, titleAr: y.label, href: x.href })),
      ],
    },
  ];

  for (const [index, s] of sections.entries()) {
    const { items = [], media, key, labelsEn, labelsAr, ...fields } = s;
    const clean = (l: unknown): Record<string, string> | undefined =>
      l ? (Object.fromEntries(Object.entries(l as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Record<string, string>) : undefined;
    const existing = await prisma.pageSection.findUnique({ where: { pageId_key: { pageId: page.id, key } } });
    if (existing) {
      tally('pageSection', false);
      continue; // never touch an existing section or its items
    }
    const created = await prisma.pageSection.create({
      data: {
        ...fields,
        key,
        pageId: page.id,
        sortOrder: (index + 1) * 10,
        isVisible: true,
        mediaId: mediaId(media ?? SECTION_MEDIA[key]),
        labelsEn: clean(labelsEn),
        labelsAr: clean(labelsAr),
        status: 'PUBLISHED',
        publishedAt: new Date(),
        hasUnpublishedChanges: false,
        items: {
          create: items.map((it, i) => ({
            code: it.code,
            sortOrder: (i + 1) * 10,
            titleEn: it.titleEn,
            titleAr: it.titleAr,
            textEn: it.textEn,
            textAr: it.textAr,
            icon: it.icon,
            href: it.href,
            mediaId: mediaId(it.media),
            provenance: it.provenance ?? (fields.provenance as Provenance),
          })),
        },
      },
      include: { media: true, items: { include: { media: true } } },
    });
    await prisma.pageSection.update({
      where: { id: created.id },
      data: { publishedData: buildSectionSnapshot(created) as unknown as Prisma.InputJsonValue },
    });
    tally('pageSection', true);
    items.forEach(() => tally('sectionItem', true));
  }

  // ───────── donations (Phase 3): currencies + provider capability records ─────────
  // Technical capability only — NOT confirmation that MEKI accepts these currencies. Only USD (the preview
  // currency) is enabled; no amounts are invented for the others. No donors/donations/transactions are seeded.
  const CURRENCIES = [
    { code: 'USD', nameEn: 'US dollar', nameAr: 'دولار أمريكي', symbol: '$', minorUnits: 2, isEnabled: true, suggestedAmounts: ['25', '50', '100', '250'], sortOrder: 10 },
    { code: 'EUR', nameEn: 'Euro', nameAr: 'يورو', symbol: '€', minorUnits: 2, isEnabled: false, suggestedAmounts: null, sortOrder: 20 },
    { code: 'GBP', nameEn: 'Pound sterling', nameAr: 'جنيه إسترليني', symbol: '£', minorUnits: 2, isEnabled: false, suggestedAmounts: null, sortOrder: 30 },
    { code: 'EGP', nameEn: 'Egyptian pound', nameAr: 'جنيه مصري', symbol: 'E£', minorUnits: 2, isEnabled: false, suggestedAmounts: null, sortOrder: 40 },
  ];
  for (const c of CURRENCIES) {
    await ensure(
      'currency',
      () => prisma.currency.findUnique({ where: { code: c.code } }),
      () =>
        prisma.currency.create({
          data: { ...c, suggestedAmounts: c.suggestedAmounts ?? undefined, provenance: 'PROPOSED' },
        }),
    );
  }
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'staging') {
    // Development/test-only mock provider; disabled until an admin enables it. Never seeded in production.
    await ensure(
      'paymentProvider',
      () => prisma.paymentProvider.findUnique({ where: { code: 'mock' } }),
      () =>
        prisma.paymentProvider.create({
          data: {
            code: 'mock',
            displayName: 'Mock provider (test only — no real money)',
            isEnabled: false,
            isTestProvider: true,
            supportsRecurring: true,
            supportsRefunds: true,
            supportsPartialRefund: true,
          },
        }),
    );
  }

  // ───────── events (Phase 2): Gala Night draft — confirmed facts only ─────────
  tally('event', await seedGalaNightDraft(prisma));
  // Phase 5B: ticket sale configuration (sales CLOSED; create-only)
  tally('galaTicketConfig', await seedGalaTicketConfig(prisma));

  await prisma.auditLog.create({
    data: { action: 'seed.baseline', entityType: 'System', metadata: report as unknown as Prisma.InputJsonValue },
  });
  log(`Seed complete. Created: ${JSON.stringify(report.created)} | already present (untouched): ${JSON.stringify(report.existing)}`);
  return report;
}
