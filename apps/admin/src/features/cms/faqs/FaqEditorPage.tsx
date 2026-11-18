"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { ErrorState, WidgetSkeleton, WidgetState } from "@/components/common/States";
import { Bilingual, ContentGateNotice, ContentStatusBadge, ProvenanceBadge, ProvenanceNotice, SaveBar, Select, TextInput, useContentError } from "@/components/content/ui";
import { ConfirmDialog, DateText, Notice, PageHeader } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { AuditList } from "@/features/finance/shared";
import { FinancePage, useBackHref, useHref } from "@/features/finance/FinancePage";
import { useCmsMutation, useFaq, useFaqs } from "@/hooks/useCmsData";
import { useEntityAudit } from "@/hooks/useFinanceData";
import { useForm } from "@/hooks/useForm";
import { faqCategories, faqCategoryError, faqPublishGate } from "@/lib/cms";
import type { Faq } from "@/lib/cms-schemas";
import { PROVENANCES } from "@/lib/content-schemas";
import * as svc from "@/services/cms";

export function FaqEditorPage({ id }: { id?: string }) {
  const { t } = useLocale();
  const href = useHref();
  const x = t.cms.faqs;
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.website }, { label: x.title, href: href("/faqs") }, { label: id ? t.content.common.edit : x.newTitle }]} anyOf={id ? ["faq.read"] : ["faq.manage"]}>
      {id ? <Existing id={id} /> : <Editor faq={null} />}
    </FinancePage>
  );
}

function Existing({ id }: { id: string }) {
  const q = useFaq(id);
  if (q.isPending) return <WidgetSkeleton rows={5} minH="min-h-64" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} minH="min-h-64" />;
  return <Editor key={q.data.id} faq={q.data} />;
}

const toForm = (f: Faq | null) => ({ questionEn: f?.questionEn ?? "", questionAr: f?.questionAr ?? "", answerEn: f?.answerEn ?? "", answerAr: f?.answerAr ?? "", category: f?.category ?? "general", sortOrder: f ? String(f.sortOrder) : "", provenance: f?.provenance ?? "PROPOSED" });

function Editor({ faq }: { faq: Faq | null }) {
  const { locale, t } = useLocale();
  const { can } = useAuth();
  const router = useRouter();
  const href = useHref();
  const backHref = useBackHref("/faqs");
  const errText = useContentError();
  const x = t.cms.faqs;
  const c = t.content.common;
  const isNew = !faq;
  const readOnly = !can("faq.manage");
  const form = useForm(toForm(faq));
  const v = form.values;
  const [touched, setTouched] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "publish" | "unpublish" | "delete">(null);
  const all = useFaqs({ pageSize: 100 });
  const errors = {
    questionEn: v.questionEn.trim().length < 3 ? t.cms.errors.required : null,
    answerEn: v.answerEn.trim().length < 3 ? t.cms.errors.required : null,
    category: faqCategoryError(v.category) ? t.cms.errors.categoryFormat : null,
    sortOrder: v.sortOrder && !/^\d{1,6}$/.test(v.sortOrder) ? t.cms.errors.valueFormat : null,
  };
  const invalid = Object.values(errors).some(Boolean);
  const save = useCmsMutation(() => {
    const keys = isNew ? (Object.keys(v) as (keyof typeof v)[]) : form.dirty;
    const b: Record<string, unknown> = {};
    for (const k of keys) {
      const val = k === "sortOrder" ? (v.sortOrder ? Number(v.sortOrder) : undefined) : v[k].trim();
      if (val === undefined || (isNew && val === "")) continue;
      b[k] = val;
    }
    return isNew ? svc.createFaq(b) : svc.updateFaq(faq.id, b);
  });
  const toggle = useCmsMutation((publish: boolean) => svc.setFaqStatus(faq!.id, publish));
  const remove = useCmsMutation(() => svc.deleteFaq(faq!.id));
  const pub = faq ? faqPublishGate(faq, can("faq.publish")) : null;
  const close = () => { toggle.reset(); remove.reset(); setDialog(null); };
  return (
    <>
      <PageHeader back={{ href: backHref, label: x.title }} title={<bdi>{faq ? (locale === "ar" && faq.questionAr ? faq.questionAr : faq.questionEn) : x.newTitle}</bdi>} badges={faq ? <><ContentStatusBadge status={faq.status} /><ProvenanceBadge value={faq.provenance} /></> : undefined} />
      <ProvenanceNotice value={v.provenance} />
      {readOnly && <Notice>{c.readOnly}</Notice>}
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="min-w-0 space-y-4 xl:col-span-8">
          <Card labelledBy="fq-t">
            <CardHeader id="fq-t" title={x.question} />
            <div className="space-y-5">
              <Bilingual label={x.question} en={v.questionEn} ar={v.questionAr} onEn={(s) => form.set("questionEn", s)} onAr={(s) => form.set("questionAr", s)} requiredEn errorEn={touched || !isNew ? errors.questionEn : null} disabled={readOnly} maxLength={500} />
              <Bilingual label={x.answer} en={v.answerEn} ar={v.answerAr} onEn={(s) => form.set("answerEn", s)} onAr={(s) => form.set("answerAr", s)} multiline rows={6} requiredEn errorEn={touched || !isNew ? errors.answerEn : null} disabled={readOnly} maxLength={10000} />
            </div>
          </Card>
        </div>
        <div className="min-w-0 space-y-4 xl:col-span-4">
          {faq && (
            <Card labelledBy="fp-t">
              <CardHeader id="fp-t" title={c.lifecycle} right={<ContentStatusBadge status={faq.status} />} />
              <div className="space-y-3">
                {faq.status === "PUBLISHED" ? (
                  <button type="button" className="btn-admin btn-ghost w-full justify-center" disabled={!can("faq.publish")} onClick={() => setDialog("unpublish")}><EyeOff className="size-4" aria-hidden="true" /> {c.unpublish}</button>
                ) : (
                  <>
                    <button type="button" className="btn-admin btn-primary w-full justify-center" disabled={!pub?.allowed || form.dirty.length > 0} onClick={() => setDialog("publish")}><Eye className="size-4" aria-hidden="true" /> {c.publish}</button>
                    {pub && <ContentGateNotice gate={pub} title={t.cms.gate.title} />}
                  </>
                )}
                <button type="button" className="btn-admin btn-ghost w-full justify-center text-danger" disabled={!can("faq.manage")} onClick={() => setDialog("delete")}><Trash2 className="size-4" aria-hidden="true" /> {c.delete}</button>
                {faq.publishedAt && <p className="text-xs text-muted">{c.publish}: <DateText value={faq.publishedAt} /></p>}
              </div>
            </Card>
          )}
          <Card labelledBy="fd-t">
            <CardHeader id="fd-t" title={c.details} />
            <div className="space-y-4">
              <div>
                <TextInput label={x.category} value={v.category} onChange={(s) => form.set("category", s.toLowerCase())} hint={x.categoryHint} error={errors.category} disabled={readOnly} dir="ltr" maxLength={60} />
                {!readOnly && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {faqCategories(all.data?.items ?? []).map((k) => (
                      <button key={k} type="button" onClick={() => form.set("category", k)} className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${v.category === k ? "border-meki-green bg-[#e6f2ec] text-meki-green-dark" : "border-line text-body"}`}><bdi dir="ltr">{k}</bdi></button>
                    ))}
                  </div>
                )}
              </div>
              <TextInput label={x.order} value={v.sortOrder} onChange={(s) => form.set("sortOrder", s.replace(/\D/g, ""))} error={errors.sortOrder} disabled={readOnly} dir="ltr" inputMode="numeric" />
              <Select label={c.provenance} value={v.provenance} onChange={(s) => form.set("provenance", s)} disabled={readOnly} hint={c.provenanceChangeHint} options={PROVENANCES.map((p) => ({ value: p, label: t.content.provenance[p] }))} />
            </div>
          </Card>
          {faq && <Audit id={faq.id} />}
        </div>
      </div>
      {!readOnly && (
        <SaveBar
          dirty={isNew ? form.dirty.length || 1 : form.dirty.length}
          busy={save.isPending}
          onDiscard={form.discard}
          disabled={touched && invalid}
          message={message}
          error={save.isError ? errText(save.error) : null}
          onSave={() => { setTouched(true); if (invalid) return; setMessage(null); save.mutate(undefined, { onSuccess: (r) => { if (isNew) router.replace(href(`/faqs/${r.id}`)); else { form.reset(toForm(r)); setMessage(c.saved); } } }); }}
        />
      )}
      {dialog && faq && (
        <ConfirmDialog
          open
          danger={dialog !== "publish"}
          title={dialog === "publish" ? x.publishTitle : dialog === "unpublish" ? x.unpublishTitle : x.deleteTitle}
          confirmLabel={dialog === "publish" ? c.publish : dialog === "unpublish" ? c.unpublish : c.delete}
          busy={toggle.isPending || remove.isPending}
          error={toggle.isError ? errText(toggle.error) : remove.isError ? errText(remove.error) : null}
          onClose={close}
          onConfirm={() => (dialog === "delete" ? remove.mutate(undefined, { onSuccess: () => router.replace(href("/faqs")) }) : toggle.mutate(dialog === "publish", { onSuccess: close }))}
        >
          <p>{dialog === "publish" ? x.publishBody : dialog === "unpublish" ? x.unpublishBody : x.deleteBody}</p>
        </ConfirmDialog>
      )}
    </>
  );
}

function Audit({ id }: { id: string }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const allowed = can("audit.read");
  const q = useEntityAudit("Faq", id, allowed);
  return (
    <Card labelledBy="fa-t">
      <CardHeader id="fa-t" title={t.content.common.audit} />
      <WidgetState q={q} unavailable={!allowed ? { text: t.content.common.auditLocked, locked: true } : false} minH="min-h-20">
        <AuditList items={q.data ?? []} emptyText={t.content.common.auditEmpty} />
      </WidgetState>
    </Card>
  );
}

