"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, Ban, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { Modal } from "@/components/common/Modal";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { Bilingual, ContentGateNotice, ContentStatusBadge, ProvenanceBadge, Select, TextArea, TextInput, useContentError } from "@/components/content/ui";
import { ConfirmDialog, DataTable, DateText, FilterBar, Notice, PageHeader, Pagination, SearchFilter, SelectFilter, type Column } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { FinancePage } from "@/features/finance/FinancePage";
import { useCmsMutation, useStats } from "@/hooks/useCmsData";
import { useProgrammeOptions } from "@/hooks/useContentData";
import { useForm } from "@/hooks/useForm";
import { useUrlState } from "@/hooks/useUrlState";
import { HOMEPAGE, resetsVerification, statDeleteGate, statPublishGate, statValueError, statVerifyGate } from "@/lib/cms";
import type { Statistic } from "@/lib/cms-schemas";
import { PROVENANCES, PUBLICATION_STATUSES } from "@/lib/content-schemas";
import { clampPage, cleanQuery } from "@/lib/finance";
import { fill } from "@/lib/i18n";
import * as svc from "@/services/cms";

const KEYS = ["q", "status", "verification"] as const;
const PAGE_SIZE = 20;
const FORMATS = ["NUMBER", "COMPACT", "CURRENCY", "PERCENT"] as const;
const HOME_FIXED = HOMEPAGE.find((d) => d.key === "IMPACT")?.data?.fixed ?? 4;

export function StatisticsPage() {
  const { t } = useLocale();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.website }, { label: t.cms.stats.title }]} anyOf={["statistics.read"]}>
      <Stats />
    </FinancePage>
  );
}

/** Display only: value + prefix/suffix exactly as stored (no rounding, no currency arithmetic). */
const shown = (s: Statistic) => `${s.prefix ?? ""}${s.value.replace(/\.00$/, "")}${s.suffix ?? ""}`;

function Stats() {
  const { locale, t } = useLocale();
  const { can } = useAuth();
  const x = t.cms.stats;
  const { values: f, page, set, clear, active } = useUrlState(KEYS);
  const q = useStats({ ...cleanQuery({ search: f.q, status: f.status, verificationStatus: f.verification }), pageSize: 100, sort: "sortOrder:asc" });
  const live = useStats({ status: "PUBLISHED", verificationStatus: "VERIFIED", pageSize: 100 });
  const [editing, setEditing] = useState<Statistic | "new" | null>(null);
  const programmes = useProgrammeOptions(can("programmes.read"));
  const progName = (id: string | null) => programmes.data?.items.find((p) => p.id === id)?.[locale === "ar" ? "nameAr" : "nameEn"] ?? programmes.data?.items.find((p) => p.id === id)?.nameEn ?? (id ? "…" : "—");
  const rows = q.data?.items ?? [];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = clampPage(page, pages);
  const liveCount = (live.data?.items ?? []).filter((s) => s.provenance !== "DEMO").length;

  const columns = useMemo<Column<Statistic>[]>(
    () => [
      { key: "label", header: x.cols.label, cell: (s) => <button type="button" onClick={() => setEditing(s)} className="text-start font-bold text-ink hover:text-meki-green-dark hover:underline"><bdi>{locale === "ar" && s.labelAr ? s.labelAr : s.labelEn}</bdi></button> },
      { key: "value", header: x.cols.value, numeric: true, cell: (s) => <bdi dir="ltr" className="num font-bold">{shown(s)}</bdi> },
      { key: "unit", header: x.cols.unit, cell: (s) => s.unit ?? "—" },
      { key: "prog", header: x.cols.programme, cell: (s) => <bdi>{progName(s.programmeId)}</bdi> },
      { key: "ord", header: x.cols.order, numeric: true, cell: (s) => <span className="num">{s.sortOrder}</span> },
      { key: "st", header: x.cols.status, cell: (s) => <span className="inline-flex flex-wrap gap-1"><ContentStatusBadge status={s.status} /><ProvenanceBadge value={s.provenance} /></span> },
      { key: "ver", header: x.cols.verification, cell: (s) => <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${s.verificationStatus === "VERIFIED" ? "bg-ok/10 text-ok" : s.verificationStatus === "REJECTED" ? "bg-danger/10 text-danger" : "bg-warn/10 text-warn"}`}>{x.verifyStates[s.verificationStatus] ?? s.verificationStatus}</span> },
      { key: "per", header: x.cols.period, cell: (s) => <bdi>{(locale === "ar" && s.reportingPeriodAr) || s.reportingPeriodEn || "—"}</bdi> },
      { key: "upd", header: x.cols.updated, cell: (s) => <DateText value={s.updatedAt} withTime={false} /> },
      { key: "act", header: t.content.common.actions, cell: (s) => <button type="button" onClick={() => setEditing(s)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-bold text-meki-green-dark hover:bg-bg"><Pencil className="size-4" aria-hidden="true" /> {can("statistics.manage") ? t.content.common.edit : t.fin.common.view}</button> },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- progName depends on programmes/locale
    [x, t, locale, can, programmes.data],
  );

  return (
    <>
      <PageHeader title={x.title} subtitle={x.subtitle} right={can("statistics.manage") ? <button type="button" className="btn-admin btn-primary" onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden="true" /> {x.newTitle}</button> : undefined} />
      <Notice tone="gold"><p>{x.rules}</p></Notice>
      <Notice tone={liveCount === HOME_FIXED ? "info" : "warn"}><p data-testid="stats-home-count">{fill(x.homepageCount, { n: HOME_FIXED, k: live.isSuccess ? liveCount : "…" })}</p></Notice>
      <Card labelledBy="st-t">
        <CardHeader id="st-t" title={x.title} />
        <FilterBar active={active} onClear={clear}>
          <SearchFilter value={f.q} onChange={(v) => set({ q: v })} label={x.search} ltr={false} />
          <SelectFilter label={t.content.common.status} allLabel={t.content.common.anyStatus} value={f.status} onChange={(v) => set({ status: v })} options={PUBLICATION_STATUSES.filter((s) => s !== "IN_REVIEW").map((s) => ({ value: s, label: t.content.statuses[s] }))} />
          <SelectFilter label={x.verification} allLabel={x.allVerification} value={f.verification} onChange={(v) => set({ verification: v })} options={Object.entries(x.verifyStates).map(([value, label]) => ({ value, label }))} />
        </FilterBar>
        <WidgetState q={q} isEmpty={rows.length === 0} emptyText={active ? x.emptyFiltered : x.empty} minH="min-h-48">
          <DataTable caption={x.title} rows={rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)} columns={columns} rowKey={(s) => s.id} dimmed={q.isPlaceholderData} />
          <Pagination page={current} totalPages={pages} total={rows.length} onPage={(p) => set({ page: p })} />
        </WidgetState>
      </Card>
      {editing && <StatEditor stat={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

type Form = {
  code: string; labelEn: string; labelAr: string; descriptionEn: string; descriptionAr: string; value: string; unit: string; prefix: string; suffix: string; displayFormat: string; programmeId: string;
  sourceRef: string; attributionEn: string; attributionAr: string; reportingPeriodEn: string; reportingPeriodAr: string; sortOrder: string; provenance: string;
};
const toForm = (s: Statistic | null): Form => ({
  code: s?.code ?? "", labelEn: s?.labelEn ?? "", labelAr: s?.labelAr ?? "", descriptionEn: s?.descriptionEn ?? "", descriptionAr: s?.descriptionAr ?? "", value: s?.value ?? "", unit: s?.unit ?? "",
  prefix: s?.prefix ?? "", suffix: s?.suffix ?? "", displayFormat: s?.displayFormat ?? "NUMBER", programmeId: s?.programmeId ?? "", sourceRef: s?.sourceRef ?? "", attributionEn: s?.attributionEn ?? "",
  attributionAr: s?.attributionAr ?? "", reportingPeriodEn: s?.reportingPeriodEn ?? "", reportingPeriodAr: s?.reportingPeriodAr ?? "", sortOrder: s ? String(s.sortOrder) : "", provenance: s?.provenance ?? "PROPOSED",
});

function StatEditor({ stat: initial, onClose }: { stat: Statistic | null; onClose: () => void }) {
  const { locale, t } = useLocale();
  const { can } = useAuth();
  const errText = useContentError();
  const x = t.cms.stats;
  const c = t.content.common;
  const [stat, setStat] = useState(initial);
  const readOnly = !can("statistics.manage");
  const form = useForm<Form>(toForm(stat));
  const v = form.values;
  const [action, setAction] = useState<null | "verify" | "reject" | "publish" | "unpublish" | "delete">(null);
  const [msg, setMsg] = useState<string | null>(null);
  const programmes = useProgrammeOptions(can("programmes.read"));
  const errors = {
    code: !stat ? (/^[a-z0-9_-]{2,60}$/.test(v.code) ? null : t.cms.errors.categoryFormat) : null,
    labelEn: v.labelEn.trim().length < 2 ? t.cms.errors.required : null,
    value: statValueError(v.value) ? t.cms.errors.valueFormat : null,
  };
  const invalid = Object.values(errors).some(Boolean);
  const save = useCmsMutation(() => {
    const keys = stat ? form.dirty : (Object.keys(v) as (keyof Form)[]);
    const b: Record<string, unknown> = {};
    for (const k of keys) {
      if (k === "value") b.value = Number(v.value.trim()); // DTO number with ≤ 2 decimals (validated above)
      else if (k === "sortOrder") { if (v.sortOrder) b.sortOrder = Number(v.sortOrder); }
      else if (k === "programmeId") b.programmeId = v.programmeId || null;
      else if (!stat && v[k].trim() === "") continue;
      else b[k] = v[k].trim();
    }
    return stat ? svc.updateStat(stat.id, b) : svc.createStat(b);
  });
  const act = useCmsMutation((a: NonNullable<typeof action>) =>
    a === "verify" || a === "reject" ? svc.verifyStat(stat!.id, a === "verify" ? "VERIFIED" : "REJECTED") : a === "delete" ? svc.deleteStat(stat!.id).then(() => null) : svc.setStatStatus(stat!.id, a === "publish"),
  );
  const willReset = stat ? resetsVerification(stat.verificationStatus, form.dirty) : false;
  const verifyG = stat ? statVerifyGate(stat, can("statistics.verify")) : null;
  const pubG = stat ? statPublishGate(stat, can("statistics.publish")) : null;
  const delG = stat ? statDeleteGate(stat, can("statistics.manage")) : null;
  const done = (s: Statistic | null) => { setAction(null); if (!s) return onClose(); setStat(s); form.reset(toForm(s)); setMsg(c.saved); };

  return (
    <Modal open size="xl" title={stat ? x.edit : x.newTitle} closeLabel={t.fin.common.close} onClose={() => !save.isPending && !act.isPending && onClose()}
      footer={
        <>
          {msg && !form.dirty.length && <span className="me-auto self-center text-sm text-ok" role="status">{msg}</span>}
          {save.isError && <span className="me-auto self-center text-sm text-danger" role="alert">{errText(save.error)}</span>}
          <button type="button" className="btn-admin btn-ghost" onClick={onClose}>{t.fin.common.close}</button>
          {!readOnly && <button type="button" className="btn-admin btn-primary" disabled={save.isPending || invalid || (stat !== null && form.dirty.length === 0)} onClick={() => { setMsg(null); save.mutate(undefined, { onSuccess: (s) => { setStat(s); form.reset(toForm(s)); setMsg(stat ? c.saved : x.created); } }); }}>{save.isPending ? c.saving : c.save}</button>}
        </>
      }
    >
      <div className="space-y-5">
        {stat && (
          <div className="flex flex-wrap items-center gap-2">
            <ContentStatusBadge status={stat.status} />
            <ProvenanceBadge value={stat.provenance} />
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${stat.verificationStatus === "VERIFIED" ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>{x.verifyStates[stat.verificationStatus]}</span>
          </div>
        )}
        {willReset && <Notice tone="warn">{x.resetWarning}</Notice>}
        <Bilingual label={x.label} en={v.labelEn} ar={v.labelAr} onEn={(s) => form.set("labelEn", s)} onAr={(s) => form.set("labelAr", s)} requiredEn errorEn={errors.labelEn} disabled={readOnly} maxLength={255} />
        <div className="grid gap-4 sm:grid-cols-4">
          <TextInput label={x.prefix} value={v.prefix} onChange={(s) => form.set("prefix", s)} disabled={readOnly} dir="ltr" maxLength={10} />
          <TextInput label={x.value} value={v.value} onChange={(s) => form.set("value", s)} error={errors.value} disabled={readOnly} dir="ltr" inputMode="decimal" required />
          <TextInput label={x.suffix} value={v.suffix} onChange={(s) => form.set("suffix", s)} disabled={readOnly} dir="ltr" maxLength={10} />
          <TextInput label={x.unit} value={v.unit} onChange={(s) => form.set("unit", s)} disabled={readOnly} maxLength={40} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label={x.format} value={v.displayFormat} onChange={(s) => form.set("displayFormat", s)} disabled={readOnly} options={FORMATS.map((k) => ({ value: k, label: x.formats[k] }))} />
          <Select label={x.programme} value={v.programmeId} emptyLabel={x.noProgramme} onChange={(s) => form.set("programmeId", s)} disabled={readOnly || !can("programmes.read")} options={(programmes.data?.items ?? []).map((p) => ({ value: p.id, label: locale === "ar" && p.nameAr ? p.nameAr : p.nameEn }))} />
          <TextInput label={x.order} value={v.sortOrder} onChange={(s) => form.set("sortOrder", s.replace(/\D/g, ""))} disabled={readOnly} dir="ltr" inputMode="numeric" />
        </div>
        <TextArea label={x.source} value={v.sourceRef} onChange={(s) => form.set("sourceRef", s)} hint={c.sourceRefHint} disabled={readOnly} rows={2} maxLength={255} />
        <Bilingual label={x.attribution} en={v.attributionEn} ar={v.attributionAr} onEn={(s) => form.set("attributionEn", s)} onAr={(s) => form.set("attributionAr", s)} disabled={readOnly} maxLength={255} />
        <Bilingual label={x.period} en={v.reportingPeriodEn} ar={v.reportingPeriodAr} onEn={(s) => form.set("reportingPeriodEn", s)} onAr={(s) => form.set("reportingPeriodAr", s)} disabled={readOnly} maxLength={120} />
        <Bilingual label={x.description} en={v.descriptionEn} ar={v.descriptionAr} onEn={(s) => form.set("descriptionEn", s)} onAr={(s) => form.set("descriptionAr", s)} multiline rows={2} disabled={readOnly} maxLength={2000} />
        <div className="grid gap-4 sm:grid-cols-2">
          {!stat && <TextInput label={x.code} value={v.code} onChange={(s) => form.set("code", s.toLowerCase())} error={errors.code} dir="ltr" maxLength={60} placeholder="beneficiaries" required />}
          <Select label={c.provenance} value={v.provenance} onChange={(s) => form.set("provenance", s)} disabled={readOnly} hint={c.provenanceChangeHint} options={PROVENANCES.map((p) => ({ value: p, label: t.content.provenance[p] }))} />
        </div>

        {stat && verifyG && pubG && delG && (
          <section className="rounded-xl border border-line p-4" aria-label={c.lifecycle}>
            <p className="mb-3 text-sm font-bold text-ink">{c.lifecycle}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-admin btn-ghost" disabled={!verifyG.allowed || stat.verificationStatus === "VERIFIED" || form.dirty.length > 0} onClick={() => setAction("verify")}><BadgeCheck className="size-4" aria-hidden="true" /> {x.verify}</button>
              <button type="button" className="btn-admin btn-ghost" disabled={!can("statistics.verify") || stat.verificationStatus === "REJECTED" || stat.status === "PUBLISHED"} onClick={() => setAction("reject")}><Ban className="size-4" aria-hidden="true" /> {x.reject}</button>
              {stat.status === "PUBLISHED" ? (
                <button type="button" className="btn-admin btn-ghost" disabled={!can("statistics.publish")} onClick={() => setAction("unpublish")}><EyeOff className="size-4" aria-hidden="true" /> {c.unpublish}</button>
              ) : (
                <button type="button" className="btn-admin btn-primary" disabled={!pubG.allowed || form.dirty.length > 0} onClick={() => setAction("publish")}><Eye className="size-4" aria-hidden="true" /> {c.publish}</button>
              )}
              <button type="button" className="btn-admin btn-ghost text-danger" disabled={!delG.allowed} onClick={() => setAction("delete")}><Trash2 className="size-4" aria-hidden="true" /> {c.delete}</button>
            </div>
            {stat.verificationStatus !== "VERIFIED" && <ContentGateNotice gate={verifyG} title={x.verify} />}
            {stat.status !== "PUBLISHED" && <ContentGateNotice gate={pubG} title={c.publish} />}
            {!delG.allowed && <ContentGateNotice gate={delG} title={c.delete} />}
          </section>
        )}
      </div>
      {action && stat && (
        <ConfirmDialog
          open
          danger={action === "delete" || action === "reject" || action === "unpublish"}
          title={x[`${action}Title` as "verifyTitle"]}
          confirmLabel={action === "verify" ? x.verify : action === "reject" ? x.reject : action === "publish" ? c.publish : action === "unpublish" ? c.unpublish : c.delete}
          busy={act.isPending}
          error={act.isError ? errText(act.error) : null}
          onClose={() => { act.reset(); setAction(null); }}
          onConfirm={() => act.mutate(action, { onSuccess: done })}
        >
          <p>{x[`${action}Body` as "verifyBody"]}</p>
        </ConfirmDialog>
      )}
    </Modal>
  );
}
