// MEKI final integration (25 Nov 2026) — navigation menus + Site settings.
//  - Menus: a database seeded from the one-page site holds "#anchor" menu entries ("Who we are", "Impact", "Campaigns",
//    "How giving works"…). The website cannot use them (it shows its own six-page menu instead), so Admin → Menus and the public
//    header/footer disagreed. A menu is rewritten to the website's real navigation ONLY while EVERY entry is still such a legacy
//    anchor; a menu an editor has changed is never touched. Extra entries are hidden, never deleted. The footer section is
//    republished only if it was published with no pending edits.
//  - Site settings: the confirmed inquiries e-mail is stored when no contact e-mail is set (an editor's address is kept); the three
//    confirmed social accounts are added per network (an editor's URL for a network is kept).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const NOV23 = JSON.parse(readFileSync(join(HERE, '../apply-nov23-client-edits.data.json'), 'utf8'));
export const INQUIRIES_EMAIL = 'Inquiries@meki-us.org';

/** The website's real navigation (mirrors apps/web content/pages.ts NAV_ORDER; apps/admin lib/cms.ts DEFAULT_MENUS). */
export const MENUS = {
  'nav-': [
    { href: '/', en: 'Home', ar: 'الرئيسية' },
    { href: '/about', en: 'About MEKI', ar: 'عن MEKI' },
    { href: '/programs', en: 'Programs', ar: 'البرامج' },
    { href: '/give', en: 'Give', ar: 'تبرّع' },
    { href: '/faq', en: 'FAQ', ar: 'الأسئلة الشائعة' },
    { href: '/contact', en: 'Contact', ar: 'تواصل معنا' },
  ],
  'giving-': [
    { href: '/give', en: 'Give', ar: 'تبرّع' },
    { href: '/faq', en: 'FAQ', ar: 'الأسئلة الشائعة' },
  ],
};
export const isLegacyAnchor = (href) => typeof href === 'string' && href.trim().startsWith('#');

/** @param ctx { call, must, write, DRY, blank } */
export async function applySite(ctx) {
  const { call, must, write, DRY, blank } = ctx;
  const out = { menus: [], site: null };

  const home = must(await call('GET', '/admin/cms/pages/home'), 'home page');
  const footer = home.sections.find((s) => s.key === 'FOOTER');
  const footerCleanBefore = !!footer && footer.status === 'PUBLISHED' && !footer.hasUnpublishedChanges; // judged before this run writes
  if (!footer) out.menus.push({ missing: 'FOOTER section' });
  else {
    const changes = [];
    for (const [prefix, wanted] of Object.entries(MENUS)) {
      const items = (footer.items ?? []).filter((i) => (i.code ?? '').startsWith(prefix)).sort((a, b) => a.sortOrder - b.sortOrder);
      if (items.length && !items.every((i) => isLegacyAnchor(i.href))) { out.menus.push({ menu: prefix, state: 'kept (not the legacy anchors — editor-managed or already correct)' }); continue; }
      const used = (footer.items ?? []).map((i) => i.code);
      for (const [n, d] of wanted.entries()) {
        const body = { titleEn: d.en, titleAr: d.ar, href: d.href, isVisible: true };
        if (items[n]) { await write('PATCH', `/admin/cms/items/${items[n].id}`, body, `menu ${prefix}${n + 1}`); changes.push(`${prefix}${n + 1} → ${d.en} (${d.href})`); }
        else {
          let k = 1; while (used.includes(`${prefix}${k}`)) k++;
          used.push(`${prefix}${k}`);
          await write('POST', `/admin/cms/sections/${footer.id}/items`, { code: `${prefix}${k}`, sortOrder: (prefix === 'nav-' ? 10 : 100) + n, provenance: 'VERIFIED_SOURCE', ...body }, `menu add ${prefix}${k}`);
          changes.push(`add ${prefix}${k} → ${d.en} (${d.href})`);
        }
      }
      for (const extra of items.slice(wanted.length)) { await write('PATCH', `/admin/cms/items/${extra.id}`, { isVisible: false }, `hide ${extra.code}`); changes.push(`hide ${extra.code} (${extra.titleEn})`); }
      out.menus.push({ menu: prefix, state: 'aligned with the website navigation', changes: changes.length });
    }
    const clean = footerCleanBefore;
    let published = null;
    if (changes.length && clean && !DRY) {
      const r = await call('POST', `/admin/cms/sections/${footer.id}/publish`);
      if (r.status >= 300) throw new Error(`publish FOOTER: HTTP ${r.status} ${r.json?.error?.code ?? ''}`);
      published = r.revalidation ?? 'published';
    }
    out.menus.push({ changes, published, ...(DRY ? { wouldPublish: changes.length > 0 && clean } : {}), leftForEditor: changes.length > 0 && !clean });
  }

  const site = must(await call('GET', '/admin/settings/site'), 'site settings');
  const patch = {};
  if (blank(site.contactEmail)) patch.contactEmail = INQUIRIES_EMAIL;
  const stored = Array.isArray(site.socialLinks) ? site.socialLinks : [];
  const missing = NOV23.site.socialLinksConfirmed.filter((l) => !stored.some((s) => String(s?.network).toLowerCase() === l.network));
  if (missing.length) patch.socialLinks = [...stored, ...missing];
  if (Object.keys(patch).length) await write('PATCH', '/admin/settings/site', patch, 'site settings');
  out.site = { changes: Object.keys(patch), contactEmail: patch.contactEmail ? `set to ${INQUIRIES_EMAIL}` : `kept (${blank(site.contactEmail) ? 'empty' : 'editor value'})`, socialAdded: missing.map((l) => l.network) };
  return out;
}
