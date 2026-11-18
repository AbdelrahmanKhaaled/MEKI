"use client";

/** Page title, SEO, share image and page-level publish/unpublish — shared by the Homepage and the page editor. */
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { CoverField } from "@/components/content/media";
import { Bilingual, ContentGateNotice, ContentStatusBadge, ProvenanceBadge, useContentError } from "@/components/content/ui";
import { ConfirmDialog, DateText } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useCmsMutation } from "@/hooks/useCmsData";
import { useForm } from "@/hooks/useForm";
import { pagePublishGate } from "@/lib/cms";
import type { PageDetail } from "@/lib/cms-schemas";
import type { Media } from "@/lib/content-schemas";
import { fill } from "@/lib/i18n";
import * as svc from "@/services/cms";

const toForm = (p: PageDetail) => ({
  titleEn: p.titleEn, titleAr: p.titleAr ?? "", seoTitleEn: p.seoTitleEn ?? "", seoTitleAr: p.seoTitleAr ?? "", seoDescriptionEn: p.seoDescriptionEn ?? "", seoDescriptionAr: p.seoDescriptionAr ?? "", og: p.ogImage as Media | null,
});

export function PageSettingsCard({ page }: { page: PageDetail }) {
  const { locale, t } = useLocale();
  const { can } = useAuth();
  const errText = useContentError();
  const x = t.cms.pages;
  const canManage = can("content.manage");
  const form = useForm(toForm(page));
  const v = form.values;
  const [msg, setMsg] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "publish" | "unpublish">(null);
  const save = useCmsMutation(() => {
    const b: Record<string, unknown> = {};
    for (const k of form.dirty) b[k === "og" ? "ogImageId" : k] = k === "og" ? (v.og?.id ?? null) : v[k];
    return svc.updatePage(page.slug, b);
  });
  const toggle = useCmsMutation((publish: boolean) => svc.setPageStatus(page.slug, publish));
  const pub = pagePublishGate(page, can("content.publish"));
  const name = locale === "ar" && page.titleAr ? page.titleAr : page.titleEn;
  const close = () => { toggle.reset(); setDialog(null); };
  return (
    <Card labelledBy="ps-t">
      <CardHeader id="ps-t" title={x.pageStatus} right={<span className="flex gap-2"><ContentStatusBadge status={page.status} /><ProvenanceBadge value={page.provenance} /></span>} />
      <div className="space-y-4">
        <Bilingual label={t.content.campaigns.fields.title} en={v.titleEn} ar={v.titleAr} onEn={(s) => form.set("titleEn", s)} onAr={(s) => form.set("titleAr", s)} requiredEn disabled={!canManage} maxLength={255} />
        <Bilingual label={t.content.common.seoTitle} en={v.seoTitleEn} ar={v.seoTitleAr} onEn={(s) => form.set("seoTitleEn", s)} onAr={(s) => form.set("seoTitleAr", s)} disabled={!canManage} maxLength={255} />
        <Bilingual label={t.content.common.seoDescription} en={v.seoDescriptionEn} ar={v.seoDescriptionAr} onEn={(s) => form.set("seoDescriptionEn", s)} onAr={(s) => form.set("seoDescriptionAr", s)} multiline rows={2} disabled={!canManage} maxLength={1000} />
        <CoverField media={v.og} onChange={(m) => form.set("og", m)} disabled={!canManage || !can("media.read")} />
        <p className="text-xs text-muted">{x.ogImage} · {t.content.common.updated}: <DateText value={page.updatedAt} /></p>
        {canManage && form.dirty.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bg p-3">
            <span className="text-sm font-bold text-warn">{fill(t.content.common.unsaved, { n: form.dirty.length })}</span>
            <span className="flex gap-2">
              <button type="button" className="btn-admin btn-ghost !min-h-9" onClick={form.discard}>{t.content.common.discard}</button>
              <button type="button" className="btn-admin btn-primary !min-h-9" disabled={save.isPending || !v.titleEn.trim()} onClick={() => { setMsg(null); save.mutate(undefined, { onSuccess: (p) => { form.reset(toForm(p)); setMsg(t.content.common.saved); } }); }}>{save.isPending ? t.content.common.saving : t.content.common.save}</button>
            </span>
          </div>
        )}
        {save.isError && <p className="text-sm text-danger" role="alert">{errText(save.error)}</p>}
        {msg && !form.dirty.length && <p className="text-sm text-ok" role="status">{msg}</p>}
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          {page.status === "PUBLISHED" ? (
            <button type="button" className="btn-admin btn-ghost" disabled={!can("content.publish")} onClick={() => setDialog("unpublish")}><EyeOff className="size-4" aria-hidden="true" /> {t.content.common.unpublish}</button>
          ) : (
            <button type="button" className="btn-admin btn-primary" disabled={!pub.allowed} onClick={() => setDialog("publish")}><Eye className="size-4" aria-hidden="true" /> {t.content.common.publish}</button>
          )}
        </div>
        {page.status !== "PUBLISHED" && <ContentGateNotice gate={pub} title={t.cms.gate.title} />}
        <p className="text-xs text-muted">{x.noRevisions}</p>
      </div>
      {dialog && (
        <ConfirmDialog open danger={dialog === "unpublish"} title={fill(dialog === "publish" ? x.pagePublishTitle : x.pageUnpublishTitle, { name })} confirmLabel={dialog === "publish" ? t.content.common.publish : t.content.common.unpublish} busy={toggle.isPending} error={toggle.isError ? errText(toggle.error) : null} onClose={close} onConfirm={() => toggle.mutate(dialog === "publish", { onSuccess: close })}>
          <p>{dialog === "publish" ? x.pagePublishBody : x.pageUnpublishBody}</p>
        </ConfirmDialog>
      )}
    </Card>
  );
}
