"use client";

/**
 * Reusable CMS section editor (Phase 6D). One card per section: bilingual fields, short labels, item lists, image,
 * visibility, provenance, save (PATCH of changed fields only), publish/unpublish and a preview that compares the working
 * copy with the live (published) snapshot. Used by the Homepage editor, the page block editor and (for items) Menus.
 *
 * Preservation rules: only fields the editor changed are sent; labels are sent as the full stored map with the edited keys
 * merged in (unknown keys kept); items are edited one by one (unknown items are never touched).
 */
import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Save, Trash2, Upload } from "lucide-react";
import { Card } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { CoverField } from "@/components/content/media";
import { HeroImagesField } from "@/components/cms/HeroImagesField";
import { Bilingual, Checkbox, ContentGateNotice, ProvenanceBadge, Select, Thumb, useContentError } from "@/components/content/ui";
import { ConfirmDialog, DateText, Notice } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useCmsMutation } from "@/hooks/useCmsData";
import { useForm } from "@/hooks/useForm";
import type { RevalidationOutcome } from "@/lib/api";
import { HERO_ALT_LABELS, HERO_SECONDARY_ITEM_CODE } from "@/lib/hero-images";
import { liveAr, liveEn } from "@/lib/i18n-live";
import { isDirtySection, itemsFor, listCountState, mergeLabels, nextCode, PROGRAM_SLUGS, programFromHref, programHref, sectionPublishGate, sectionUnpublishGate, type ListRule, type SectionDef, type SectionField } from "@/lib/cms";
import type { Section, SectionItem } from "@/lib/cms-schemas";
import type { Media } from "@/lib/content-schemas";
import { formatDate } from "@/lib/format";
import { fill } from "@/lib/i18n";
import * as svc from "@/services/cms";

type TextField = Exclude<SectionField, "media">;
type Form = Record<string, string | boolean | Media | null>;

const textFields = (def: SectionDef) => def.fields.filter((f): f is TextField => f !== "media");

function toForm(s: Section, def: SectionDef): Form {
  const f: Form = { isVisible: s.isVisible, media: s.media };
  for (const k of textFields(def)) {
    f[`${k}En`] = (s[`${k}En` as keyof Section] as string | null) ?? "";
    f[`${k}Ar`] = (s[`${k}Ar` as keyof Section] as string | null) ?? "";
  }
  for (const l of [...def.labels, ...heroAltLabels(def)]) {
    f[`labelEn.${l}`] = s.labelsEn?.[l] ?? "";
    f[`labelAr.${l}`] = s.labelsAr?.[l] ?? "";
  }
  if (def.heroImages) f.secondaryMedia = heroSecondaryItem(s)?.media ?? null;
  return f;
}

const heroAltLabels = (def: SectionDef) => (def.heroImages ? Object.values(HERO_ALT_LABELS) : []);
const heroSecondaryItem = (s: Section) => s.items.find((i) => i.code === HERO_SECONDARY_ITEM_CODE);

/** Message after a publish/unpublish, worded from the website's confirmed refresh outcome (never "refreshed" unless confirmed). */
function outcomeMessage(e: typeof liveEn.editor, publish: boolean, o: RevalidationOutcome | null) {
  if (publish) return o === "revalidated" ? e.publishedLive : o === "pending" ? e.publishedPending : e.publishedDisabled;
  return o === "revalidated" ? e.unpublishedLive : o === "pending" ? e.unpublishedPending : e.unpublishedDisabled;
}

export function useSectionName() {
  const { t } = useLocale();
  return (key: string) => t.cms.sections[key] ?? key;
}

export function SectionEditor({ section, def, canManage, canPublish, anchorId }: { section: Section; def: SectionDef; canManage: boolean; canPublish: boolean; anchorId?: string }) {
  const { locale, t } = useLocale();
  const { can } = useAuth();
  const href = (p: string) => `/${locale}${p}`;
  const errText = useContentError();
  const c = t.cms.common;
  const name = useSectionName()(section.key);
  const form = useForm<Form>(toForm(section, def));
  const v = form.values;
  const [message, setMessage] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "publish" | "unpublish" | "savePublish">(null);
  const live = (locale === "ar" ? liveAr : liveEn).editor;
  const [preview, setPreview] = useState(false);
  const label = (f: string) => t.cms.fieldOverrides[`${section.key}.${f}`] ?? t.cms.fields[f] ?? f;

  /** Saves the changed fields (working copy only — nothing becomes public). The Hero secondary image is its own item. */
  const saveChanges = async () => {
    const body: Record<string, unknown> = {};
    let secondary: { mediaId: string | null } | null = null;
    const labelEditsEn: Record<string, string> = {};
    const labelEditsAr: Record<string, string> = {};
    for (const k of form.dirty) {
      if (k === "secondaryMedia") secondary = { mediaId: (v.secondaryMedia as Media | null)?.id ?? null };
      else if (k === "media") body.mediaId = (v.media as Media | null)?.id ?? null;
      else if (k === "isVisible") body.isVisible = v.isVisible;
      else if (k.startsWith("labelEn.")) labelEditsEn[k.slice(8)] = v[k] as string;
      else if (k.startsWith("labelAr.")) labelEditsAr[k.slice(8)] = v[k] as string;
      else body[k] = v[k] as string; // the DTO accepts "" to clear a text field
    }
    if (Object.keys(labelEditsEn).length) body.labelsEn = mergeLabels(section.labelsEn, labelEditsEn);
    if (Object.keys(labelEditsAr).length) body.labelsAr = mergeLabels(section.labelsAr, labelEditsAr);
    if (secondary) {
      const item = heroSecondaryItem(section);
      if (item) await svc.updateItem(item.id, { ...secondary, isVisible: true });
      else if (secondary.mediaId) await svc.createItem(section.id, { code: HERO_SECONDARY_ITEM_CODE, mediaId: secondary.mediaId, isVisible: true, titleEn: "", provenance: "PROPOSED" });
    }
    // PATCH even when only the secondary image changed: returns the refreshed section (with its items)
    return svc.updateSection(section.id, body);
  };
  const save = useCmsMutation(saveChanges);
  /** Save & publish (publishers only): one deliberate action. The API still checks content.manage AND content.publish. */
  const savePublish = useCmsMutation(async () => {
    if (form.dirty.length) await saveChanges();
    return svc.publishSectionOutcome(section.id, true);
  });
  const toggle = useCmsMutation((publish: boolean) => svc.publishSectionOutcome(section.id, publish));
  const pubG = sectionPublishGate(section, canPublish);
  const unpubG = sectionUnpublishGate(section, canPublish);
  const unknownLabels = Object.keys(section.labelsEn ?? {}).filter((k) => !def.labels.includes(k) && !heroAltLabels(def).includes(k));
  const close = () => { toggle.reset(); savePublish.reset(); setDialog(null); };

  return (
    <Card id={anchorId} labelledBy={`sec-${section.id}`} className="scroll-mt-24">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`sec-${section.id}`} className="card-title">{name}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2.5 py-1 font-bold ${section.status === "PUBLISHED" ? "bg-ok/10 text-ok" : "bg-bg text-body"}`}>{section.status === "PUBLISHED" ? c.published : c.notPublished}</span>
            {isDirtySection(section) && <span className="rounded-full bg-warn/10 px-2.5 py-1 font-bold text-warn" data-testid="dirty-badge">{c.unpublishedChanges}</span>}
            {!section.isVisible && <span className="rounded-full bg-bg px-2.5 py-1 font-bold text-muted">{c.hidden}</span>}
            <ProvenanceBadge value={section.provenance} />
            {section.publishedAt && <span className="text-muted">{fill(c.publishedAt, { date: formatDate(section.publishedAt, locale, true) })}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-admin btn-ghost !min-h-9" aria-pressed={preview} onClick={() => setPreview((p) => !p)}><Eye className="size-4" aria-hidden="true" /> {c.preview}</button>
          {section.status === "PUBLISHED" && <button type="button" className="btn-admin btn-ghost !min-h-9" disabled={!unpubG.allowed} onClick={() => setDialog("unpublish")}><EyeOff className="size-4" aria-hidden="true" /> {c.unpublishSection}</button>}
          <button type="button" className="btn-admin btn-primary !min-h-9" disabled={!pubG.allowed || !isDirtySection(section) || form.dirty.length > 0} onClick={() => setDialog("publish")} title={form.dirty.length ? t.content.campaigns.unsavedNotice : undefined}>
            <Upload className="size-4" aria-hidden="true" /> {c.publishSection}
          </button>
        </div>
      </header>
      <ContentGateNotice gate={pubG} title={t.cms.gate.title} />

      {preview && <ContentPreview section={section} def={def} />}

      <div className="space-y-5">
        {textFields(def).map((f) => (
          <Bilingual key={f} label={label(f)} en={v[`${f}En`] as string} ar={v[`${f}Ar`] as string} onEn={(s) => form.set(`${f}En`, s)} onAr={(s) => form.set(`${f}Ar`, s)} multiline={f === "body"} rows={f === "body" ? 4 : undefined} disabled={!canManage} />
        ))}
        {def.fields.includes("media") && <CoverField media={v.media as Media | null} onChange={(m) => form.set("media", m)} disabled={!canManage || !can("media.read")} />}
        {def.heroImages && (
          <HeroImagesField
            main={{ media: v.media as Media | null, altEn: v[`labelEn.${HERO_ALT_LABELS.main}`] as string, altAr: v[`labelAr.${HERO_ALT_LABELS.main}`] as string }}
            secondary={{ media: v.secondaryMedia as Media | null, altEn: v[`labelEn.${HERO_ALT_LABELS.secondary}`] as string, altAr: v[`labelAr.${HERO_ALT_LABELS.secondary}`] as string }}
            onChange={(slot, p) => {
              if (p.media !== undefined) form.set(slot === "main" ? "media" : "secondaryMedia", p.media);
              if (p.altEn !== undefined) form.set(`labelEn.${HERO_ALT_LABELS[slot]}`, p.altEn);
              if (p.altAr !== undefined) form.set(`labelAr.${HERO_ALT_LABELS[slot]}`, p.altAr);
            }}
            disabled={!canManage || !can("media.read")}
          />
        )}
        {def.labels.length > 0 && (
          <details className="rounded-xl border border-line p-4" open={def.labels.length <= 3}>
            <summary className="cursor-pointer text-sm font-bold text-ink">{c.labels} ({def.labels.length})</summary>
            <div className="mt-4 space-y-4">
              {def.labels.map((l) => (
                <Bilingual key={l} label={l} en={v[`labelEn.${l}`] as string} ar={v[`labelAr.${l}`] as string} onEn={(s) => form.set(`labelEn.${l}`, s)} onAr={(s) => form.set(`labelAr.${l}`, s)} disabled={!canManage} maxLength={500} />
              ))}
              {unknownLabels.length > 0 && <p className="text-xs text-muted">{c.unknownLabels}: <bdi dir="ltr">{unknownLabels.join(", ")}</bdi></p>}
            </div>
          </details>
        )}
        {def.hideable ? (
          <Checkbox label={c.visible} checked={v.isVisible as boolean} onChange={(b) => form.set("isVisible", b)} disabled={!canManage} />
        ) : (
          <p className="text-xs text-muted">{c.structural}</p>
        )}
        {canManage && (form.dirty.length > 0 || message || save.isError) && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-bg p-3" role="region" aria-label={`${t.content.common.save} — ${name}`}>
            <span className="text-sm" aria-live="polite">
              {save.isError ? <span className="text-danger" role="alert">{errText(save.error)}</span> : form.dirty.length ? <span className="font-bold text-warn">{fill(t.content.common.unsaved, { n: form.dirty.length })}</span> : <span className="text-ok" data-testid="section-message">{message}</span>}
              {form.dirty.length > 0 && !canPublish && <span className="block text-xs text-muted">{live.draftOnly}</span>}
            </span>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-admin btn-ghost !min-h-9" disabled={!form.dirty.length || save.isPending} onClick={form.discard}>{t.content.common.discard}</button>
              <button type="button" className={`btn-admin !min-h-9 ${canPublish ? "btn-ghost" : "btn-primary"}`} disabled={!form.dirty.length || save.isPending || savePublish.isPending} onClick={() => { setMessage(null); save.mutate(undefined, { onSuccess: (s) => { form.reset(toForm(s, def)); setMessage(live.savedDraft); } }); }} data-testid="section-save">
                <Save className="size-4" aria-hidden="true" /> {save.isPending ? t.content.common.saving : t.content.common.save}
              </button>
              {canPublish && (
                <button type="button" className="btn-admin btn-primary !min-h-9" disabled={!form.dirty.length || !pubG.allowed || save.isPending || savePublish.isPending} onClick={() => { setMessage(null); setDialog("savePublish"); }} data-testid="section-save-publish">
                  <Upload className="size-4" aria-hidden="true" /> {live.savePublish}
                </button>
              )}
            </div>
          </div>
        )}
        {def.lists.map((rule) =>
          rule.managedAt ? (
            <Notice key={rule.name}>
              {t.cms.lists[rule.name]} — <Link href={href(rule.managedAt)} className="font-bold text-meki-green-dark underline">{c.manage}</Link>
            </Notice>
          ) : (
            <ItemsEditor key={rule.name} section={section} rule={rule} canManage={canManage} />
          ),
        )}
        {def.data && (
          <Notice>
            {fill(c.fromModule, { module: t.cms.modules[def.data.module] })} — <Link href={href(def.data.href)} className="font-bold text-meki-green-dark underline">{c.manage}</Link>
          </Notice>
        )}
      </div>

      {dialog === "savePublish" && (
        <ConfirmDialog
          open
          title={fill(live.savePublishTitle, { name })}
          confirmLabel={live.savePublish}
          busy={savePublish.isPending}
          error={savePublish.isError ? errText(savePublish.error) : null}
          onClose={close}
          onConfirm={() => savePublish.mutate(undefined, { onSuccess: (r) => { form.reset(toForm(r.data, def)); setMessage(outcomeMessage(live, true, r.revalidation)); close(); } })}
        >
          <p>{live.savePublishBody}</p>
        </ConfirmDialog>
      )}
      {(dialog === "publish" || dialog === "unpublish") && (
        <ConfirmDialog
          open
          title={fill(dialog === "publish" ? c.publishTitle : c.unpublishTitle, { name })}
          confirmLabel={dialog === "publish" ? c.publishSection : c.unpublishSection}
          busy={toggle.isPending}
          error={toggle.isError ? errText(toggle.error) : null}
          onClose={close}
          onConfirm={() => { const publish = dialog === "publish"; toggle.mutate(publish, { onSuccess: (r) => { setMessage(outcomeMessage(live, publish, r.revalidation)); close(); } }); }}
        >
          <p>{dialog === "publish" ? c.publishBody : c.unpublishBody}</p>
        </ConfirmDialog>
      )}
    </Card>
  );
}

// ───────────── item lists ─────────────

function ItemsEditor({ section, rule, canManage }: { section: Section; rule: ListRule; canManage: boolean }) {
  const { t } = useLocale();
  const errText = useContentError();
  const c = t.cms.common;
  const items = itemsFor(rule, section.items);
  const count = listCountState(rule, items);
  const add = useCmsMutation(() => svc.createItem(section.id, { ...(rule.prefix ? { code: nextCode(rule.prefix, section.items) } : {}), titleEn: "", provenance: section.provenance === "DEMO" ? "DEMO" : "PROPOSED" }));
  const reorder = useCmsMutation((ids: string[]) => svc.reorderItems(section.id, ids));
  const canAdd = canManage && !rule.codes;
  /** The API needs every item of the section; only this list's positions change. */
  const move = (i: number, d: -1 | 1) => {
    const all = [...section.items].sort((a, b) => a.sortOrder - b.sortOrder);
    const mine = [...items];
    [mine[i], mine[i + d]] = [mine[i + d], mine[i]];
    let k = 0;
    const ids = all.map((it) => (items.some((m) => m.id === it.id) ? mine[k++].id : it.id));
    reorder.mutate(ids);
  };
  return (
    <section className="rounded-xl border border-line p-4" aria-label={t.cms.lists[rule.name]}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">{t.cms.lists[rule.name]}</h3>
        {canAdd && <button type="button" className="btn-admin btn-ghost !min-h-9" disabled={add.isPending} onClick={() => add.mutate(undefined)}><Plus className="size-4" aria-hidden="true" /> {c.addItem}</button>}
      </div>
      {rule.fixed !== undefined && (
        <p className={`mb-3 rounded-lg p-2 text-xs ${count.ok ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`} data-testid={`count-${rule.name}`}>
          {fill(count.ok ? c.countOk : c.countBad, { n: count.visible, fixed: rule.fixed })}
        </p>
      )}
      {(add.isError || reorder.isError) && <p className="mb-2 text-xs text-danger" role="alert">{errText(add.error ?? reorder.error)}</p>}
      <ol className="space-y-3">
        {items.map((it, i) => (
          <ItemRow key={it.id} item={it} n={i + 1} rule={rule} sectionKey={section.key} canManage={canManage} first={i === 0} last={i === items.length - 1} onMove={(d) => move(i, d)} moving={reorder.isPending} />
        ))}
      </ol>
    </section>
  );
}

function ItemRow({ item, n, rule, sectionKey, canManage, first, last, onMove, moving }: { item: SectionItem; n: number; rule: ListRule; sectionKey: string; canManage: boolean; first: boolean; last: boolean; onMove: (d: -1 | 1) => void; moving: boolean }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const errText = useContentError();
  const c = t.cms.common;
  const form = useForm({ titleEn: item.titleEn ?? "", titleAr: item.titleAr ?? "", textEn: item.textEn ?? "", textAr: item.textAr ?? "", isVisible: item.isVisible, media: item.media as Media | null, program: programFromHref(item.href) });
  const v = form.values;
  const [confirm, setConfirm] = useState(false);
  const save = useCmsMutation(() => {
    const b: Record<string, unknown> = {};
    for (const k of form.dirty) {
      if (k === "media") b.mediaId = v.media?.id ?? null;
      else if (k === "program") b.href = programHref(v.program);
      else b[k] = v[k];
    }
    return svc.updateItem(item.id, b);
  });
  const remove = useCmsMutation(() => svc.deleteItem(item.id));
  const label = (f: string) => t.cms.fieldOverrides[`${sectionKey}.${f}`] ?? t.cms.fields[f];
  return (
    <li className={`rounded-lg border border-line/80 p-3 ${!v.isVisible ? "bg-bg/60" : ""}`} data-code={item.code ?? ""}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-muted">{fill(c.item, { n })}{item.code ? <> · <bdi dir="ltr">{item.code}</bdi></> : null} {item.provenance === "DEMO" && <ProvenanceBadge value="DEMO" />}</span>
        {canManage && (
          <span className="flex items-center gap-1">
            {!rule.codes && <button type="button" className="rounded p-1 hover:bg-bg disabled:opacity-30" disabled={first || moving} onClick={() => onMove(-1)} aria-label={c.moveUp}><ArrowUp className="size-4" aria-hidden="true" /></button>}
            {!rule.codes && <button type="button" className="rounded p-1 hover:bg-bg disabled:opacity-30" disabled={last || moving} onClick={() => onMove(1)} aria-label={c.moveDown}><ArrowDown className="size-4" aria-hidden="true" /></button>}
            {!rule.codes && <button type="button" className="rounded p-1 text-danger hover:bg-bg" onClick={() => setConfirm(true)} aria-label={c.removeItem}><Trash2 className="size-4" aria-hidden="true" /></button>}
          </span>
        )}
      </div>
      <div className="space-y-3">
        {rule.fields.includes("title") && <Bilingual label={label("itemTitle")} en={v.titleEn} ar={v.titleAr} onEn={(s) => form.set("titleEn", s)} onAr={(s) => form.set("titleAr", s)} disabled={!canManage} maxLength={500} />}
        {rule.fields.includes("text") && <Bilingual label={label("itemText")} en={v.textEn} ar={v.textAr} onEn={(s) => form.set("textEn", s)} onAr={(s) => form.set("textAr", s)} multiline rows={2} disabled={!canManage} maxLength={5000} />}
        {rule.fields.includes("program") && (
          <Select label={label("itemProgram")} value={v.program} onChange={(s) => form.set("program", s)} disabled={!canManage} emptyLabel={t.cms.common.noProgram} options={PROGRAM_SLUGS.map((s) => ({ value: s, label: s }))} hint={t.cms.common.programHint} />
        )}
        {rule.fields.includes("title") && rule.fields.includes("text") && rule.fields.includes("program") && v.titleEn.trim() && (
          <p className="text-xs text-muted">{fill(t.cms.common.captionPreview, { caption: v.textEn.trim() ? `${v.titleEn.trim()} – ${v.textEn.trim()}` : v.titleEn.trim() })}</p>
        )}
        {rule.fields.includes("media") && <CoverField media={v.media} onChange={(m) => form.set("media", m)} disabled={!canManage || !can("media.read")} defaultCategory="GALLERY" />}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Checkbox label={c.visible} checked={v.isVisible} onChange={(b) => form.set("isVisible", b)} disabled={!canManage} />
          {canManage && form.dirty.length > 0 && (
            <span className="flex gap-2">
              <button type="button" className="btn-admin btn-ghost !min-h-9" onClick={form.discard}>{t.content.common.discard}</button>
              <button type="button" className="btn-admin btn-primary !min-h-9" disabled={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: (r) => form.reset({ titleEn: r.titleEn ?? "", titleAr: r.titleAr ?? "", textEn: r.textEn ?? "", textAr: r.textAr ?? "", isVisible: r.isVisible, media: v.media, program: programFromHref(r.href) }) })}>{save.isPending ? t.content.common.saving : c.saveItem}</button>
            </span>
          )}
        </div>
        {save.isError && <p className="text-xs text-danger" role="alert">{errText(save.error)}</p>}
        {save.isSuccess && !form.dirty.length && <p className="text-xs text-ok">{c.itemSaved}</p>}
      </div>
      {confirm && (
        <ConfirmDialog open danger title={c.confirmRemoveItem} confirmLabel={c.removeItem} busy={remove.isPending} error={remove.isError ? errText(remove.error) : null} onClose={() => { remove.reset(); setConfirm(false); }} onConfirm={() => remove.mutate(undefined, { onSuccess: () => setConfirm(false) })}>
          <p>{c.confirmRemoveItemBody}</p>
        </ConfirmDialog>
      )}
    </li>
  );
}

// ───────────── preview ─────────────

type Snap = Record<string, unknown> & { items?: Record<string, unknown>[] };

/** Side-by-side: working copy (not public yet) and the live snapshot the public API serves, in the chosen language. */
export function ContentPreview({ section, def }: { section: Section; def: SectionDef }) {
  const { t, locale } = useLocale();
  const c = t.cms.common;
  const [lang, setLang] = useState<"En" | "Ar">(locale === "ar" ? "Ar" : "En");
  const draft: Snap = { ...section, items: section.items.filter((i) => i.isVisible) as unknown as Record<string, unknown>[] };
  const live = section.publishedData as Snap | null;
  const render = (s: Snap | null) =>
    !s ? (
      <p className="text-sm text-muted">{c.noLive}</p>
    ) : (
      <div dir={lang === "Ar" ? "rtl" : "ltr"} lang={lang === "Ar" ? "ar" : "en"} className="space-y-2">
        {s.isVisible === false && <p className="text-xs font-bold text-muted">{c.hidden}</p>}
        {textFields(def).map((f) => {
          const val = s[`${f}${lang}`];
          return typeof val === "string" && val.trim() ? (
            <p key={f} className={f === "title" ? "font-serif text-xl text-deep-green" : f === "eyebrow" ? "text-xs font-bold uppercase tracking-wide text-gold-text" : "whitespace-pre-line text-sm text-body"}>{val}</p>
          ) : null;
        })}
        {(s.items ?? []).length > 0 && (
          <ul className="list-disc space-y-1 ps-5 text-sm text-body">
            {(s.items ?? []).map((i, n) => <li key={String(i.id ?? n)}>{String(i[`title${lang}`] ?? i[`text${lang}`] ?? "")}</li>)}
          </ul>
        )}
      </div>
    );
  return (
    <div className="mb-5 rounded-xl border border-line bg-bg/50 p-4" data-testid="content-preview">
      <div className="mb-3 flex justify-end">
        <div className="flex rounded-lg border border-line bg-white p-0.5 text-xs" role="group" aria-label={c.preview}>
          {(["En", "Ar"] as const).map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} className={`rounded px-2 py-1 font-bold ${lang === l ? "bg-deep-green text-white" : "text-body"}`}>{l === "En" ? "EN" : "AR"}</button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div><p className="mb-2 text-xs font-bold text-warn">{c.previewDraft}</p>{render(draft)}</div>
        <div><p className="mb-2 text-xs font-bold text-ok">{c.previewLive}</p>{render(live)}</div>
      </div>
      {def.heroImages && <HeroImagesPreview section={section} live={live} />}
      {section.updatedAt && <p className="mt-3 text-xs text-muted">{t.content.common.updated}: <DateText value={section.updatedAt} /></p>}
    </div>
  );
}


/** Hero images in the preview: the DRAFT images (admin-only preview) and whether each matches what visitors see now. */
function HeroImagesPreview({ section, live }: { section: Section; live: Snap | null }) {
  const { locale } = useLocale();
  const x = (locale === "ar" ? liveAr : liveEn).hero;
  const liveMain = (live?.media as { id?: string } | null | undefined)?.id ?? null;
  const liveSecond = ((live?.items ?? []).find((i) => i.code === HERO_SECONDARY_ITEM_CODE)?.media as { id?: string } | null | undefined)?.id ?? null;
  const draftSecond = heroSecondaryItem(section);
  const rows = [
    { label: x.main, media: section.media as Media | null, same: (section.media?.id ?? null) === liveMain, round: "rounded-t-full" },
    { label: x.secondary, media: (draftSecond?.isVisible ? draftSecond.media : null) as Media | null, same: ((draftSecond?.isVisible ? draftSecond.media?.id : null) ?? null) === liveSecond, round: "rounded-full" },
  ];
  return (
    <div className="mt-4 border-t border-line pt-3" data-testid="hero-images-preview">
      <p className="mb-2 text-xs font-bold text-warn">{x.previewDraft}</p>
      <div className="flex flex-wrap gap-4">
        {rows.map((r) => (
          <figure key={r.label} className="flex items-center gap-3">
            {r.media ? <Thumb media={r.media} className={`size-16 ${r.round}`} /> : <span className={`grid size-16 place-items-center border border-dashed border-line bg-white p-1 text-center text-[0.6rem] text-muted ${r.round}`}>{x.defaultImage}</span>}
            <figcaption className="text-xs">
              <span className="block font-bold text-ink">{r.label}</span>
              <span className={r.same ? "text-ok" : "text-warn"}>{r.same ? x.previewSameLive : x.previewDiffers}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
