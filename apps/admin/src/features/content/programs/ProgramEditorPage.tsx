"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { EmptyState, ErrorState, WidgetSkeleton, WidgetState } from "@/components/common/States";
import { CoverField, GalleryField } from "@/components/content/media";
import { Bilingual, Checkbox, ContentGateNotice, ContentStatusBadge, ProvenanceBadge, ProvenanceNotice, SaveBar, Select, TextArea, TextInput, useContentError } from "@/components/content/ui";
import { ConfirmDialog, DateText, Notice, PageHeader, Ref } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { AuditList } from "@/features/finance/shared";
import { FinancePage, useBackHref, useHref } from "@/features/finance/FinancePage";
import { useContentMutation, useLiveCampaigns, useProgramme } from "@/hooks/useContentData";
import { useEntityAudit } from "@/hooks/useFinanceData";
import { useForm } from "@/hooks/useForm";
import { codeError, programmeDeleteGate, programmePublishGate, programmeUnpublishGate, slugError } from "@/lib/content";
import { PROGRAMME_KINDS, PROVENANCES, type Media, type Programme } from "@/lib/content-schemas";
import { fill } from "@/lib/i18n";
import * as svc from "@/services/content";

export function ProgramEditorPage({ id }: { id?: string }) {
  const { t } = useLocale();
  const href = useHref();
  const x = t.content.programs;
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.programs }, { label: x.title, href: href("/programs") }, { label: id ? t.content.common.edit : x.newTitle }]} anyOf={id ? ["programmes.read"] : ["programmes.manage"]}>
      {id ? <Existing id={id} /> : <Editor programme={null} />}
    </FinancePage>
  );
}

function Existing({ id }: { id: string }) {
  const q = useProgramme(id);
  if (q.isPending) return <WidgetSkeleton rows={8} minH="min-h-96" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} minH="min-h-80" />;
  return <Editor key={q.data.id} programme={q.data} />;
}

type Form = {
  code: string; slug: string; kind: string; number: string; icon: string; sortOrder: string; isFeatured: boolean; provenance: string; sourceRef: string;
  nameEn: string; nameAr: string; altNameEn: string; altNameAr: string; shortDescEn: string; shortDescAr: string; mandateEn: string; mandateAr: string;
  descriptionEn: string; descriptionAr: string; focusAreasEn: string; focusAreasAr: string; seoTitleEn: string; seoTitleAr: string; seoDescriptionEn: string; seoDescriptionAr: string;
  cover: Media | null;
};

const toForm = (p: Programme | null): Form => ({
  code: p?.code ?? "", slug: p?.slug ?? "", kind: p?.kind ?? "PROGRAMME", number: p?.number?.toString() ?? "", icon: p?.icon ?? "", sortOrder: String(p?.sortOrder ?? 0), isFeatured: p?.isFeatured ?? false,
  provenance: p?.provenance ?? "PROPOSED", sourceRef: p?.sourceRef ?? "", nameEn: p?.nameEn ?? "", nameAr: p?.nameAr ?? "", altNameEn: p?.altNameEn ?? "", altNameAr: p?.altNameAr ?? "",
  shortDescEn: p?.shortDescEn ?? "", shortDescAr: p?.shortDescAr ?? "", mandateEn: p?.mandateEn ?? "", mandateAr: p?.mandateAr ?? "", descriptionEn: p?.descriptionEn ?? "", descriptionAr: p?.descriptionAr ?? "",
  focusAreasEn: (p?.focusAreasEn ?? []).join("\n"), focusAreasAr: (p?.focusAreasAr ?? []).join("\n"), seoTitleEn: p?.seoTitleEn ?? "", seoTitleAr: p?.seoTitleAr ?? "",
  seoDescriptionEn: p?.seoDescriptionEn ?? "", seoDescriptionAr: p?.seoDescriptionAr ?? "", cover: p?.coverMedia ?? null,
});

/** Form field → API value. Optional text columns are cleared with null (the DTOs accept null for optional fields). */
function toApi(k: keyof Form, f: Form): unknown {
  const v = f[k];
  switch (k) {
    case "cover": return f.cover?.id ?? null;
    case "number": return f.number.trim() ? Number(f.number) : null;
    case "sortOrder": return Number(f.sortOrder || 0);
    case "isFeatured": return f.isFeatured;
    case "focusAreasEn":
    case "focusAreasAr": {
      const lines = (v as string).split("\n").map((s) => s.trim()).filter(Boolean);
      return lines.length ? lines : null;
    }
    case "code": case "slug": case "kind": case "provenance": case "nameEn": return (v as string).trim();
    default: return (v as string).trim() || null;
  }
}
const apiKey = (k: keyof Form) => (k === "cover" ? "coverMediaId" : k);

function Editor({ programme }: { programme: Programme | null }) {
  const { locale, t } = useLocale();
  const { can } = useAuth();
  const router = useRouter();
  const href = useHref();
  const backHref = useBackHref("/programs");
  const errText = useContentError();
  const x = t.content.programs;
  const c = t.content.common;
  const isNew = !programme;
  const canManage = can("programmes.manage");
  const canPublish = can("programmes.publish");
  const readOnly = !canManage;
  const form = useForm<Form>(toForm(programme));
  const v = form.values;
  const [message, setMessage] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const errors = {
    nameEn: v.nameEn.trim().length < 2 ? t.content.errors.required : null,
    code: isNew ? (v.code ? (codeError(v.code, 40) ? t.content.errors.codeFormat : null) : t.content.errors.required) : null,
    slug: slugError(v.slug.trim()) ? t.content.errors.slugFormat : null,
    number: v.number && !/^\d{1,6}$/.test(v.number) ? t.content.errors.amountFormat : null,
  };
  const invalid = Object.values(errors).some(Boolean);

  const save = useContentMutation(async () => {
    if (isNew) {
      const body: Record<string, unknown> = {};
      for (const k of Object.keys(v) as (keyof Form)[]) {
        const val = toApi(k, v);
        if (val !== null && val !== "" && !(k === "slug" && !v.slug.trim())) body[apiKey(k)] = val;
      }
      return svc.createProgramme(body);
    }
    const body: Record<string, unknown> = {};
    for (const k of form.dirty) body[apiKey(k)] = toApi(k, v);
    return svc.updateProgramme(programme.id, body);
  });

  const onSave = () => {
    setTouched(true);
    if (invalid) return;
    setMessage(null);
    save.mutate(undefined, {
      onSuccess: (p) => {
        if (isNew) router.replace(href(`/programs/${p.id}`));
        else {
          form.reset(toForm(p));
          setMessage(c.saved);
        }
      },
    });
  };

  const name = programme ? (locale === "ar" && programme.nameAr ? programme.nameAr : programme.nameEn) : x.newTitle;
  const official = programme?.kind === "PROGRAMME" && programme.provenance === "VERIFIED_SOURCE";
  const show = (e: string | null) => (touched || !isNew ? e : null);

  return (
    <>
      <PageHeader
        back={{ href: backHref, label: x.title }}
        title={<bdi>{name}</bdi>}
        badges={programme ? <><ContentStatusBadge status={programme.status} /><ProvenanceBadge value={programme.provenance} /><Ref className="text-muted">{programme.code}</Ref></> : undefined}
      />
      <ProvenanceNotice value={v.provenance} />
      {official && <Notice tone="gold">{x.officialNote}</Notice>}
      {readOnly && <Notice>{c.readOnly}</Notice>}

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="min-w-0 space-y-4 xl:col-span-8">
          <Card labelledBy="pc-t">
            <CardHeader id="pc-t" title={t.content.campaigns.tabs.basic} />
            <div className="space-y-5">
              <Bilingual label={x.fields.name} en={v.nameEn} ar={v.nameAr} onEn={(s) => form.set("nameEn", s)} onAr={(s) => form.set("nameAr", s)} requiredEn errorEn={show(errors.nameEn)} disabled={readOnly} maxLength={255} />
              <Bilingual label={x.fields.altName} en={v.altNameEn} ar={v.altNameAr} onEn={(s) => form.set("altNameEn", s)} onAr={(s) => form.set("altNameAr", s)} disabled={readOnly} maxLength={255} />
              <Bilingual label={x.fields.shortDesc} en={v.shortDescEn} ar={v.shortDescAr} onEn={(s) => form.set("shortDescEn", s)} onAr={(s) => form.set("shortDescAr", s)} multiline rows={3} disabled={readOnly} maxLength={2000} />
              <Bilingual label={x.fields.mandate} en={v.mandateEn} ar={v.mandateAr} onEn={(s) => form.set("mandateEn", s)} onAr={(s) => form.set("mandateAr", s)} multiline rows={3} disabled={readOnly} maxLength={5000} />
              <Bilingual label={x.fields.description} en={v.descriptionEn} ar={v.descriptionAr} onEn={(s) => form.set("descriptionEn", s)} onAr={(s) => form.set("descriptionAr", s)} multiline rows={6} disabled={readOnly} maxLength={20000} />
              <Bilingual label={x.fields.focusAreas} en={v.focusAreasEn} ar={v.focusAreasAr} onEn={(s) => form.set("focusAreasEn", s)} onAr={(s) => form.set("focusAreasAr", s)} multiline rows={4} disabled={readOnly} />
            </div>
          </Card>

          <Card labelledBy="pm-t">
            <CardHeader id="pm-t" title={t.content.campaigns.tabs.media} />
            <div className="space-y-6">
              <CoverField media={v.cover} onChange={(m) => form.set("cover", m)} disabled={readOnly || !can("media.read")} defaultCategory="PROGRAMME" />
              {programme && <ProgrammeGallery programme={programme} disabled={readOnly || !can("media.read")} />}
            </div>
          </Card>

          <Card labelledBy="ps-t">
            <CardHeader id="ps-t" title={c.seo} />
            <div className="space-y-5">
              <Bilingual label={c.seoTitle} en={v.seoTitleEn} ar={v.seoTitleAr} onEn={(s) => form.set("seoTitleEn", s)} onAr={(s) => form.set("seoTitleAr", s)} disabled={readOnly} maxLength={255} />
              <Bilingual label={c.seoDescription} en={v.seoDescriptionEn} ar={v.seoDescriptionAr} onEn={(s) => form.set("seoDescriptionEn", s)} onAr={(s) => form.set("seoDescriptionAr", s)} multiline rows={2} disabled={readOnly} maxLength={1000} />
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-4 xl:col-span-4">
          {programme && <Lifecycle programme={programme} canPublish={canPublish} canManage={canManage} />}
          <Card labelledBy="pd-t">
            <CardHeader id="pd-t" title={c.details} />
            <div className="space-y-4">
              <TextInput label={c.code} value={v.code} onChange={(s) => form.set("code", s.toUpperCase())} disabled={!isNew || readOnly} required={isNew} error={show(errors.code)} dir="ltr" maxLength={40} placeholder="PRG-10" />
              <TextInput label={c.slug} value={v.slug} onChange={(s) => form.set("slug", s)} hint={c.slugHint} error={errors.slug} disabled={readOnly} dir="ltr" maxLength={100} />
              <Select label={c.kind} value={v.kind} onChange={(s) => form.set("kind", s)} disabled={readOnly} options={PROGRAMME_KINDS.map((k) => ({ value: k, label: t.content.kinds[k] }))} />
              <div className="grid grid-cols-2 gap-3">
                <TextInput label={x.fields.number} value={v.number} onChange={(s) => form.set("number", s)} error={errors.number} disabled={readOnly} dir="ltr" inputMode="numeric" />
                <TextInput label={c.sortOrder} value={v.sortOrder} onChange={(s) => form.set("sortOrder", s.replace(/\D/g, ""))} disabled={readOnly} dir="ltr" inputMode="numeric" />
              </div>
              <TextInput label={x.fields.icon} value={v.icon} onChange={(s) => form.set("icon", s.toLowerCase())} disabled={readOnly} dir="ltr" maxLength={40} />
              <Checkbox label={c.featured} checked={v.isFeatured} onChange={(b) => form.set("isFeatured", b)} disabled={readOnly} />
              <Select label={c.provenance} value={v.provenance} onChange={(s) => form.set("provenance", s)} disabled={readOnly} hint={c.provenanceChangeHint} options={PROVENANCES.map((p) => ({ value: p, label: t.content.provenance[p] }))} />
              <TextArea label={c.sourceRef} value={v.sourceRef} onChange={(s) => form.set("sourceRef", s)} hint={c.sourceRefHint} disabled={readOnly} rows={2} maxLength={255} />
              {programme && <p className="text-xs text-muted">{c.updated}: <DateText value={programme.updatedAt} /></p>}
            </div>
          </Card>
          {programme && <Causes programme={programme} />}
          {programme && <Audit id={programme.id} />}
        </div>
      </div>

      {!readOnly && <SaveBar dirty={isNew ? (form.dirty.length || 1) : form.dirty.length} busy={save.isPending} onSave={onSave} onDiscard={form.discard} disabled={touched && invalid} message={message} error={save.isError ? errText(save.error) : null} />}
    </>
  );
}

function ProgrammeGallery({ programme, disabled }: { programme: Programme; disabled: boolean }) {
  const { t } = useLocale();
  const errText = useContentError();
  const m = useContentMutation((ids: string[]) => svc.setProgrammeGallery(programme.id, ids));
  return <GalleryField items={programme.gallery.map((g) => g.media)} onSave={(ids) => m.mutate(ids)} busy={m.isPending} disabled={disabled} error={m.isError ? errText(m.error) : null} message={m.isSuccess ? t.content.common.saved : null} defaultCategory="PROGRAMME" />;
}

function Lifecycle({ programme, canPublish, canManage }: { programme: Programme; canPublish: boolean; canManage: boolean }) {
  const { locale, t } = useLocale();
  const { can } = useAuth();
  const router = useRouter();
  const href = useHref();
  const errText = useContentError();
  const x = t.content.programs;
  const c = t.content.common;
  const canSeeCampaigns = can("campaigns.read");
  // the unpublish guard needs to count live campaigns; without campaigns.read the API decides alone
  const live = useLiveCampaigns(programme.id, canSeeCampaigns && programme.status === "PUBLISHED");
  const pub = programmePublishGate(programme, canPublish);
  const unpub = programmeUnpublishGate(programme, canSeeCampaigns ? (live.data ?? null) : 0, canPublish);
  const del = programmeDeleteGate(programme, canManage);
  const [dialog, setDialog] = useState<null | "publish" | "unpublish" | "delete">(null);
  const toggle = useContentMutation((publish: boolean) => svc.publishProgramme(programme.id, publish));
  const remove = useContentMutation(() => svc.deleteProgramme(programme.id));
  const name = locale === "ar" && programme.nameAr ? programme.nameAr : programme.nameEn;
  const busy = toggle.isPending || remove.isPending;
  const err = toggle.isError ? errText(toggle.error) : remove.isError ? errText(remove.error) : null;
  const close = () => { toggle.reset(); remove.reset(); setDialog(null); };
  return (
    <Card labelledBy="lc-t">
      <CardHeader id="lc-t" title={c.lifecycle} right={<ContentStatusBadge status={programme.status} />} />
      <div className="space-y-3">
        {programme.status !== "PUBLISHED" ? (
          <div>
            <button type="button" className="btn-admin btn-primary w-full justify-center" disabled={!pub.allowed} onClick={() => setDialog("publish")}><Eye className="size-4" aria-hidden="true" /> {c.publish}</button>
            <ContentGateNotice gate={pub} />
          </div>
        ) : (
          <div>
            <button type="button" className="btn-admin btn-ghost w-full justify-center" disabled={!unpub.allowed} onClick={() => setDialog("unpublish")}><EyeOff className="size-4" aria-hidden="true" /> {c.unpublish}</button>
            <ContentGateNotice gate={unpub} />
          </div>
        )}
        <div>
          <button type="button" className="btn-admin btn-ghost w-full justify-center text-danger" disabled={!del.allowed} onClick={() => setDialog("delete")}><Trash2 className="size-4" aria-hidden="true" /> {c.delete}</button>
          <ContentGateNotice gate={del} />
        </div>
        {programme.publishedAt && <p className="text-xs text-muted">{c.publish}: <DateText value={programme.publishedAt} /></p>}
      </div>
      {(dialog === "publish" || dialog === "unpublish") && (
        <ConfirmDialog open title={fill(dialog === "publish" ? x.publishTitle : x.unpublishTitle, { name })} confirmLabel={dialog === "publish" ? c.publish : c.unpublish} busy={busy} error={err} onClose={close}
          onConfirm={() => toggle.mutate(dialog === "publish", { onSuccess: close })}>
          <p>{dialog === "publish" ? x.publishBody : x.unpublishBody}</p>
        </ConfirmDialog>
      )}
      {dialog === "delete" && (
        <ConfirmDialog open danger title={fill(x.deleteTitle, { name })} confirmLabel={c.delete} busy={busy} error={err} onClose={close} onConfirm={() => remove.mutate(undefined, { onSuccess: () => router.replace(href("/programs")) })}>
          <p>{x.deleteBody}</p>
        </ConfirmDialog>
      )}
    </Card>
  );
}

function Causes({ programme }: { programme: Programme }) {
  const { locale, t } = useLocale();
  const { can } = useAuth();
  const href = useHref();
  const x = t.content.programs;
  return (
    <Card labelledBy="pcz-t">
      <CardHeader id="pcz-t" title={x.causesTitle} right={can("programmes.manage") ? <Link href={href(`/causes/new?programmeId=${programme.id}`)} className="btn-admin btn-ghost !min-h-9"><Plus className="size-4" aria-hidden="true" /> {x.newCause}</Link> : undefined} />
      {programme.projects.length === 0 ? (
        <EmptyState text={x.causesEmpty} minH="min-h-20" />
      ) : (
        <ul className="space-y-2">
          {programme.projects.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-line p-3">
              <Link href={href(`/causes/${p.id}`)} className="min-w-0 truncate text-sm font-bold text-ink hover:text-meki-green-dark hover:underline"><bdi>{locale === "ar" && p.nameAr ? p.nameAr : p.nameEn}</bdi></Link>
              <ProvenanceBadge value={p.provenance} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Audit({ id }: { id: string }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const allowed = can("audit.read");
  const q = useEntityAudit("Programme", id, allowed);
  return (
    <Card labelledBy="pa-t">
      <CardHeader id="pa-t" title={t.content.common.audit} />
      <WidgetState q={q} unavailable={!allowed ? { text: t.content.common.auditLocked, locked: true } : false} minH="min-h-24">
        <AuditList items={q.data ?? []} emptyText={t.content.common.auditEmpty} />
      </WidgetState>
    </Card>
  );
}

