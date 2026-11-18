"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { EmptyState, ErrorState, WidgetSkeleton, WidgetState } from "@/components/common/States";
import { Bilingual, ContentStatusBadge, ProvenanceBadge, ProvenanceNotice, SaveBar, Select, TextArea, TextInput, useContentError } from "@/components/content/ui";
import { DateText, Money, Notice, PageHeader, Ref } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { AuditList } from "@/features/finance/shared";
import { FinancePage, useBackHref, useHref } from "@/features/finance/FinancePage";
import { useCause, useContentMutation, useProgrammeOptions } from "@/hooks/useContentData";
import { useEntityAudit } from "@/hooks/useFinanceData";
import { useForm } from "@/hooks/useForm";
import { causeProgrammeLocked, codeError, slugError } from "@/lib/content";
import { PROVENANCES, type ProjectDetail } from "@/lib/content-schemas";
import * as svc from "@/services/content";

/** A Cause is the API's `project` (Programme → Cause → Campaign). Only create/update exist — no publish or delete. */
export function CauseEditorPage({ id }: { id?: string }) {
  const { t } = useLocale();
  const href = useHref();
  const x = t.content.causes;
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.programs }, { label: x.title, href: href("/causes") }, { label: id ? t.content.common.edit : x.newTitle }]} anyOf={id ? ["programmes.read"] : ["programmes.manage"]}>
      {id ? <Existing id={id} /> : <Editor cause={null} />}
    </FinancePage>
  );
}

function Existing({ id }: { id: string }) {
  const q = useCause(id);
  if (q.isPending) return <WidgetSkeleton rows={6} minH="min-h-80" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} minH="min-h-80" />;
  return <Editor key={q.data.id} cause={q.data} />;
}

type Form = { code: string; slug: string; programmeId: string; nameEn: string; nameAr: string; locationEn: string; locationAr: string; sourceFolder: string; provenance: string; sourceRef: string };
const toForm = (c: ProjectDetail | null, programmeId: string): Form => ({
  code: c?.code ?? "", slug: c?.slug ?? "", programmeId: c?.programmeId ?? programmeId, nameEn: c?.nameEn ?? "", nameAr: c?.nameAr ?? "", locationEn: c?.locationEn ?? "", locationAr: c?.locationAr ?? "",
  sourceFolder: c?.sourceFolder ?? "", provenance: c?.provenance ?? "PROPOSED", sourceRef: c?.sourceRef ?? "",
});
const REQUIRED_TEXT = new Set<keyof Form>(["code", "slug", "nameEn", "provenance"]);
const toApi = (k: keyof Form, f: Form) => (REQUIRED_TEXT.has(k) ? f[k].trim() : f[k].trim() || null);

function Editor({ cause }: { cause: ProjectDetail | null }) {
  const { locale, t } = useLocale();
  const { can } = useAuth();
  const router = useRouter();
  const href = useHref();
  const params = useSearchParams();
  const backHref = useBackHref("/causes");
  const errText = useContentError();
  const x = t.content.causes;
  const c = t.content.common;
  const isNew = !cause;
  const readOnly = !can("programmes.manage");
  const programmes = useProgrammeOptions();
  const form = useForm<Form>(toForm(cause, params.get("programmeId") ?? ""));
  const v = form.values;
  const [touched, setTouched] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const locked = !!cause && causeProgrammeLocked(cause.campaigns.length);
  const selectedProgramme = programmes.data?.items.find((p) => p.id === v.programmeId);

  const errors = {
    code: isNew ? (v.code ? (codeError(v.code, 60) ? t.content.errors.codeFormat : null) : t.content.errors.required) : null,
    nameEn: v.nameEn.trim().length < 2 ? t.content.errors.required : null,
    programmeId: !v.programmeId ? x.programRequired : null,
    slug: slugError(v.slug.trim()) ? t.content.errors.slugFormat : null,
  };
  const invalid = Object.values(errors).some(Boolean);
  const show = (e: string | null) => (touched || !isNew ? e : null);

  const save = useContentMutation(async () => {
    if (isNew) {
      const body: Record<string, unknown> = {};
      for (const k of Object.keys(v) as (keyof Form)[]) {
        const val = toApi(k, v);
        if (val) body[k] = val;
      }
      return svc.createCause(body);
    }
    const body: Record<string, unknown> = {};
    for (const k of form.dirty) body[k] = toApi(k, v);
    return svc.updateCause(cause.id, body);
  });

  const onSave = () => {
    setTouched(true);
    if (invalid) return;
    setMessage(null);
    save.mutate(undefined, {
      onSuccess: (p) => {
        if (isNew) router.replace(href(`/causes/${p.id}`));
        else {
          form.reset(toForm({ ...cause, ...p }, "")); // the server's record becomes the new baseline
          setMessage(c.saved);
        }
      },
    });
  };
  const label = (n: { nameEn: string; nameAr?: string | null }) => (locale === "ar" && n.nameAr ? n.nameAr : n.nameEn);

  return (
    <>
      <PageHeader
        back={{ href: backHref, label: x.title }}
        title={<bdi>{cause ? label(cause) : x.newTitle}</bdi>}
        badges={cause ? <><ContentStatusBadge status={cause.status} /><ProvenanceBadge value={cause.provenance} /><Ref className="text-muted">{cause.code}</Ref></> : undefined}
        subtitle={x.subtitle}
      />
      <ProvenanceNotice value={v.provenance} />
      {readOnly && <Notice>{c.readOnly}</Notice>}
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="min-w-0 space-y-4 xl:col-span-8">
          <Card labelledBy="ch-t">
            <CardHeader id="ch-t" title={x.fields.program} />
            <Select
              label={x.fields.program}
              required
              value={v.programmeId}
              onChange={(s) => form.set("programmeId", s)}
              disabled={readOnly || locked}
              emptyLabel="—"
              error={show(errors.programmeId)}
              hint={locked ? x.programLocked : undefined}
              options={(programmes.data?.items ?? []).map((p) => ({ value: p.id, label: `${label(p)}${p.status !== "PUBLISHED" ? ` (${t.content.statuses[p.status] ?? p.status})` : ""}` }))}
            />
            {selectedProgramme && selectedProgramme.status !== "PUBLISHED" && <div className="mt-3"><Notice tone="gold">{x.unpublishedProgram}</Notice></div>}
            {selectedProgramme && <Link href={href(`/programs/${selectedProgramme.id}`)} className="mt-3 inline-block text-sm font-bold text-meki-green-dark hover:underline">{c.openProgramme}</Link>}
          </Card>
          <Card labelledBy="cb-t">
            <CardHeader id="cb-t" title={t.content.campaigns.tabs.basic} />
            <div className="space-y-5">
              <Bilingual label={t.content.programs.fields.name} en={v.nameEn} ar={v.nameAr} onEn={(s) => form.set("nameEn", s)} onAr={(s) => form.set("nameAr", s)} requiredEn errorEn={show(errors.nameEn)} disabled={readOnly} maxLength={255} />
              <Bilingual label={x.fields.location} en={v.locationEn} ar={v.locationAr} onEn={(s) => form.set("locationEn", s)} onAr={(s) => form.set("locationAr", s)} disabled={readOnly} maxLength={255} />
            </div>
          </Card>
          {cause && <Campaigns cause={cause} />}
        </div>
        <div className="min-w-0 space-y-4 xl:col-span-4">
          <Card labelledBy="cd-t">
            <CardHeader id="cd-t" title={c.details} />
            <div className="space-y-4">
              <TextInput label={c.code} value={v.code} onChange={(s) => form.set("code", s.toUpperCase())} disabled={!isNew || readOnly} required={isNew} error={show(errors.code)} dir="ltr" maxLength={60} placeholder="PRJ-WATER-WELLS" />
              <TextInput label={c.slug} value={v.slug} onChange={(s) => form.set("slug", s)} hint={c.slugHint} error={errors.slug} disabled={readOnly} dir="ltr" maxLength={120} />
              <TextInput label={x.fields.sourceFolder} value={v.sourceFolder} onChange={(s) => form.set("sourceFolder", s)} disabled={readOnly} maxLength={255} />
              <Select label={c.provenance} value={v.provenance} onChange={(s) => form.set("provenance", s)} disabled={readOnly} hint={c.provenanceChangeHint} options={PROVENANCES.map((p) => ({ value: p, label: t.content.provenance[p] }))} />
              <TextArea label={c.sourceRef} value={v.sourceRef} onChange={(s) => form.set("sourceRef", s)} hint={c.sourceRefHint} disabled={readOnly} rows={2} maxLength={255} />
              {cause && <p className="text-xs text-muted">{c.updated}: <DateText value={cause.updatedAt} /></p>}
            </div>
          </Card>
          <Notice>{x.statusNote} {x.noMedia}</Notice>
          {cause && <Audit id={cause.id} />}
        </div>
      </div>
      {!readOnly && <SaveBar dirty={isNew ? form.dirty.length || 1 : form.dirty.length} busy={save.isPending} onSave={onSave} onDiscard={form.discard} disabled={touched && invalid} message={message} error={save.isError ? errText(save.error) : null} />}
    </>
  );
}

function Campaigns({ cause }: { cause: ProjectDetail }) {
  const { locale, t } = useLocale();
  const { can } = useAuth();
  const href = useHref();
  const x = t.content.causes;
  const newHref = href(`/campaigns/new?programmeId=${cause.programmeId ?? ""}&projectId=${cause.id}`);
  return (
    <Card labelledBy="cc-t">
      <CardHeader id="cc-t" title={x.campaignsTitle} right={can("campaigns.manage") && cause.programmeId ? <Link href={newHref} className="btn-admin btn-ghost !min-h-9"><Plus className="size-4" aria-hidden="true" /> {x.newCampaign}</Link> : undefined} />
      {cause.campaigns.length === 0 ? (
        <EmptyState text={x.campaignsEmpty} minH="min-h-20" />
      ) : (
        <ul className="space-y-2">
          {cause.campaigns.map((cp) => (
            <li key={cp.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3">
              <span className="min-w-0">
                {can("campaigns.read") ? (
                  <Link href={href(`/campaigns/${cp.id}`)} className="font-bold text-ink hover:text-meki-green-dark hover:underline"><bdi>{locale === "ar" && cp.titleAr ? cp.titleAr : cp.titleEn}</bdi></Link>
                ) : (
                  <bdi className="font-bold text-ink">{cp.titleEn}</bdi>
                )}
                <span className="block text-xs text-muted">{cp.targetAmount ? <Money value={cp.targetAmount} currency={cp.currency} /> : t.content.campaigns.noTarget}</span>
              </span>
              <span className="flex flex-wrap gap-1.5"><ContentStatusBadge status={cp.status} /><ProvenanceBadge value={cp.provenance} /></span>
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
  const q = useEntityAudit("Project", id, allowed);
  return (
    <Card labelledBy="ca-t">
      <CardHeader id="ca-t" title={t.content.common.audit} />
      <WidgetState q={q} unavailable={!allowed ? { text: t.content.common.auditLocked, locked: true } : false} minH="min-h-24">
        <AuditList items={q.data ?? []} emptyText={t.content.common.auditEmpty} />
      </WidgetState>
    </Card>
  );
}
