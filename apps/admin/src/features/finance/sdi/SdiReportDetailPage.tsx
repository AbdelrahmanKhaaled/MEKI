"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BadgeCheck, Ban, CheckCheck, Download, Eye, Save } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { ErrorState, WidgetSkeleton, WidgetState } from "@/components/common/States";
import { Checkbox, Select, TextArea, TextInput } from "@/components/content/ui";
import { ConfirmDialog, DataTable, DateText, DetailGrid, FilterBar, Money, Notice, PageHeader, Pagination, Ref, SearchFilter, SelectFilter, type Column } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { FinancePage } from "@/features/finance/FinancePage";
import { useUrlState } from "@/hooks/useUrlState";
import { cleanQuery } from "@/lib/finance";
import { fill } from "@/lib/i18n";
import {
  ATTENDEE_FIELDS, REPORT_TYPES, RECON_REQUIRED, attendeeBody, reconFieldsFor, attendeeFromSaved, canApprove, reconBody, reconFromSaved, reconProblems,
  type AttendeeForm, type ReconForm,
} from "@/lib/sdi";
import { DATE_FORMATS, ROW_STATUSES, type MappingProfile, type ReportImport, type ReportRow } from "@/lib/sdi-schemas";
import * as svc from "@/services/sdi";
import { ReportBadge, RowBadge, SyntheticBadge, fileSize, useSdiError } from "./shared";

export function SdiReportDetailPage({ id }: { id: string }) {
  const { t } = useLocale();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.donors }, { label: t.sdi.title }, { label: t.sdi.detail }]} anyOf={["sdi.reports.upload"]}>
      <Loader id={id} />
    </FinancePage>
  );
}

function Loader({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["sdi", "report", id], queryFn: () => svc.getReport(id) });
  if (q.isPending) return <WidgetSkeleton rows={6} minH="min-h-80" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} minH="min-h-80" />;
  return <Detail imp={q.data} />;
}

type Dialog = null | "apply" | "reject" | "saveProfile" | { verify: MappingProfile };

function Detail({ imp }: { imp: ReportImport }) {
  const { t, locale } = useLocale();
  const x = t.sdi;
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const errText = useSdiError();
  const open = imp.status === "UPLOADED" || imp.status === "PREVIEWED";
  const recon = imp.kind === "RECONCILIATION";
  const [rf, setRf] = useState<ReconForm>(() => reconFromSaved(imp.mapping, imp.headers));
  const [af, setAf] = useState<AttendeeForm>(() => attendeeFromSaved(imp.mapping, imp.headers));
  const [profileId, setProfileId] = useState(imp.mappingProfileId ?? "");
  const [period, setPeriod] = useState({ from: imp.periodFrom?.slice(0, 10) ?? "", to: imp.periodTo?.slice(0, 10) ?? "" });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reason, setReason] = useState("");
  const [profileName, setProfileName] = useState("");
  const [verifyNote, setVerifyNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const profiles = useQuery({ queryKey: ["sdi", "mappings", imp.kind], queryFn: () => svc.listMappings(imp.kind) });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["sdi"] });

  const problems = recon ? reconProblems(rf) : af.guestName ? [] : ["missing:guestName"];
  const body = (): svc.PreviewBody => ({
    ...(profileId ? { mappingProfileId: profileId } : { mapping: recon ? reconBody(rf) : attendeeBody(af) }),
    ...(period.from ? { periodFrom: period.from } : {}),
    ...(period.to ? { periodTo: period.to } : {}),
  });
  const preview = useMutation({ mutationFn: () => svc.previewReport(imp.id, body()), onSuccess: () => { setMsg(null); refresh(); } });
  const apply = useMutation({
    mutationFn: () => svc.applyReport(imp.id),
    onSuccess: (r) => {
      const a = (r.summary?.applied ?? {}) as Record<string, number>;
      setMsg(recon ? fill(x.applied, { confirmed: a.confirmed ?? 0, refunds: a.refunds ?? 0, cancelled: a.cancelled ?? 0, recorded: a.recorded ?? 0 }) : null);
      setDialog(null);
      refresh();
    },
  });
  const reject = useMutation({ mutationFn: () => svc.rejectReport(imp.id, reason.trim()), onSuccess: () => { setDialog(null); refresh(); } });
  const saveProfile = useMutation({
    mutationFn: () => svc.createMapping({ kind: imp.kind, name: profileName.trim(), mapping: recon ? reconBody(rf) : attendeeBody(af), headers: imp.headers }),
    onSuccess: (p) => { setProfileId(p.id); setDialog(null); void qc.invalidateQueries({ queryKey: ["sdi", "mappings"] }); },
  });
  const verify = useMutation({ mutationFn: (pid: string) => svc.verifyMapping(pid, verifyNote.trim()), onSuccess: () => { setDialog(null); void qc.invalidateQueries({ queryKey: ["sdi", "mappings"] }); } });
  const exp = useMutation({ mutationFn: () => svc.exportReport(imp.id), onSuccess: () => setMsg(x.exported) });

  const approver = can("sdi.reports.approve");
  const mayApply = canApprove(imp, user?.id, approver);
  const selectedProfile = profiles.data?.find((p) => p.id === profileId);
  const headerOptions = imp.headers.map((h) => ({ value: h, label: h }));
  const summary = (imp.summary ?? {}) as Record<string, unknown>;
  const counts = ROW_STATUSES.filter((k) => typeof summary[k] === "number" && (summary[k] as number) > 0);

  return (
    <>
      <PageHeader
        back={{ href: `/${locale}/payments/sdi-reconciliation`, label: x.title }}
        title={<bdi dir="ltr" className="break-all">{imp.fileName}</bdi>}
        badges={<><ReportBadge status={imp.status} /><span className="rounded-full bg-bg px-2.5 py-1 text-xs font-bold text-body">{x.kinds[imp.kind]}</span>{imp.isSynthetic && <SyntheticBadge />}</>}
        right={
          <span className="flex flex-wrap gap-2">
            {recon && imp.status !== "UPLOADED" && <button type="button" className="btn-admin btn-ghost" disabled={exp.isPending} onClick={() => exp.mutate()}><Download className="size-4" aria-hidden="true" /> {x.export}</button>}
            {open && <button type="button" className="btn-admin btn-ghost text-danger" onClick={() => setDialog("reject")}><Ban className="size-4" aria-hidden="true" /> {x.reject}</button>}
            {imp.status === "PREVIEWED" && <button type="button" className="btn-admin btn-primary" disabled={!mayApply} onClick={() => setDialog("apply")} data-testid="sdi-apply"><CheckCheck className="size-4" aria-hidden="true" /> {x.apply}</button>}
          </span>
        }
      />
      {msg && <p className="rounded-lg bg-ok/10 p-3 text-sm text-ok" role="status">{msg}</p>}
      {exp.isError && <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger" role="alert">{errText(exp.error)}</p>}
      {imp.isSynthetic && <Notice tone="warn"><p>{x.syntheticHint}</p></Notice>}
      {!recon && <Notice tone="gold"><p>{x.attendeesHint}</p></Notice>}
      {imp.status === "PREVIEWED" && !mayApply && <Notice tone="gold"><p>{approver ? x.applySelf : x.applyNoPermission}</p></Notice>}
      {recon && open && !imp.isSynthetic && !selectedProfile?.verifiedAgainstSample && <Notice tone="gold"><p>{x.profileNeeded}</p></Notice>}

      <Card labelledBy="sd-f">
        <CardHeader id="sd-f" title={x.fileInfo} />
        <DetailGrid
          items={[
            [x.uploadedAt, <DateText key="u" value={imp.uploadedAt} />],
            [x.size, `${fileSize(imp.fileSize)} · ${imp.fileType.toUpperCase()}`],
            [x.rows, <span key="r" className="num">{imp.rowCount}</span>],
            [x.sha, <Ref key="s" className="break-all text-xs">{imp.fileSha256}</Ref>],
            [x.previewedAt, <DateText key="p" value={imp.previewedAt} />],
            [imp.status === "REJECTED" ? x.rejectedAt : x.appliedAt, <DateText key="a" value={imp.status === "REJECTED" ? imp.rejectedAt : imp.appliedAt} />],
            ...(imp.rejectReason ? ([[x.rejectReason, <bdi key="rr">{imp.rejectReason}</bdi>]] as [string, React.ReactNode][]) : []),
          ]}
        />
        <p className="mt-4 text-xs text-muted">{x.headers}: <bdi dir="ltr">{imp.headers.join(" · ")}</bdi></p>
      </Card>

      {open && (
        <Card labelledBy="sd-m">
          <CardHeader id="sd-m" title={x.mapping} subtitle={x.mappingHelp} />
          <div className="space-y-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-64 flex-1">
                <Select label={x.profile} value={profileId} onChange={setProfileId} emptyLabel={x.profileNone} options={(profiles.data ?? []).map((p) => ({ value: p.id, label: `${p.name} — ${p.verifiedAgainstSample ? x.verified : x.unverified}` }))} />
              </div>
              {selectedProfile && !selectedProfile.verifiedAgainstSample && approver && selectedProfile.createdById !== user?.id && (
                <button type="button" className="btn-admin btn-ghost" onClick={() => { setVerifyNote(""); setDialog({ verify: selectedProfile }); }}><BadgeCheck className="size-4" aria-hidden="true" /> {x.verify}</button>
              )}
              {!profileId && <button type="button" className="btn-admin btn-ghost" disabled={problems.length > 0} onClick={() => { setProfileName(""); setDialog("saveProfile"); }}><Save className="size-4" aria-hidden="true" /> {x.saveProfile}</button>}
            </div>

            {!profileId && recon && (
              <div className="grid gap-4 md:grid-cols-3">
                {/* Phase 12B: Gala ticket form vs Gala standalone donation form (ticket-only columns hidden for donations) */}
                <div className="md:col-span-3">
                  <Select label={x.mappingFields.reportType} value={rf.reportType} onChange={(v) => setRf({ ...rf, reportType: v as ReconForm["reportType"] })} options={REPORT_TYPES.map((r) => ({ value: r, label: x.mappingFields.reportTypes[r] }))} required />
                </div>
                {reconFieldsFor(rf.reportType).map((k) => (
                  <Select key={k} label={`${x.fields[k]}${RECON_REQUIRED.includes(k) ? ` (${x.required})` : ""}`} value={rf[k]} onChange={(v) => setRf({ ...rf, [k]: v })} emptyLabel={x.notMapped} options={headerOptions} required={RECON_REQUIRED.includes(k)} />
                ))}
                <Select label={x.dateFormat} value={rf.dateFormat} onChange={(v) => setRf({ ...rf, dateFormat: v as ReconForm["dateFormat"] })} options={DATE_FORMATS.map((d) => ({ value: d, label: x.dateFormats[d] }))} required />
                <TextInput label={x.mappingFields.timeZone} hint={x.mappingFields.timeZoneHint} value={rf.timeZone} onChange={(v) => setRf({ ...rf, timeZone: v })} dir="ltr" maxLength={64} />
                <div className="md:col-span-2">
                  <TextInput label={x.mappingFields.galaFunds} hint={x.mappingFields.galaFundsHint} value={rf.galaFunds} onChange={(v) => setRf({ ...rf, galaFunds: v })} maxLength={600} />
                </div>
                {rf.recurring && <p className="text-xs text-muted md:col-span-3">{x.mappingFields.recurringHint}</p>}
                <div className="md:col-span-2" hidden={rf.reportType !== "GALA_TICKETS"}>
                  <TextInput label={x.donationTypes} hint={x.donationTypesHelp} value={rf.donationTicketTypes} onChange={(v) => setRf({ ...rf, donationTicketTypes: v })} maxLength={600} />
                </div>
                <div className="md:col-span-3">
                  <TextArea label={x.statusMap} hint={x.statusMapHelp} value={rf.statusMap} onChange={(v) => setRf({ ...rf, statusMap: v })} rows={6} dir="ltr" maxLength={4000} />
                </div>
                {/* Phase 14: donation forms — Donation Type (Zakat/Sadaqah) and Program/Fund answer maps; never guessed */}
                {rf.reportType !== "GALA_TICKETS" && (
                  <>
                    <div className="md:col-span-3 md:grid md:grid-cols-2 md:gap-4">
                      <TextArea label={x.mappingFields.donationTypeMap} hint={x.mappingFields.donationTypeMapHint} value={rf.donationTypeMap} onChange={(v) => setRf({ ...rf, donationTypeMap: v })} rows={4} dir="ltr" maxLength={2000} />
                      <TextArea label={x.mappingFields.designationMap} hint={x.mappingFields.designationMapHint} value={rf.designationMap} onChange={(v) => setRf({ ...rf, designationMap: v })} rows={4} dir="ltr" maxLength={4000} />
                    </div>
                    <p className="text-xs text-muted md:col-span-3">{x.mappingFields.intentHint}</p>
                  </>
                )}
              </div>
            )}
            {!profileId && !recon && (
              <div className="grid gap-4 md:grid-cols-3">
                {ATTENDEE_FIELDS.map((k) => (
                  <Select key={k} label={`${x.fields[k]}${k === "guestName" ? ` (${x.required})` : ""}`} value={af[k]} onChange={(v) => setAf({ ...af, [k]: v })} emptyLabel={x.notMapped} options={headerOptions} required={k === "guestName"} />
                ))}
                <fieldset className="md:col-span-3">
                  <legend className="mb-2 text-sm font-bold text-ink">{x.fields.answers}</legend>
                  <div className="flex flex-wrap gap-x-6">
                    {imp.headers.filter((h) => !ATTENDEE_FIELDS.some((k) => af[k] === h)).map((h) => (
                      <Checkbox key={h} label={h} checked={af.answers.includes(h)} onChange={(on) => setAf({ ...af, answers: on ? [...af.answers, h] : af.answers.filter((a) => a !== h) })} />
                    ))}
                  </div>
                </fieldset>
              </div>
            )}

            {recon && (
              <fieldset className="grid gap-4 md:grid-cols-3">
                <legend className="mb-2 text-sm font-bold text-ink">{x.period}</legend>
                <TextInput label={x.periodFrom} type="date" value={period.from} onChange={(v) => setPeriod({ ...period, from: v })} dir="ltr" />
                <TextInput label={x.periodTo} type="date" value={period.to} onChange={(v) => setPeriod({ ...period, to: v })} dir="ltr" />
              </fieldset>
            )}

            {!profileId && problems.length > 0 && (
              <ul className="space-y-1 text-sm text-warn" role="status">
                {problems.map((p) => <li key={p}>{p.startsWith("missing:") ? fill(x.missingField, { field: x.fields[p.slice(8)] ?? p.slice(8) }) : x.problems[p]}</li>)}
              </ul>
            )}
            <p className="text-sm text-body">{x.previewBody}</p>
            {preview.isError && <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger" role="alert">{errText(preview.error)}</p>}
            <button type="button" className="btn-admin btn-primary" disabled={preview.isPending || (!profileId && problems.length > 0)} onClick={() => preview.mutate()} data-testid="sdi-preview">
              <Eye className="size-4" aria-hidden="true" /> {preview.isPending ? x.previewing : x.preview}
            </button>
          </div>
        </Card>
      )}

      {imp.status !== "UPLOADED" && (
        <Card labelledBy="sd-sum">
          <CardHeader id="sd-sum" title={x.summary} />
          <div className="flex flex-wrap gap-2" data-testid="sdi-summary">
            {recon ? counts.map((k) => <span key={k} className="inline-flex items-center gap-2"><RowBadge status={k} /><span className="num text-sm font-bold">{summary[k] as number}</span></span>) : (
              <span className="text-sm">{x.cols.accepted}: <span className="num font-bold">{imp.acceptedCount}</span> · {x.cols.rejected}: <span className="num font-bold">{imp.rejectedCount}</span></span>
            )}
          </div>
          <p className="mt-3 text-xs text-muted">{x.separation}</p>
        </Card>
      )}

      {recon && imp.status !== "UPLOADED" && <Rows id={imp.id} />}

      {dialog === "apply" && (
        <ConfirmDialog open title={x.applyTitle} confirmLabel={x.apply} busy={apply.isPending} error={apply.isError ? errText(apply.error) : null} onClose={() => { apply.reset(); setDialog(null); }} onConfirm={() => apply.mutate()}>
          <p>{recon ? x.applyBody : x.attendeesHint}</p>
          {imp.isSynthetic && <p className="font-bold text-warn">{x.syntheticHint}</p>}
        </ConfirmDialog>
      )}
      {dialog === "reject" && (
        <ConfirmDialog open danger title={x.rejectTitle} confirmLabel={x.reject} busy={reject.isPending} error={reject.isError ? errText(reject.error) : null} confirmDisabled={reason.trim().length < 3} onClose={() => { reject.reset(); setDialog(null); }} onConfirm={() => reject.mutate()}>
          <p>{x.rejectBody}</p>
          <TextArea label={x.rejectReason} value={reason} onChange={setReason} rows={3} maxLength={500} required />
        </ConfirmDialog>
      )}
      {dialog === "saveProfile" && (
        <ConfirmDialog open title={x.saveProfile} confirmLabel={x.saveProfile} busy={saveProfile.isPending} error={saveProfile.isError ? errText(saveProfile.error) : null} confirmDisabled={profileName.trim().length < 2} onClose={() => { saveProfile.reset(); setDialog(null); }} onConfirm={() => saveProfile.mutate()}>
          <TextInput label={x.profileName} value={profileName} onChange={setProfileName} maxLength={80} required />
          <p className="text-sm text-body">{x.profileNeeded}</p>
        </ConfirmDialog>
      )}
      {dialog && typeof dialog === "object" && (
        <ConfirmDialog open title={x.verifyTitle} confirmLabel={x.verify} busy={verify.isPending} error={verify.isError ? errText(verify.error) : null} confirmDisabled={verifyNote.trim().length < 5} onClose={() => { verify.reset(); setDialog(null); }} onConfirm={() => verify.mutate(dialog.verify.id)}>
          <p>{x.verifyBody}</p>
          <p className="font-bold">{dialog.verify.name}</p>
          <TextArea label={x.verifyNote} value={verifyNote} onChange={setVerifyNote} rows={2} maxLength={500} required />
        </ConfirmDialog>
      )}
    </>
  );
}

const ROW_KEYS = ["match", "q"] as const;

function Rows({ id }: { id: string }) {
  const { t, locale } = useLocale();
  const x = t.sdi;
  const c = x.rowCols;
  const { values: f, page, set, clear, active } = useUrlState(ROW_KEYS);
  const query = { ...cleanQuery({ matchStatus: f.match, search: f.q }), page, pageSize: 50 };
  const rows = useQuery({ queryKey: ["sdi", "rows", id, query], queryFn: () => svc.listReportRows(id, query), placeholderData: (prev) => prev });
  const columns = useMemo<Column<ReportRow>[]>(
    () => [
      { key: "row", header: c.row, numeric: true, cell: (r) => <span className="num">{r.rowNumber}</span> },
      { key: "order", header: c.order, cell: (r) => (r.sourceOrderId ? <Ref className="text-xs">{r.sourceOrderId}</Ref> : "—") },
      {
        key: "ref",
        header: c.reference,
        cell: (r) => (
          <span className="block">
            {r.bookingReference ? <Ref>{r.bookingReference}</Ref> : "—"}
            {r.bookingReferenceRaw && r.bookingReferenceRaw !== r.bookingReference && <span className="block text-xs text-muted">{c.typed}: <bdi dir="ltr">{r.bookingReferenceRaw}</bdi></span>}
          </span>
        ),
      },
      { key: "type", header: c.type, cell: (r) => <bdi>{r.ticketType ?? "—"}</bdi> },
      { key: "qty", header: c.qty, numeric: true, cell: (r) => (r.quantity === null ? "—" : <span className="num">{r.quantity}</span>) },
      { key: "amount", header: c.amount, numeric: true, cell: (r) => (r.amount ? <Money value={r.amount} currency={r.currency ?? "USD"} /> : "—") },
      { key: "refunded", header: c.refunded, numeric: true, cell: (r) => (r.refundedAmount && r.refundedAmount !== "0.00" ? <Money value={r.refundedAmount} currency={r.currency ?? "USD"} /> : "—") },
      { key: "sdi", header: c.sdiStatus, cell: (r) => <span className="text-xs"><bdi dir="ltr">{r.statusRaw ?? "—"}</bdi>{r.status && r.status !== "UNKNOWN" ? ` → ${r.status}` : ""}</span> },
      { key: "date", header: c.date, cell: (r) => <DateText value={r.occurredAt} /> },
      { key: "result", header: c.result, cell: (r) => <RowBadge status={r.matchStatus} /> },
      { key: "note", header: c.note, cell: (r) => <span className="line-clamp-3 text-xs text-body">{r.matchNote ?? "—"}</span> },
      { key: "applied", header: c.applied, cell: (r) => (r.applied ? "✓" : "—") },
      { key: "booking", header: c.booking, cell: (r) => (r.booking ? <Link className="text-xs font-bold text-meki-green-dark underline-offset-4 hover:underline" href={`/${locale}/gala/bookings/${r.booking.id}`}>{r.booking.publicReference}</Link> : "—") },
    ],
    [c, locale],
  );
  return (
    <Card labelledBy="sd-rows">
      <CardHeader id="sd-rows" title={x.rows} />
      <FilterBar active={active} onClear={clear}>
        <SearchFilter value={f.q} onChange={(v) => set({ q: v })} label={x.rowSearch} />
        <SelectFilter label={x.rowFilter} allLabel={t.content.common.anyStatus} value={f.match} onChange={(v) => set({ match: v })} options={ROW_STATUSES.map((k) => ({ value: k, label: x.rowStatuses[k] }))} />
      </FilterBar>
      <WidgetState q={rows} isEmpty={(rows.data?.items.length ?? 0) === 0} emptyText={x.noRows} minH="min-h-40">
        <DataTable caption={x.rows} rows={rows.data?.items ?? []} columns={columns} rowKey={(r) => r.id} dimmed={rows.isPlaceholderData} minW="min-w-[96rem]" />
        <Pagination page={rows.data?.page ?? 1} totalPages={rows.data?.totalPages ?? 1} total={rows.data?.total ?? 0} onPage={(p) => set({ page: p })} />
      </WidgetState>
    </Card>
  );
}
