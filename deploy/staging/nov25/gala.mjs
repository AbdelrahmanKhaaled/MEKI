// MEKI final Gala content (25 Nov 2026) — module of the final sync runner (deploy/staging/apply-nov25-final-content.mjs).
// Everything goes through the audited admin API (never SQL) and follows the rules of apply-nov23-client-edits.mjs:
//  - values an administrator wrote are never replaced; empty slots are filled;
//  - a section is published only when this run created it, it was already published with no pending edits, or it is an
//    empty never-published seed shell / holds only what an earlier run put there (host photo awaiting publication);
//  - nothing is deleted. DRY runs write nothing (ctx.write is a no-op) and report what would happen.
// New here: host photo CONFIRMED + published (MEKI written approval, 25 Nov); hidden partner entries (Bokra, The Waterway:
// no logo, not visible, never published by this script); Gala inquiries e-mail; venue exterior on the arrival card.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const GALA_DATA = JSON.parse(readFileSync(join(HERE, 'gala.data.json'), 'utf8'));

/** @param ctx { call, must, write, DRY, blank, uploadMedia } */
export async function applyGala(ctx) {
  const { call, must, write, DRY, blank, uploadMedia } = ctx;
  const G = GALA_DATA;
  const out = { sections: [], assets: {}, eventStatus: null };

  const events = must(await call('GET', '/admin/events?pageSize=100'), 'events') ?? [];
  const ev = events.find((e) => e.slug === G.eventSlug);
  if (!ev) return { ...out, missingEvent: G.eventSlug };
  out.eventStatus = ev.status;

  // assets: reused by checksum; the host photo is stored with consent CONFIRMED
  const ids = {};
  for (const [k, spec] of Object.entries(G.assets)) {
    ids[k] = await uploadMedia(spec);
    out.assets[k] = DRY ? 'dry run' : 'in library';
    if (k === 'host' && ids[k] && !String(ids[k]).startsWith('(new')) {
      const m = must(await call('GET', `/admin/media/${ids[k]}`), 'host media');
      if (m?.consentStatus !== 'CONFIRMED') {
        await write('PATCH', `/admin/media/${ids[k]}`, { consentStatus: 'CONFIRMED' }, 'host consent');
        out.assets.hostConsentSetTo = 'CONFIRMED';
      }
    }
  }

  const page = must(await call('GET', `/admin/events/${ev.id}/page`), 'event page');
  const patchItem = (i, b, what) => write('PATCH', `/admin/events/${ev.id}/items/${i.id}`, b, what);
  const addItem = (s, b, what) => write('POST', `/admin/events/${ev.id}/sections/${s.id}/items`, b, what);

  const block = async (key, apply, { ours } = {}) => {
    let s = page.sections.find((x) => x.key === key);
    const created = !s;
    if (!s) s = DRY ? { id: '(new)', key, items: [], status: 'DRAFT' } : must(await call('POST', `/admin/events/${ev.id}/sections`, { key, provenance: 'VERIFIED_SOURCE' }), `create ${key}`);
    s.items ??= [];
    const cleanPublished = !created && s.status === 'PUBLISHED' && !s.hasUnpublishedChanges;
    const emptyShell = !created && !s.publishedAt && !s.mediaId && s.items.length === 0;
    const owned = !!ours && !created && !s.publishedAt && s.status !== 'PUBLISHED' && ours(s);
    const changes = [];
    await apply(s, changes);
    const eligible = changes.length > 0 && (created || cleanPublished || emptyShell || owned);
    let published = null;
    if (eligible && !DRY) {
      const r = await call('POST', `/admin/events/${ev.id}/sections/${s.id}/publish`);
      if (r.status >= 300) throw new Error(`publish ${key}: HTTP ${r.status} ${r.json?.error?.code ?? ''}`);
      published = r.revalidation ?? 'published';
    }
    out.sections.push({ key, created, changes, published, ...(DRY ? { wouldPublish: eligible } : {}), leftForEditor: changes.length > 0 && !eligible });
  };

  // Host: approval granted. Photo attached to item `host` and the section published (an editor's text/photo is kept).
  await block(
    'EVENT_SPEAKERS',
    async (s, ch) => {
      const host = s.items.find((i) => i.code === G.hostItem.code);
      if (!host) {
        await addItem(s, { code: 'host', mediaId: ids.host, provenance: 'VERIFIED_SOURCE' }, 'host item');
        ch.push('host photo');
      } else if (!host.mediaId) {
        await patchItem(host, { mediaId: ids.host, isVisible: true }, 'host photo');
        ch.push('host photo');
      } else if (host.isVisible === false) {
        await patchItem(host, { isVisible: true }, 'host visible');
        ch.push('host visible');
      }
      // photo attached by the 24 Nov run but never published: publish now that the approval exists
      if (!ch.length && host?.mediaId === ids.host && s.status !== 'PUBLISHED') ch.push('publish after approval');
    },
    { ours: (s) => s.items.length === 1 && s.items[0].code === G.hostItem.code && !s.items[0].titleEn && !s.mediaId },
  );

  // Partners: hidden, logo-less entries (partnerships not signed). They change nothing public.
  await block('EVENT_SPONSORSHIP', async (s, ch) => {
    for (const p of G.partners) {
      if (s.items.some((i) => i.code === p.code)) continue;
      await addItem(s, { code: p.code, titleEn: p.titleEn, isVisible: false, provenance: 'PROPOSED', sortOrder: p.sortOrder }, `partner ${p.code}`);
      ch.push(`partner ${p.code} (hidden, no logo)`);
    }
  });

  // Gala inquiries e-mail (EVENT_CONTACT item "email"); an administrator's own address is kept.
  await block('EVENT_CONTACT', async (s, ch) => {
    const mail = s.items.find((i) => i.code === 'email');
    const href = `mailto:${G.contactEmail}`;
    if (!mail) {
      await addItem(s, { code: 'email', href, provenance: 'VERIFIED_SOURCE', sortOrder: 10 }, 'contact email');
      ch.push('contact email');
    } else if (blank(mail.href)) {
      await patchItem(mail, { href, isVisible: true }, 'contact email');
      ch.push('contact email');
    }
  });

  // Venue exterior on the arrival card only (an exterior is never used for dinner / drinks / lamps / auction).
  await block('EVENT_HIGHLIGHTS', async (s, ch) => {
    const card = s.items.find((i) => i.code === G.cardImage.code);
    if (card && !card.mediaId) {
      await patchItem(card, { mediaId: ids[G.cardImage.asset] }, `card ${card.code} image`);
      ch.push(`card ${card.code} exterior photo`);
    }
  });
  return out;
}
