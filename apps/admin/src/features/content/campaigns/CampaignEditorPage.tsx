"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { BadgeCheck, Ban, CircleOff, HandCoins, Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { ErrorState, WidgetSkeleton, WidgetState } from "@/components/common/States";
import { CoverField, GalleryField } from "@/components/content/media";
import { Bilingual, Checkbox, Checklist, ContentGateNotice, ContentStatusBadge, ProvenanceBadge, ProvenanceNotice, SaveBar, Select, TextArea, TextInput, serverReasons, useContentError } from "@/components/content/ui";
import { ConfirmDialog, DetailGrid, Money, Notice, PageHeader, Ref, Tabs } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { AuditList } from "@/features/finance/shared";
import { FinancePage, useBackHref, useHref } from "@/features/finance/FinancePage";
import { useCampaign, useCampaignTotals, useCauses, useContentMutation, usePaymentsState, useProgrammeOptions } from "@/hooks/useContentData";
import { useEntityAudit } from "@/hooks/useFinanceData";
import { useForm } from "@/hooks/useForm";
import {
  ACTION_PERMISSION, amountError, amountToApi, amountToInput, approveGate, availableActions, campaignActionGate, campaignDeleteGate, campaignEditGate, causesOf, codeError, dateOrderError, dayToIso,
  donationsGate, financialChangeEffect, hierarchyMismatch, isoToDay, minMaxError, parseSuggested, publishChecklist, revokeGate, slugError, type CampaignAction,
} from "@/lib/content";
import { PROVENANCES, type Campaign, type Media } from "@/lib/content-schemas";
import { formatDate } from "@/lib/format";
import { fill } from "@/lib/i18n";
import * as svc from "@/services/content";

type TabKey = "basic" | "hierarchy" | "fundraising" | "media" | "publishing" | "activity";

export function CampaignEditorPage({ id }: { id?: string }) {
  const { t } = useLocale();
  const href = useHref();
  const x = t.content.campaigns;
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.programs }, { label: x.title, href: href("/campaigns") }, { label: id ? t.content.common.edit : x.newTitle }]} anyOf={id ? ["campaigns.read"] : ["campaigns.manage"]}>
      {id ? <Existing id={id} /> : <Editor campaign={null} />}
    </FinancePage>
  );
}

function Existing({ id }: { id: string }) {
  const q = useCampaign(id);
  if (q.isPending) return <WidgetSkeleton rows={8} minH="min-h-96" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} minH="min-h-80" />;
  return <Editor key={q.data.id} campaign={q.data} />;
}

type Form = {
  code: string; slug: string; titleEn: string; titleAr: string; summaryEn: string; summaryAr: string; descriptionEn: string; descriptionAr: string; locationEn: string; locationAr: string;
  programmeId: string; projectId: string; currency: string; targetAmount: string; suggested: string; allowCustomAmount: boolean; minCustomAmount: string; maxCustomAmount: string;
  startsAt: string; endsAt: string; isFeatured: boolean; sortOrder: string; provenance: string; sourceRef: string; seoTitleEn: string; seoTitleAr: string; seoDescriptionEn: string; seoDescriptionAr: string;
  cover: Media | null;
};

const toForm = (c: Campaign | null, pre: { programmeId?: string | null; projectId?: string | null } = {}): Form => ({
  code: c?.code ?? "", slug: c?.slug ?? "", titleEn: c?.titleEn ?? "", titleAr: c?.titleAr ?? "", summaryEn: c?.summaryEn ?? "", summaryAr: c?.summaryAr ?? "", descriptionEn: c?.descriptionEn ?? "",
  descriptionAr: c?.descriptionAr ?? "", locationEn: c?.locationEn ?? "", locationAr: c?.locationAr ?? "", programmeId: c?.programmeId ?? pre.programmeId ?? "", projectId: c?.projectId ?? pre.projectId ?? "",
  currency: c?.currency ?? "USD", targetAmount: amountToInput(c?.targetAmount), suggested: (c?.suggestedAmounts ?? []).join(", "), allowCustomAmount: c?.allowCustomAmount ?? true,
  minCustomAmount: amountToInput(c?.minCustomAmount), maxCustomAmount: amountToInput(c?.maxCustomAmount), startsAt: isoToDay(c?.startsAt), endsAt: isoToDay(c?.endsAt), isFeatured: c?.isFeatured ?? false,
  sortOrder: String(c?.sortOrder ?? 0), provenance: c?.provenance ?? "PROPOSED", sourceRef: c?.sourceRef ?? "", seoTitleEn: c?.seoTitleEn ?? "", seoTitleAr: c?.seoTitleAr ?? "",
  seoDescriptionEn: c?.seoDescriptionEn ?? "", seoDescriptionAr: c?.seoDescriptionAr ?? "", cover: c?.coverMedia ?? null,
});

/** Form field → [API key, value]. Amounts are validated decimal strings sent as the JSON numbers the DTO requires. */
function toApi(k: keyof Form, f: Form): [string, unknown] {
  switch (k) {
    case "cover": return ["coverMediaId", f.cover?.id ?? null];
    case "programmeId": case "projectId": return [k, f[k] || null];
    case "targetAmount": case "minCustomAmount": case "maxCustomAmount": return [k, amountToApi(f[k])];
    case "suggested": { const p = parseSuggested(f.suggested); return ["suggestedAmounts", "values" in p ? p.values : []]; }
    case "startsAt": case "endsAt": return [k, dayToIso(f[k])];
    case "sortOrder": return [k, Number(f.sortOrder || 0)];
    case "allowCustomAmount": case "isFeatured": return [k, f[k]];
    case "code": case "slug": case "titleEn": case "currency": case "provenance": return [k, f[k].trim()];
    default: return [k, (f[k] as string).trim() || null];
  }
}

function Editor({ campaign }: { campaign: Campaign | null }) {
  const { locale, t } = useLocale();
  const { can } = useAuth();
  const router = useRouter();
  const href = useHref();
  const params = useSearchParams();
  const backHref = useBackHref("/campaigns");
  const errText = useContentError();
  const x = t.content.campaigns;
  const c = t.content.common;
  const e = t.content.errors;
  const isNew = !campaign;
  const editGate = campaignEditGate(campaign ?? { status: "DRAFT" }, can("campaigns.manage"));
  const readOnly = !editGate.allowed;
  const form = useForm<Form>(toForm(campaign, { programmeId: params.get("programmeId"), projectId: params.get("projectId") }));
  const v = form.values;
  const [tab, setTab] = useState<TabKey>("basic");
  const [touched, setTouched] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const programmes = useProgrammeOptions(can("programmes.read"));
  const causes = useCauses({}, can("programmes.read"));
  const payments = usePaymentsState(can("settings.read"));

  const programmeCauses = causesOf(causes.data ?? [], v.programmeId);
  const selectedCause = (causes.data ?? []).find((p) => p.id === v.projectId);
  const suggested = parseSuggested(v.suggested);
  const errors = {
    code: isNew ? (v.code ? (codeError(v.code, 60) ? e.codeFormat : null) : e.required) : null,
    slug: slugError(v.slug.trim()) ? e.slugFormat : null,
    titleEn: v.titleEn.trim().length < 2 ? e.required : null,
    targetAmount: amountError(v.targetAmount) ? e[amountError(v.targetAmount)!] : null,
    minCustomAmount: amountError(v.minCustomAmount) ? e[amountError(v.minCustomAmount)!] : null,
    maxCustomAmount: amountError(v.maxCustomAmount) ? e[amountError(v.maxCustomAmount)!] : minMaxError(v.minCustomAmount, v.maxCustomAmount) ? e.minAboveMax : null,
    suggested: "error" in suggested ? e[suggested.error] : null,
    endsAt: dateOrderError(v.startsAt, v.endsAt) ? e.endBeforeStart : null,
    projectId: hierarchyMismatch(v.programmeId || null, selectedCause) ? e.PROJECT_PROGRAMME_MISMATCH : null,
  };
  const invalid = Object.values(errors).some(Boolean);
  const show = (er: string | null) => (touched || !isNew ? er : null);
  const fin = campaign ? financialChangeEffect(campaign, { targetAmount: form.dirty.includes("targetAmount"), currency: form.dirty.includes("currency"), provenance: form.dirty.includes("provenance") }) : "none";

  const save = useContentMutation(async () => {
    const keys = isNew ? (Object.keys(v) as (keyof Form)[]) : form.dirty;
    const body: Record<string, unknown> = {};
    for (const k of keys) {
      const [key, val] = toApi(k, v);
      if (isNew && (val === null || val === "" || (Array.isArray(val) && val.length === 0))) continue;
      body[key] = val;
    }
    return isNew ? svc.createCampaign(body) : svc.updateCampaign(campaign.id, body);
  });
  const onSave = () => {
    setTouched(true);
    if (invalid || fin === "blockedLive") return;
    setMessage(null);
    save.mutate(undefined, {
      onSuccess: (cp) => {
        if (isNew) router.replace(href(`/campaigns/${cp.id}`));
        else {
          form.reset(toForm(cp));
          setMessage(c.saved);
        }
      },
    });
  };
  const label = (n: { nameEn: string; nameAr?: string | null }) => (locale === "ar" && n.nameAr ? n.nameAr : n.nameEn);
  const currencies = [...new Set([...(payments.data?.currencies ?? []).map((cu) => cu.code), v.currency, campaign?.currency ?? "USD"])];
  const tabs: { key: TabKey; label: string }[] = [
    { key: "basic", label: x.tabs.basic },
    { key: "hierarchy", label: x.tabs.hierarchy },
    { key: "fundraising", label: x.tabs.fundraising },
    { key: "media", label: x.tabs.media },
    ...(campaign ? ([{ key: "publishing", label: x.tabs.publishing }, { key: "activity", label: x.tabs.activity }] as const) : []),
  ];
  const tabHasError: Record<TabKey, boolean> = {
    basic: !!(errors.code || errors.slug || errors.titleEn),
    hierarchy: !!errors.projectId,
    fundraising: !!(errors.targetAmount || errors.minCustomAmount || errors.maxCustomAmount || errors.suggested || errors.endsAt),
    media: false, publishing: false, activity: false,
  };

  return (
    <>
      <PageHeader
        back={{ href: backHref, label: x.title }}
        title={<bdi>{campaign ? (locale === "ar" && campaign.titleAr ? campaign.titleAr : campaign.titleEn) : x.newTitle}</bdi>}
        badges={campaign ? (
          <>
            <ContentStatusBadge status={campaign.status} />
            <ProvenanceBadge value={campaign.provenance} />
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${campaign.approvedAt ? "bg-ok/10 text-ok" : "bg-bg text-body"}`}>{campaign.approvedAt ? x.approved : x.notApproved}</span>
            {campaign.donationsOpen && <span className="rounded-full bg-ok/10 px-2.5 py-1 text-xs font-bold text-ok">{x.donationsOpen}</span>}
            <Ref className="text-muted">{campaign.code}</Ref>
          </>
        ) : undefined}
      />
      <ProvenanceNotice value={v.provenance} />
      {readOnly && <ContentGateNotice gate={editGate} title={c.readOnly} />}

      <Tabs label={x.title} active={tab} onChange={setTab} tabs={tabs.map((tb) => ({ ...tb, label: tabHasError[tb.key] && touched ? `${tb.label} •` : tb.label }))} />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="space-y-4">
        {tab === "basic" && (
          <Card labelledBy="cb-t">
            <CardHeader id="cb-t" title={x.tabs.basic} />
            <div className="space-y-5">
              <Bilingual label={x.fields.title}en={v.titleEn} ar={v.titleAr} onEn={(s) => form.set("titleEn", s)} onAr={(s) => form.set("titleAr", s)} requiredEn errorEn={show(errors.titleEn)} disabled={readOnly} maxLength={255} />
              <Bilingual label={x.fields.summary} en={v.summaryEn} ar={v.summaryAr} onEn={(s) => form.set("summaryEn", s)} onAr={(s) => form.set("summaryAr", s)} multiline rows={3} disabled={readOnly} maxLength={2000} />
              <Bilingual label={x.fields.description} en={v.descriptionEn} ar={v.descriptionAr} onEn={(s) => form.set("descriptionEn", s)} onAr={(s) => form.set("descriptionAr", s)} multiline rows={6} disabled={readOnly} maxLength={20000} />
              <Bilingual label={x.fields.location} en={v.locationEn} ar={v.locationAr} onEn={(s) => form.set("locationEn", s)} onAr={(s) => form.set("locationAr", s)} disabled={readOnly} maxLength={255} />
              <div className="grid gap-4 md:grid-cols-3">
                <TextInput label={c.code} value={v.code} onChange={(s) => form.set("code", s.toUpperCase())} disabled={!isNew || readOnly} required={isNew} error={show(errors.code)} dir="ltr" maxLength={60} placeholder="CMP-WINTER-2027" />
                <TextInput label={c.slug} value={v.slug} onChange={(s) => form.set("slug", s)} hint={c.slugHint} error={errors.slug} disabled={readOnly} dir="ltr" maxLength={120} />
                <TextInput label={c.sortOrder} value={v.sortOrder} onChange={(s) => form.set("sortOrder", s.replace(/\D/g, ""))} disabled={readOnly} dir="ltr" inputMode="numeric" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Select label={c.provenance} value={v.provenance} onChange={(s) => form.set("provenance", s)} disabled={readOnly} hint={c.provenanceChangeHint} options={PROVENANCES.map((p) => ({ value: p, label: t.content.provenance[p] }))} />
                <Checkbox label={c.featured} checked={v.isFeatured} onChange={(b) => form.set("isFeatured", b)} disabled={readOnly} />
              </div>
              <TextArea label={c.sourceRef} value={v.sourceRef} onChange={(s) => form.set("sourceRef", s)} hint={c.sourceRefHint} disabled={readOnly} rows={2} maxLength={255} />
              <Bilingual label={c.seoTitle} en={v.seoTitleEn} ar={v.seoTitleAr} onEn={(s) => form.set("seoTitleEn", s)} onAr={(s) => form.set("seoTitleAr", s)} disabled={readOnly} maxLength={255} />
              <Bilingual label={c.seoDescription} en={v.seoDescriptionEn} ar={v.seoDescriptionAr} onEn={(s) => form.set("seoDescriptionEn", s)} onAr={(s) => form.set("seoDescriptionAr", s)} multiline rows={2} disabled={readOnly} maxLength={1000} />
            </div>
          </Card>
        )}

        {tab === "hierarchy" && (
          <Card labelledBy="ch-t">
            <CardHeader id="ch-t" title={x.tabs.hierarchy} subtitle={x.hierarchyHelp} />
            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label={x.program}
                value={v.programmeId}
                emptyLabel="—"
                disabled={readOnly || !can("programmes.read")}
                onChange={(s) => {
                  form.set("programmeId", s);
                  // a cause of another programme can never stay selected (PROJECT_PROGRAMME_MISMATCH)
                  if (selectedCause && hierarchyMismatch(s || null, selectedCause)) form.set("projectId", "");
                }}
                options={(programmes.data?.items ?? []).map((p) => ({ value: p.id, label: `${label(p)}${p.status !== "PUBLISHED" ? ` (${t.content.statuses[p.status] ?? p.status})` : ""}` }))}
              />
              <Select label={x.cause} value={v.projectId} emptyLabel={x.causeOptional} disabled={readOnly || !v.programmeId} error={errors.projectId} onChange={(s) => form.set("projectId", s)} options={programmeCauses.map((p) => ({ value: p.id, label: label(p) }))} />
            </div>
            {(() => {
              const p = programmes.data?.items.find((pp) => pp.id === v.programmeId);
              return p && p.status !== "PUBLISHED" ? <div className="mt-4"><Notice tone="gold">{t.content.gate["check.programmePublished"]}</Notice></div> : null;
            })()}
          </Card>
        )}

        {tab === "fundraising" && (
          <>
            {campaign && fin !== "none" && <Notice tone="warn">{fin === "blockedLive" ? x.financialBlocked : x.financialReset}</Notice>}
            <Card labelledBy="cf-t">
              <CardHeader id="cf-t" title={x.tabs.fundraising} />
              <div className="grid gap-4 md:grid-cols-2">
                <Select label={x.fields.currency} value={v.currency} onChange={(s) => form.set("currency", s)} disabled={readOnly} options={currencies.map((cu) => ({ value: cu, label: cu }))} />
                <TextInput label={x.fields.target} value={v.targetAmount} onChange={(s) => form.set("targetAmount", s)} hint={x.fields.targetHint} error={errors.targetAmount} disabled={readOnly} dir="ltr" inputMode="decimal" />
                <TextInput label={x.fields.suggested} value={v.suggested} onChange={(s) => form.set("suggested", s)} hint={x.fields.suggestedHint} error={errors.suggested} disabled={readOnly} dir="ltr" />
                <Checkbox label={x.fields.allowCustom} checked={v.allowCustomAmount} onChange={(b) => form.set("allowCustomAmount", b)} disabled={readOnly} />
                <TextInput label={x.fields.minCustom} value={v.minCustomAmount} onChange={(s) => form.set("minCustomAmount", s)} error={errors.minCustomAmount} disabled={readOnly} dir="ltr" inputMode="decimal" />
                <TextInput label={x.fields.maxCustom} value={v.maxCustomAmount} onChange={(s) => form.set("maxCustomAmount", s)} error={errors.maxCustomAmount} disabled={readOnly} dir="ltr" inputMode="decimal" />
                <TextInput label={x.fields.starts} type="date" value={v.startsAt} onChange={(s) => form.set("startsAt", s)} disabled={readOnly} dir="ltr" />
                <TextInput label={x.fields.ends} type="date" value={v.endsAt} onChange={(s) => form.set("endsAt", s)} error={errors.endsAt} disabled={readOnly} dir="ltr" />
              </div>
            </Card>
            {campaign && <Collected campaign={campaign} />}
          </>
        )}

        {tab === "media" && (
          <Card labelledBy="cm-t">
            <CardHeader id="cm-t" title={x.tabs.media} />
            <div className="space-y-6">
              <CoverField media={v.cover} onChange={(m) => form.set("cover", m)} disabled={readOnly || !can("media.read")} defaultCategory="CAMPAIGN" />
              {campaign && <CampaignGallery campaign={campaign} disabled={readOnly || !can("media.read")} />}
            </div>
          </Card>
        )}

        {tab === "publishing" && campaign && <Publishing campaign={campaign} dirty={form.dirty.length > 0} paymentsEffective={payments.isSuccess ? payments.data.effective : null} testMode={!!payments.data?.testMode} />}
        {tab === "activity" && campaign && <Audit id={campaign.id} />}
      </div>

      {!readOnly && tab !== "publishing" && tab !== "activity" && (
        <SaveBar dirty={isNew ? form.dirty.length || 1 : form.dirty.length} busy={save.isPending} onSave={onSave} onDiscard={form.discard} disabled={(touched && invalid) || fin === "blockedLive"} message={message} error={save.isError ? errText(save.error) : touched && invalid ? t.content.errors.VALIDATION_FAILED : null} />
      )}
    </>
  );
}

function Collected({ campaign }: { campaign: Campaign }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const x = t.content.campaigns;
  const allowed = can("reports.read");
  const q = useCampaignTotals(campaign.id, allowed);
  return (
    <Card labelledBy="cc-t">
      <CardHeader id="cc-t" title={x.collectedTitle} subtitle={x.collectedNote} />
      <WidgetState q={q} unavailable={!allowed ? { text: x.collectedNA, locked: true } : false} minH="min-h-20">
        {q.data && (
          <div className="grid gap-3 sm:grid-cols-2" data-testid="campaign-collected">
            {(q.data.totals.length ? q.data.totals : [{ currency: campaign.currency, count: 0, gross: "0", net: "0" }]).map((r) => (
              <div key={r.currency} className="rounded-xl border border-line bg-gradient-to-br from-[#d9efe4] to-white p-4">
                <p className="text-sm font-bold text-body"><bdi dir="ltr">{r.currency}</bdi> · {r.count}</p>
                <p className="mt-1 font-serif text-2xl text-deep-green"><Money value={r.net} currency={r.currency} /></p>
                {campaign.targetAmount && r.currency === campaign.currency && <p className="text-xs text-muted">{x.fields.target}: <Money value={campaign.targetAmount} currency={campaign.currency} /></p>}
              </div>
            ))}
          </div>
        )}
      </WidgetState>
    </Card>
  );
}

function CampaignGallery({ campaign, disabled }: { campaign: Campaign; disabled: boolean }) {
  const { t } = useLocale();
  const errText = useContentError();
  const m = useContentMutation((ids: string[]) => svc.setCampaignGallery(campaign.id, ids));
  return <GalleryField items={campaign.gallery.map((g) => g.media)} onSave={(ids) => m.mutate(ids)} busy={m.isPending} disabled={disabled} error={m.isError ? errText(m.error) : null} message={m.isSuccess ? t.content.common.saved : null} defaultCategory="CAMPAIGN" />;
}

type Dialog = { kind: "action"; action: CampaignAction } | { kind: "approve" } | { kind: "revoke" } | { kind: "donations"; open: boolean } | { kind: "delete" } | null;

function Publishing({ campaign, dirty, paymentsEffective, testMode }: { campaign: Campaign; dirty: boolean; paymentsEffective: boolean | null; testMode: boolean }) {
  const { locale, t } = useLocale();
  const { can } = useAuth();
  const router = useRouter();
  const href = useHref();
  const errText = useContentError();
  const x = t.content.campaigns;
  const c = t.content.common;
  const [dialog, setDialog] = useState<Dialog>(null);
  const [note, setNote] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const name = locale === "ar" && campaign.titleAr ? campaign.titleAr : campaign.titleEn;
  const act = useContentMutation((a: CampaignAction) => svc.transitionCampaign(campaign.id, a));
  const approve = useContentMutation((n: string) => svc.approveCampaign(campaign.id, n));
  const revoke = useContentMutation(() => svc.revokeCampaignApproval(campaign.id));
  const donations = useContentMutation((open: boolean) => svc.setCampaignDonations(campaign.id, open));
  const remove = useContentMutation(() => svc.deleteCampaign(campaign.id));
  const all = [act, approve, revoke, donations, remove];
  const busy = all.some((m) => m.isPending);
  const failed = all.find((m) => m.isError);
  const close = () => { all.forEach((m) => m.reset()); setDialog(null); setNote(""); };
  const ok = (cp: Campaign) => { close(); setDone(`${c.saved} ${t.content.statuses[cp.status] ?? cp.status}.`); };
  const checklist = publishChecklist(campaign);
  const approveG = approveGate(campaign, can("campaigns.approve"));
  const revokeG = revokeGate(campaign, can("campaigns.approve"));
  const openG = donationsGate(true, campaign, paymentsEffective, can("campaigns.publish"));
  const closeG = donationsGate(false, campaign, paymentsEffective, can("campaigns.publish"));
  const delG = campaignDeleteGate(campaign, can("campaigns.manage"));
  const actions = availableActions(campaign.status);
  const reasons = failed ? serverReasons(failed.error) : [];

  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <div className="min-w-0 space-y-4 xl:col-span-7">
        {dirty && <Notice tone="warn">{x.unsavedNotice}</Notice>}
        {done && <p className="rounded-lg bg-ok/10 p-3 text-sm text-ok" role="status">{done}</p>}
        <Card labelledBy="ck-t">
          <CardHeader id="ck-t" title={x.checklist} />
          <Checklist items={checklist} label={x.checklist} />
        </Card>
        <Card labelledBy="lf-t">
          <CardHeader id="lf-t" title={c.lifecycle} right={<ContentStatusBadge status={campaign.status} />} />
          {actions.length === 0 ? (
            <p className="text-sm text-muted">{t.content.gate.wrongState}</p>
          ) : (
            <ul className="space-y-3">
              {actions.map((a) => {
                const g = campaignActionGate(a, campaign, (p) => can(p));
                return (
                  <li key={a}>
                    <button type="button" className={`btn-admin ${a === "publish" || a === "resume" ? "btn-primary" : "btn-ghost"} ${a === "archive" ? "text-danger" : ""}`} disabled={!g.allowed} onClick={() => setDialog({ kind: "action", action: a })} data-action={a} title={ACTION_PERMISSION[a]}>
                      {x.actions[a]}
                    </button>
                    <ContentGateNotice gate={g} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
      <div className="min-w-0 space-y-4 xl:col-span-5">
        <Card labelledBy="ap-t">
          <CardHeader id="ap-t" title={x.approval} />
          {campaign.approvedAt ? (
            <DetailGrid cols={2} items={[[x.approved, fill(x.approvedBy, { name: campaign.approvedBy?.name ?? "—", date: formatDate(campaign.approvedAt, locale) })], [x.approvalRef, campaign.approvalNote ? <bdi key="n" className="whitespace-pre-line">{campaign.approvalNote}</bdi> : "—"]]} />
          ) : (
            <p className="text-sm text-body">{x.notApproved}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-admin btn-primary" disabled={!approveG.allowed} onClick={() => setDialog({ kind: "approve" })}><BadgeCheck className="size-4" aria-hidden="true" /> {campaign.approvedAt ? x.reapprove : x.approve}</button>
            <button type="button" className="btn-admin btn-ghost" disabled={!revokeG.allowed} onClick={() => setDialog({ kind: "revoke" })}><CircleOff className="size-4" aria-hidden="true" /> {x.revoke}</button>
          </div>
          <ContentGateNotice gate={approveG} />
          {campaign.approvedAt && <ContentGateNotice gate={revokeG} />}
        </Card>
        <Card labelledBy="dn-t">
          <CardHeader id="dn-t" title={x.donations} right={campaign.donationsOpen ? <span className="rounded-full bg-ok/10 px-2.5 py-1 text-xs font-bold text-ok">{x.donationsOpen}</span> : undefined} />
          <p className="mb-3 text-sm text-body" data-testid="payments-state">{fill(x.paymentsState, { state: paymentsEffective === null ? "…" : paymentsEffective ? (testMode ? x.paymentsTest : x.paymentsOn) : x.paymentsOff })}</p>
          {campaign.donationsOpen ? (
            <>
              <button type="button" className="btn-admin btn-ghost" disabled={!closeG.allowed} onClick={() => setDialog({ kind: "donations", open: false })}><Ban className="size-4" aria-hidden="true" /> {x.closeDonations}</button>
              <ContentGateNotice gate={closeG} />
            </>
          ) : (
            <>
              <button type="button" className="btn-admin btn-primary" disabled={!openG.allowed} onClick={() => setDialog({ kind: "donations", open: true })}><HandCoins className="size-4" aria-hidden="true" /> {x.openDonations}</button>
              <ContentGateNotice gate={openG} />
            </>
          )}
        </Card>
        <Card labelledBy="dl-t">
          <CardHeader id="dl-t" title={c.delete} />
          <button type="button" className="btn-admin btn-ghost text-danger" disabled={!delG.allowed} onClick={() => setDialog({ kind: "delete" })}><Trash2 className="size-4" aria-hidden="true" /> {c.delete}</button>
          <ContentGateNotice gate={delG} />
        </Card>
        {campaign.project && can("programmes.read") && <Link href={href(`/causes/${campaign.project.id}`)} className="text-sm font-bold text-meki-green-dark hover:underline">{x.cause}: <bdi>{campaign.project.nameEn}</bdi></Link>}
      </div>

      {dialog && (
        <ConfirmDialog
          open
          danger={dialog.kind === "delete" || dialog.kind === "revoke" || (dialog.kind === "action" && dialog.action === "archive")}
          busy={busy}
          error={failed ? errText(failed.error) : null}
          onClose={close}
          confirmDisabled={dialog.kind === "approve" && note.trim().length < 5}
          title={
            dialog.kind === "action" ? fill(x.confirm[dialog.action], { name }) : dialog.kind === "approve" ? x.approveTitle : dialog.kind === "revoke" ? x.revokeTitle : dialog.kind === "donations" ? (dialog.open ? x.openTitle : x.closeTitle) : fill(x.deleteTitle, { name })
          }
          confirmLabel={dialog.kind === "action" ? x.actions[dialog.action] : dialog.kind === "approve" ? x.approve : dialog.kind === "revoke" ? x.revoke : dialog.kind === "donations" ? (dialog.open ? x.openDonations : x.closeDonations) : c.delete}
          onConfirm={() => {
            if (dialog.kind === "action") act.mutate(dialog.action, { onSuccess: ok });
            else if (dialog.kind === "approve") approve.mutate(note.trim(), { onSuccess: ok });
            else if (dialog.kind === "revoke") revoke.mutate(undefined, { onSuccess: ok });
            else if (dialog.kind === "donations") donations.mutate(dialog.open, { onSuccess: ok });
            else remove.mutate(undefined, { onSuccess: () => router.replace(href("/campaigns")) });
          }}
        >
          <p>
            {dialog.kind === "action" ? x.confirmBody[dialog.action] : dialog.kind === "approve" ? x.approveBody : dialog.kind === "revoke" ? x.revokeBody : dialog.kind === "donations" ? (dialog.open ? x.openBody : x.closeBody) : x.deleteBody}
          </p>
          {dialog.kind === "approve" && (
            <TextArea label={x.approveNote} value={note} onChange={setNote} rows={3} maxLength={2000} required error={note.length > 0 && note.trim().length < 5 ? t.content.errors.required : null} />
          )}
          {reasons.length > 0 && (
            <div className="rounded-lg bg-danger/5 p-3 text-xs text-danger">
              <p className="font-bold">{x.publishBlocked}</p>
              <ul className="mt-1 list-disc ps-5">{reasons.map((r) => <li key={r}><bdi>{r}</bdi></li>)}</ul>
            </div>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

function Audit({ id }: { id: string }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const allowed = can("audit.read");
  const q = useEntityAudit("Campaign", id, allowed);
  return (
    <Card labelledBy="aa-t">
      <CardHeader id="aa-t" title={t.content.common.audit} />
      <WidgetState q={q} unavailable={!allowed ? { text: t.content.common.auditLocked, locked: true } : false} minH="min-h-24">
        <AuditList items={q.data ?? []} emptyText={t.content.common.auditEmpty} />
      </WidgetState>
    </Card>
  );
}

