"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FileText, Globe, Plus, Trash2, Undo2, Upload } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { CoverField } from "@/components/content/media";
import { Bilingual, Checkbox, TextInput, useContentError } from "@/components/content/ui";
import { ConfirmDialog, Notice } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Section, SectionItem } from "@/lib/cms-schemas";
import type { Media } from "@/lib/content-schemas";
import type { GalaEvent } from "@/lib/gala-schemas";
import { fill } from "@/lib/i18n";
import * as svc from "@/services/gala-page";
import { getMedia, uploadMedia } from "@/services/content";
import { ApiError } from "@/lib/api";

/**
 * MEKI client edits (22 Nov 2026, Gala items 14–23) — the Gala page's photo slots and links, managed through the existing event
 * landing-page sections. Each block is a separate section with its own Save + Publish (events.manage / events.publish); nothing
 * is public until the section is published AND the event itself is public. The website ignores incomplete items (no title or
 * no image) and anything marked DEMO, so an unfinished slot never shows a broken or empty element.
 *
 * Only AUTHENTIC, MEKI-approved material belongs here: venue photos of 583 Park Avenue, a photo of Raya Abirached approved by her
 * management, real photos of the evening's elements, the official sponsorship packages file/page, official partner logos, and a
 * confirmed contact email. Never stock images, generated images or placeholders.
 */
type ItemField = "title" | "text" | "media" | "href";
type Block = {
  key: string;
  /** i18n block key */
  name: "hero" | "purpose" | "experience" | "host" | "sponsorship" | "contact";
  /** section image (hero) */
  sectionMedia?: boolean;
  /** section link + label (sponsorship "Sponsor now") */
  sectionLink?: boolean;
  /** section document (sponsorship packages PDF, 24 Nov 2026) — stored as the section media reference */
  sectionDocument?: boolean;
  /** fixed item codes (created on demand), or undefined = free list */
  codes?: string[];
  /** free list that also offers one-click entries for known codes (partners: Bokra, The Waterway); new entries start hidden */
  suggestedCodes?: string[];
  fields: ItemField[];
};

/** Partner entries MEKI named (25 Nov 2026). The partnerships are NOT officially signed: entries start hidden with no logo. */
export const PARTNER_PRESETS: Record<string, string> = { "partner-bokra": "Bokra", "partner-waterway": "The Waterway" };

export const GALA_PAGE_BLOCKS: Block[] = [
  { key: "EVENT_HERO", name: "hero", sectionMedia: true, fields: [] },
  { key: "EVENT_ABOUT", name: "purpose", fields: ["title", "text", "media"] },
  { key: "EVENT_HIGHLIGHTS", name: "experience", codes: ["black-tie", "dinner", "bar", "lamps", "auction"], fields: ["title", "text", "media"] },
  { key: "EVENT_SPEAKERS", name: "host", codes: ["host"], fields: ["title", "text", "media"] },
  { key: "EVENT_SPONSORSHIP", name: "sponsorship", sectionLink: true, sectionDocument: true, suggestedCodes: ["partner-bokra", "partner-waterway"], fields: ["title", "href", "media"] },
  { key: "EVENT_CONTACT", name: "contact", codes: ["email"], fields: ["href"] },
];

const HTTPS = /^https:\/\/[^\s"'<>]+$/;
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i;

export function GalaPageCard({ ev }: { ev: GalaEvent }) {
  const { t } = useLocale();
  const x = t.gala.settings.galaPage;
  const key = ["gala", "page-sections", ev.id];
  const q = useQuery({ queryKey: key, queryFn: () => svc.getEventPage(ev.id) });
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ["gala", "venue-photos", ev.id] });
  };
  return (
    <Card labelledBy="gs-page">
      <CardHeader id="gs-page" title={x.title} subtitle={x.subtitle} />
      <WidgetState q={q} minH="min-h-32">
        {q.data && (
          <div className="space-y-4" data-testid="gala-page-admin">
            <Notice tone="gold"><p>{x.rules}</p></Notice>
            {GALA_PAGE_BLOCKS.map((b) => (
              <BlockEditor key={b.key} ev={ev} block={b} section={q.data.sections.find((s) => s.key === b.key) ?? null} onChange={refresh} />
            ))}
          </div>
        )}
      </WidgetState>
    </Card>
  );
}

function BlockEditor({ ev, block, section, onChange }: { ev: GalaEvent; block: Block; section: Section | null; onChange: () => void }) {
  const { t } = useLocale();
  const x = t.gala.settings.galaPage;
  const bx = x.blocks[block.name];
  const { can } = useAuth();
  const errText = useContentError();
  const canManage = can("events.manage");
  const [confirmPublish, setConfirmPublish] = useState(false);
  const create = useMutation({ mutationFn: () => svc.createSection(ev.id, block.key), onSuccess: onChange });
  const add = useMutation({ mutationFn: (code?: string) => svc.addItem(ev.id, section!.id, { ...(code ? { code } : {}), ...(PARTNER_PRESETS[code ?? ""] ? { titleEn: PARTNER_PRESETS[code!] } : {}), ...(block.name === "sponsorship" ? { isVisible: false } : {}) }), onSuccess: onChange });
  const toggle = useMutation({ mutationFn: (publish: boolean) => svc.setSectionStatus(ev.id, section!.id, publish), onSuccess: () => { setConfirmPublish(false); onChange(); } });
  const published = section?.status === "PUBLISHED";
  const items = [...(section?.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const missingCodes = (block.codes ?? block.suggestedCodes ?? []).filter((c) => !items.some((i) => i.code === c));
  return (
    <section className="rounded-xl border border-line p-4" aria-label={bx.title} data-testid={`gala-block-${block.name}`}>
      <h3 className="text-sm font-bold text-ink">{bx.title}</h3>
      <p className="mb-3 text-xs text-muted">{bx.hint}</p>
      {!section ? (
        canManage ? (
          <button type="button" className="btn-admin btn-ghost" disabled={create.isPending} onClick={() => create.mutate()}><Plus className="size-4" aria-hidden="true" /> {x.create}</button>
        ) : (
          <p className="text-sm text-muted">{x.none}</p>
        )
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            {fill(x.status, { status: section.status })}
            {section.hasUnpublishedChanges && <> · <span className="text-warn">{x.pending}</span></>}
          </p>
          {(block.sectionMedia || block.sectionLink || block.sectionDocument) && <SectionFields key={[section.mediaId, section.ctaPrimaryHref, section.ctaPrimaryLabelEn, section.ctaPrimaryLabelAr].join("|")} ev={ev} block={block} s={section} onChange={onChange} />}
          {block.fields.length > 0 && (
            <ul className="space-y-3">
              {items.map((it) => <ItemRow key={[it.id, it.titleEn, it.textEn, it.mediaId, it.href, it.isVisible].join("|")} ev={ev} block={block} item={it} onChange={onChange} />)}
            </ul>
          )}
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            {canManage && block.fields.length > 0 && !block.codes && <button type="button" className="btn-admin btn-ghost" disabled={add.isPending} onClick={() => add.mutate(undefined)}><Plus className="size-4" aria-hidden="true" /> {x.add}</button>}
            {canManage && missingCodes.map((c) => (
              <button key={c} type="button" className="btn-admin btn-ghost" disabled={add.isPending} onClick={() => add.mutate(c)}><Plus className="size-4" aria-hidden="true" /> {fill(x.addCode, { code: (x.codes as Record<string, string>)[c] ?? c })}</button>
            ))}
            {can("events.publish") && (!published || section.hasUnpublishedChanges) && <button type="button" className="btn-admin btn-primary" onClick={() => setConfirmPublish(true)}><Globe className="size-4" aria-hidden="true" /> {x.publish}</button>}
            {can("events.publish") && published && <button type="button" className="btn-admin btn-ghost text-danger" disabled={toggle.isPending} onClick={() => toggle.mutate(false)}><Undo2 className="size-4" aria-hidden="true" /> {x.unpublish}</button>}
          </div>
          {confirmPublish && (
            <ConfirmDialog open title={x.publish} confirmLabel={x.publish} busy={toggle.isPending} error={toggle.isError ? errText(toggle.error) : null} onClose={() => { toggle.reset(); setConfirmPublish(false); }} onConfirm={() => toggle.mutate(true)}>
              <p>{x.publishBody}</p>
            </ConfirmDialog>
          )}
        </div>
      )}
      {(create.isError || add.isError || (toggle.isError && !confirmPublish)) && <p className="mt-2 text-xs text-danger" role="alert">{errText(create.error ?? add.error ?? toggle.error)}</p>}
    </section>
  );
}

function SectionFields({ ev, block, s, onChange }: { ev: GalaEvent; block: Block; s: Section; onChange: () => void }) {
  const { t } = useLocale();
  const x = t.gala.settings.galaPage;
  const { can } = useAuth();
  const errText = useContentError();
  const canManage = can("events.manage");
  const init = { media: (s.media as Media | null) ?? null, href: s.ctaPrimaryHref ?? "", labelEn: s.ctaPrimaryLabelEn ?? "", labelAr: s.ctaPrimaryLabelAr ?? "" };
  const [v, setV] = useState(init);
  const hrefOk = !v.href.trim() || HTTPS.test(v.href.trim());
  const dirty = (v.media?.id ?? null) !== (init.media?.id ?? null) || v.href !== init.href || v.labelEn !== init.labelEn || v.labelAr !== init.labelAr;
  const save = useMutation({
    mutationFn: () =>
      svc.updateSection(ev.id, s.id, {
        ...(block.sectionMedia || block.sectionDocument ? { mediaId: v.media?.id ?? null } : {}),
        // The DTO validates links (SAFE_HREF); an empty link clears it (null) and the website shows no button.
        ...(block.sectionLink ? { ctaPrimaryHref: v.href.trim() || null, ctaPrimaryLabelEn: v.labelEn.trim(), ctaPrimaryLabelAr: v.labelAr.trim() } : {}),
      }),
    onSuccess: onChange,
  });
  return (
    <div className="space-y-3 rounded-lg bg-bg/60 p-3">
      {block.sectionDocument && <DocumentField media={v.media} onChange={(m) => setV({ ...v, media: m })} disabled={!canManage || !can("media.upload")} />}
      {block.sectionMedia && <CoverField media={v.media} onChange={(m) => setV({ ...v, media: m })} disabled={!canManage || !can("media.read")} defaultCategory="GALLERY" />}
      {block.sectionLink && (
        <>
          <TextInput label={x.sponsorUrl} value={v.href} onChange={(h) => setV({ ...v, href: h })} dir="ltr" disabled={!canManage} maxLength={500} placeholder="https://" error={hrefOk ? null : x.httpsOnly} hint={x.sponsorUrlHint} />
          <Bilingual label={x.sponsorLabel} en={v.labelEn} ar={v.labelAr} onEn={(l) => setV({ ...v, labelEn: l })} onAr={(l) => setV({ ...v, labelAr: l })} disabled={!canManage} maxLength={120} />
        </>
      )}
      {canManage && (
        <button type="button" className="btn-admin btn-primary !min-h-9" disabled={!dirty || !hrefOk || save.isPending} onClick={() => save.mutate()}>{x.save}</button>
      )}
      {save.isError && <p className="text-xs text-danger" role="alert">{errText(save.error)}</p>}
    </div>
  );
}

function ItemRow({ ev, block, item, onChange }: { ev: GalaEvent; block: Block; item: SectionItem; onChange: () => void }) {
  const { t } = useLocale();
  const x = t.gala.settings.galaPage;
  const bx = x.blocks[block.name] as { title: string; hint: string; itemTitle?: string; itemText?: string; itemHref?: string };
  const { can } = useAuth();
  const errText = useContentError();
  const canManage = can("events.manage");
  const isEmail = block.name === "contact";
  const init = {
    titleEn: item.titleEn ?? "", titleAr: item.titleAr ?? "", textEn: item.textEn ?? "", textAr: item.textAr ?? "", isVisible: item.isVisible, media: item.media as Media | null,
    href: isEmail ? (item.href ?? "").replace(/^mailto:/, "") : item.href ?? "",
  };
  const [v, setV] = useState(init);
  const [confirm, setConfirm] = useState(false);
  const hrefOk = !v.href.trim() || (isEmail ? EMAIL.test(v.href.trim()) : HTTPS.test(v.href.trim()));
  const dirty = (Object.keys(init) as (keyof typeof init)[]).some((k) => (k === "media" ? (v.media?.id ?? null) !== (init.media?.id ?? null) : v[k] !== init[k]));
  const save = useMutation({
    mutationFn: () =>
      svc.updateItem(ev.id, item.id, {
        ...(block.fields.includes("title") ? { titleEn: v.titleEn.trim(), titleAr: v.titleAr.trim() || null } : {}),
        ...(block.fields.includes("text") ? { textEn: v.textEn.trim() || null, textAr: v.textAr.trim() || null } : {}),
        ...(block.fields.includes("media") ? { mediaId: v.media?.id ?? null } : {}),
        ...(block.fields.includes("href") ? { href: v.href.trim() ? (isEmail ? `mailto:${v.href.trim()}` : v.href.trim()) : null } : {}),
        isVisible: v.isVisible,
      }),
    onSuccess: onChange,
  });
  const remove = useMutation({ mutationFn: () => svc.deleteItem(ev.id, item.id), onSuccess: () => { setConfirm(false); onChange(); } });
  const codeLabel = item.code ? (x.codes as Record<string, string>)[item.code] ?? item.code : null;
  return (
    <li className="rounded-lg border border-line/80 p-3" data-testid="gala-page-item" data-code={item.code ?? ""}>
      {codeLabel && <p className="mb-2 text-xs font-bold text-muted">{codeLabel}</p>}
      {block.name === "sponsorship" && (
        <p className={`mb-2 text-xs ${init.media && init.isVisible ? "text-ok" : "text-warn"}`} data-testid="gala-partner-state">
          {!init.isVisible ? x.partnerHidden : !init.media ? x.partnerNoLogo : x.partnerReady}
        </p>
      )}
      <div className="space-y-3">
        {block.fields.includes("title") && <Bilingual label={bx.itemTitle ?? x.itemTitle} en={v.titleEn} ar={v.titleAr} onEn={(s) => setV({ ...v, titleEn: s })} onAr={(s) => setV({ ...v, titleAr: s })} disabled={!canManage} maxLength={200} />}
        {block.fields.includes("text") && <Bilingual label={bx.itemText ?? x.itemText} en={v.textEn} ar={v.textAr} onEn={(s) => setV({ ...v, textEn: s })} onAr={(s) => setV({ ...v, textAr: s })} multiline rows={2} disabled={!canManage} maxLength={500} />}
        {block.fields.includes("href") && (
          <TextInput label={bx.itemHref ?? x.itemHref} value={v.href} onChange={(h) => setV({ ...v, href: h })} dir="ltr" disabled={!canManage} maxLength={300} type={isEmail ? "email" : "url"} error={hrefOk ? null : isEmail ? x.emailInvalid : x.httpsOnly} />
        )}
        {block.fields.includes("media") && <CoverField media={v.media} onChange={(m) => setV({ ...v, media: m })} disabled={!canManage || !can("media.read")} defaultCategory="GALLERY" />}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Checkbox label={x.visible} checked={v.isVisible} onChange={(b) => setV({ ...v, isVisible: b })} disabled={!canManage} />
          {canManage && (
            <span className="flex gap-2">
              {!block.codes && <button type="button" className="btn-admin btn-ghost !min-h-9 text-danger" onClick={() => setConfirm(true)}><Trash2 className="size-4" aria-hidden="true" /> {x.remove}</button>}
              <button type="button" className="btn-admin btn-primary !min-h-9" disabled={!dirty || !hrefOk || save.isPending} onClick={() => save.mutate()}>{x.save}</button>
            </span>
          )}
        </div>
        {save.isError && <p className="text-xs text-danger" role="alert">{errText(save.error)}</p>}
      </div>
      {confirm && (
        <ConfirmDialog open danger title={x.removeTitle} confirmLabel={x.remove} busy={remove.isPending} error={remove.isError ? errText(remove.error) : null} onClose={() => { remove.reset(); setConfirm(false); }} onConfirm={() => remove.mutate()}>
          <p>{x.removeBody}</p>
        </ConfirmDialog>
      )}
    </li>
  );
}

/**
 * Sponsorship packages PDF (MEKI, 24 Nov 2026). Upload goes through the existing Media Library endpoint (PDF detected from its
 * bytes; stored unmodified in the persistent upload storage, so the link survives releases). Replacing = upload the new PDF and
 * Save; the previous file stays in the Media Library for the record. Nothing is public until the section is published.
 */
function DocumentField({ media, onChange, disabled }: { media: Media | null; onChange: (m: Media | null) => void; disabled?: boolean }) {
  const { t } = useLocale();
  const x = t.gala.settings.galaPage;
  const errText = useContentError();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPdf = media?.mimeType === "application/pdf";
  const upload = async (file: File) => {
    setError(null);
    if (file.type && file.type !== "application/pdf") return setError(x.pdfOnly);
    setBusy(true);
    try {
      onChange(await uploadMedia(file, { category: "OTHER", consentStatus: "CONFIRMED", provenance: "VERIFIED_SOURCE", captionEn: file.name }));
    } catch (e) {
      // the same PDF is already in the library → use that entry (uploads are de-duplicated by checksum)
      const dupId = e instanceof ApiError && e.code === "DUPLICATE_MEDIA" ? (e.details as { id?: string } | undefined)?.id : undefined;
      if (dupId) onChange(await getMedia(dupId).catch(() => null));
      else setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2" data-testid="gala-sponsorship-pdf">
      <p className="text-sm font-bold text-ink">{x.pdfLabel}</p>
      {isPdf && media ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <FileText className="size-4 text-meki-green" aria-hidden="true" />
          <a href={media.url} target="_blank" rel="noopener noreferrer" className="font-bold text-meki-green-dark underline">{media.originalName ?? "PDF"}</a>
          <span className="text-muted">· {Math.round(media.sizeBytes / 1024)} KB</span>
        </p>
      ) : (
        <p className="text-sm text-muted">{x.pdfNone}</p>
      )}
      {!disabled && (
        <div className="flex flex-wrap gap-2">
          <label className={`btn-admin btn-ghost cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
            <Upload className="size-4" aria-hidden="true" /> {isPdf ? x.pdfReplace : x.pdfUpload}
            <input type="file" accept="application/pdf" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
          </label>
          {isPdf && <button type="button" className="btn-admin btn-ghost text-danger" onClick={() => onChange(null)}><Trash2 className="size-4" aria-hidden="true" /> {x.pdfRemove}</button>}
        </div>
      )}
      <p className="text-xs text-muted">{x.pdfHint}</p>
      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}
