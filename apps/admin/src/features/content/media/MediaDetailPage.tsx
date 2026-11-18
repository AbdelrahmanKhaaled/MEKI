"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { ErrorState, WidgetSkeleton, WidgetState } from "@/components/common/States";
import { Bilingual, ContentGateNotice, ProvenanceBadge, ProvenanceNotice, SaveBar, Select, TextInput, Thumb, useContentError } from "@/components/content/ui";
import { ConfirmDialog, DateText, DetailGrid, Notice, PageHeader, Ref } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { AuditList } from "@/features/finance/shared";
import { FinancePage, useBackHref, useHref } from "@/features/finance/FinancePage";
import { useContentMutation, useMedia } from "@/hooks/useContentData";
import { useEntityAudit } from "@/hooks/useFinanceData";
import { useForm } from "@/hooks/useForm";
import { formatBytes, mediaDeleteGate } from "@/lib/content";
import { CONSENT_STATUSES, MEDIA_CATEGORIES, PROVENANCES, type MediaDetail } from "@/lib/content-schemas";
import { formatNumber } from "@/lib/format";
import * as svc from "@/services/content";

export function MediaDetailPage({ id }: { id: string }) {
  const { t } = useLocale();
  const href = useHref();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.website }, { label: t.content.media.title, href: href("/media") }, { label: t.content.common.details }]} anyOf={["media.read"]}>
      <Existing id={id} />
    </FinancePage>
  );
}

function Existing({ id }: { id: string }) {
  const q = useMedia(id);
  if (q.isPending) return <WidgetSkeleton rows={6} minH="min-h-80" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} minH="min-h-80" />;
  return <Detail key={q.data.id} media={q.data} />;
}

type Form = { altEn: string; altAr: string; captionEn: string; captionAr: string; credit: string; sourceFolder: string; category: string; consentStatus: string; provenance: string };
const toForm = (m: MediaDetail): Form => ({
  altEn: m.altEn ?? "", altAr: m.altAr ?? "", captionEn: m.captionEn ?? "", captionAr: m.captionAr ?? "", credit: m.credit ?? "", sourceFolder: m.sourceFolder ?? "",
  category: m.category, consentStatus: m.consentStatus, provenance: m.provenance,
});

function Detail({ media }: { media: MediaDetail }) {
  const { locale, t } = useLocale();
  const { can } = useAuth();
  const router = useRouter();
  const href = useHref();
  const backHref = useBackHref("/media");
  const errText = useContentError();
  const x = t.content.media;
  const c = t.content.common;
  const readOnly = !can("media.upload");
  const form = useForm<Form>(toForm(media));
  const v = form.values;
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  // PATCH /admin/media/:id: text fields are optional strings (an empty string clears them); enums always sent as-is
  const save = useContentMutation(() => svc.updateMedia(media.id, Object.fromEntries(form.dirty.map((k) => [k, v[k].trim()]))));
  const remove = useContentMutation(() => svc.deleteMedia(media.id));
  const del = mediaDeleteGate(media, can("media.delete"));
  const name = media.originalName ?? media.code ?? media.storageKey;
  const usage = Object.entries(media.usage).filter(([k, n]) => k !== "total" && n > 0);

  return (
    <>
      <PageHeader back={{ href: backHref, label: x.title }} title={<bdi className="break-all">{name}</bdi>} badges={<><ProvenanceBadge value={media.provenance} /><span className="rounded-full bg-bg px-2.5 py-1 text-xs font-bold text-body">{t.content.categories[media.category] ?? media.category}</span></>} />
      <ProvenanceNotice value={v.provenance} />
      {readOnly && <Notice>{c.readOnly}</Notice>}
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="min-w-0 space-y-4 xl:col-span-7">
          <Card labelledBy="mp-t">
            <CardHeader id="mp-t" title={x.cols.preview} />
            <Thumb media={media} className="max-h-[28rem] w-full !object-contain" />
          </Card>
          <Card labelledBy="mm-t">
            <CardHeader id="mm-t" title={c.details} />
            <div className="space-y-5">
              <Bilingual label={x.fields.alt} en={v.altEn} ar={v.altAr} onEn={(s) => form.set("altEn", s)} onAr={(s) => form.set("altAr", s)} disabled={readOnly} maxLength={300} />
              <Bilingual label={x.fields.caption} en={v.captionEn} ar={v.captionAr} onEn={(s) => form.set("captionEn", s)} onAr={(s) => form.set("captionAr", s)} multiline rows={2} disabled={readOnly} maxLength={2000} />
              <div className="grid gap-4 md:grid-cols-2">
                <TextInput label={x.fields.credit} value={v.credit} onChange={(s) => form.set("credit", s)} disabled={readOnly} maxLength={255} />
                <TextInput label={x.fields.sourceFolder} value={v.sourceFolder} onChange={(s) => form.set("sourceFolder", s)} disabled={readOnly} maxLength={255} />
                <Select label={x.fields.category} value={v.category} onChange={(s) => form.set("category", s)} disabled={readOnly} options={MEDIA_CATEGORIES.map((k) => ({ value: k, label: t.content.categories[k] }))} />
                <Select label={x.fields.consent} value={v.consentStatus} onChange={(s) => form.set("consentStatus", s)} disabled={readOnly} hint={x.consentHint} options={CONSENT_STATUSES.map((k) => ({ value: k, label: t.content.consent[k] }))} />
                <Select label={c.provenance} value={v.provenance} onChange={(s) => form.set("provenance", s)} disabled={readOnly} hint={c.provenanceChangeHint} options={PROVENANCES.map((p) => ({ value: p, label: t.content.provenance[p] }))} />
              </div>
            </div>
          </Card>
        </div>
        <div className="min-w-0 space-y-4 xl:col-span-5">
          <Card labelledBy="mf-t">
            <CardHeader id="mf-t" title={x.fields.file} />
            <DetailGrid
              cols={2}
              items={[
                [x.fields.file, <bdi key="n" className="break-all">{name}</bdi>],
                [x.fields.type, <Ref key="t">{media.mimeType}</Ref>],
                [x.fields.size, <span key="s" className="num">{formatBytes(media.sizeBytes)}</span>],
                [x.fields.dimensions, media.width && media.height ? <span key="d" className="num" dir="ltr">{media.width} × {media.height}</span> : "—"],
                [c.created, <DateText key="c" value={media.createdAt} />],
                [x.fields.url, <Ref key="u">{media.url}</Ref>],
              ]}
            />
          </Card>
          <Card labelledBy="mu-t">
            <CardHeader id="mu-t" title={x.usage} />
            {usage.length === 0 ? (
              <p className="text-sm text-muted">{x.usageNone}</p>
            ) : (
              <ul className="space-y-1.5 text-sm" data-testid="media-usage">
                {usage.map(([k, n]) => (
                  <li key={k} className="flex justify-between gap-2"><span>{x.usageKeys[k] ?? k}</span><span className="num font-bold">{formatNumber(n, locale)}</span></li>
                ))}
              </ul>
            )}
          </Card>
          <Card labelledBy="md-t">
            <CardHeader id="md-t" title={c.delete} />
            <button type="button" className="btn-admin btn-ghost text-danger" disabled={!del.allowed} onClick={() => setConfirm(true)}><Trash2 className="size-4" aria-hidden="true" /> {c.delete}</button>
            <ContentGateNotice gate={del} />
          </Card>
          <Audit id={media.id} />
        </div>
      </div>
      {!readOnly && (
        <SaveBar
          dirty={form.dirty.length}
          busy={save.isPending}
          onDiscard={form.discard}
          onSave={() => { setMessage(null); save.mutate(undefined, { onSuccess: (m) => { form.reset(toForm({ ...media, ...m })); setMessage(c.saved); } }); }}
          message={message}
          error={save.isError ? errText(save.error) : null}
        />
      )}
      {confirm && (
        <ConfirmDialog open danger title={x.deleteTitle} confirmLabel={c.delete} busy={remove.isPending} error={remove.isError ? errText(remove.error) : null} onClose={() => { remove.reset(); setConfirm(false); }} onConfirm={() => remove.mutate(undefined, { onSuccess: () => router.replace(href("/media")) })}>
          <p>{x.deleteBody}</p>
        </ConfirmDialog>
      )}
    </>
  );
}

function Audit({ id }: { id: string }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const allowed = can("audit.read");
  const q = useEntityAudit("MediaAsset", id, allowed);
  return (
    <Card labelledBy="ma-t">
      <CardHeader id="ma-t" title={t.content.common.audit} />
      <WidgetState q={q} unavailable={!allowed ? { text: t.content.common.auditLocked, locked: true } : false} minH="min-h-24">
        <AuditList items={q.data ?? []} emptyText={t.content.common.auditEmpty} />
      </WidgetState>
    </Card>
  );
}
