"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CheckCircle2, CircleSlash, Upload } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { Checkbox, Select, TextArea } from "@/components/content/ui";
import { ConfirmDialog, DataTable, DateText, DetailGrid, FilterBar, Notice, PageHeader, Pagination, SelectFilter, type Column } from "@/components/finance/ui";
import { FinancePage } from "@/features/finance/FinancePage";
import { useUrlState } from "@/hooks/useUrlState";
import { cleanQuery } from "@/lib/finance";
import { REPORT_KINDS, REPORT_STATUSES, type ReportImport } from "@/lib/sdi-schemas";
import { uploadProblem } from "@/lib/sdi";
import * as svc from "@/services/sdi";
import { GalaSdiTotals } from "@/features/gala/GalaSdiTotals";
import { ReportBadge, SyntheticBadge, useSdiError } from "./shared";

const KEYS = ["kind", "status"] as const;

export function SdiReportsPage() {
  const { t } = useLocale();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.donors }, { label: t.sdi.title }]} anyOf={["sdi.reports.upload"]}>
      <Reports />
    </FinancePage>
  );
}

function Reports() {
  const { t, locale } = useLocale();
  const x = t.sdi;
  const { values: f, page, set, clear, active } = useUrlState(KEYS);
  const status = useQuery({ queryKey: ["sdi", "status"], queryFn: svc.getSdiStatus });
  const query = { ...cleanQuery({ kind: f.kind, status: f.status }), page, pageSize: 25 };
  const list = useQuery({ queryKey: ["sdi", "reports", query], queryFn: () => svc.listReports(query), placeholderData: (prev) => prev });
  const [uploading, setUploading] = useState(false);
  const s = status.data;
  const flag = (b: boolean, on = x.on, off = x.off) => (b ? <span className="inline-flex items-center gap-1 text-ok"><CheckCircle2 className="size-4" aria-hidden="true" /> {on}</span> : <span className="inline-flex items-center gap-1 text-muted"><CircleSlash className="size-4" aria-hidden="true" /> {off}</span>);

  const columns = useMemo<Column<ReportImport>[]>(
    () => [
      { key: "uploaded", header: x.cols.uploaded, cell: (r) => <DateText value={r.uploadedAt} /> },
      { key: "file", header: x.cols.file, cell: (r) => <span className="flex flex-wrap items-center gap-2"><Link className="font-bold text-meki-green-dark underline-offset-4 hover:underline" href={`/${locale}/payments/sdi-reconciliation/${r.id}`}><bdi dir="ltr">{r.fileName}</bdi></Link>{r.isSynthetic && <SyntheticBadge />}</span> },
      { key: "kind", header: x.cols.kind, cell: (r) => x.kinds[r.kind] },
      { key: "status", header: x.cols.status, cell: (r) => <ReportBadge status={r.status} /> },
      { key: "rows", header: x.cols.rows, numeric: true, cell: (r) => <span className="num">{r.rowCount}</span> },
      { key: "accepted", header: x.cols.accepted, numeric: true, cell: (r) => (r.status === "UPLOADED" ? "—" : <span className="num">{r.acceptedCount}</span>) },
      { key: "rejected", header: x.cols.rejected, numeric: true, cell: (r) => (r.status === "UPLOADED" ? "—" : <span className="num">{r.rejectedCount}</span>) },
      { key: "period", header: x.cols.period, cell: (r) => (r.periodFrom ? <span className="whitespace-nowrap"><DateText value={r.periodFrom} withTime={false} /> – <DateText value={r.periodTo} withTime={false} /></span> : "—") },
    ],
    [x, locale],
  );

  return (
    <>
      <PageHeader title={x.title} subtitle={x.subtitle} right={<button type="button" className="btn-admin btn-primary" onClick={() => setUploading(true)} data-testid="sdi-upload"><Upload className="size-4" aria-hidden="true" /> {x.upload}</button>} />
      <Card labelledBy="sdi-s">
        <CardHeader id="sdi-s" title={x.status} />
        <WidgetState q={status} minH="min-h-40">
          {s && (
            <div className="space-y-4" data-testid="sdi-status">
              <DetailGrid
                items={[
                  [x.mode, s.mode ? x.modes[s.mode] : "—"],
                  [x.galaSales, flag(s.galaHostedSalesEnabled)],
                  [x.galaForm, flag(s.galaFormConfigured, x.configured, x.missing)],
                  [x.generalGiving, flag(s.generalGivingEnabled)],
                  [x.programmeGiving, flag(s.programmeGivingEnabled)],
                  [x.designation, flag(s.programmeDesignationConfirmed, x.yes, x.no)],
                  [x.applyEnabled, flag(s.applyEnabled)],
                  [x.lastApplied, s.lastAppliedReport ? <span key="l" className="inline-flex flex-wrap items-center gap-2"><DateText value={s.lastAppliedReport.appliedAt} />{s.lastAppliedReport.isSynthetic && <SyntheticBadge />}</span> : x.never],
                  [x.awaiting, <span key="a" className="num">{s.importsAwaitingAction}</span>],
                  [x.review, <span key="r" className={`num ${s.rowsRequiringReview ? "font-bold text-warn" : ""}`}>{s.rowsRequiringReview}</span>],
                  [x.missingDays, s.missingBusinessDays.length ? <span key="m" className="text-warn" dir="ltr">{s.missingBusinessDays.slice(0, 10).join(", ")}{s.missingBusinessDays.length > 10 ? " …" : ""}</span> : "—"],
                ]}
              />
              {s.galaTotals && <GalaSdiTotals totals={s.galaTotals} />}
              <Notice><p>{x.noApi}</p></Notice>
              {!s.applyEnabled && <Notice tone="gold"><p>{x.applyOff}</p></Notice>}
              <p className="text-xs text-muted">{x.separation}</p>
            </div>
          )}
        </WidgetState>
      </Card>
      <Card labelledBy="sdi-r">
        <CardHeader id="sdi-r" title={x.reports} />
        <FilterBar active={active} onClear={clear}>
          <SelectFilter label={x.kindFilter} allLabel={t.content.common.anyStatus} value={f.kind} onChange={(v) => set({ kind: v })} options={REPORT_KINDS.map((k) => ({ value: k, label: x.kinds[k] }))} />
          <SelectFilter label={x.statusFilter} allLabel={t.content.common.anyStatus} value={f.status} onChange={(v) => set({ status: v })} options={REPORT_STATUSES.map((k) => ({ value: k, label: x.statuses[k] }))} />
        </FilterBar>
        <WidgetState q={list} isEmpty={(list.data?.items.length ?? 0) === 0} emptyText={active ? x.emptyFiltered : x.empty} minH="min-h-40">
          <DataTable caption={x.reports} rows={list.data?.items ?? []} columns={columns} rowKey={(r) => r.id} dimmed={list.isPlaceholderData} minW="min-w-[60rem]" />
          <Pagination page={list.data?.page ?? 1} totalPages={list.data?.totalPages ?? 1} total={list.data?.total ?? 0} onPage={(p) => set({ page: p })} />
        </WidgetState>
      </Card>
      {uploading && <UploadDialog onClose={() => setUploading(false)} />}
    </>
  );
}

function UploadDialog({ onClose }: { onClose: () => void }) {
  const { t, locale } = useLocale();
  const x = t.sdi;
  const router = useRouter();
  const qc = useQueryClient();
  const errText = useSdiError();
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<"RECONCILIATION" | "ATTENDEES">("RECONCILIATION");
  const [synthetic, setSynthetic] = useState(false);
  const [notes, setNotes] = useState("");
  const [progress, setProgress] = useState(0);
  const problem = uploadProblem(file);
  const up = useMutation({
    mutationFn: () => svc.uploadReport(file!, kind, synthetic, notes, setProgress),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["sdi"] });
      router.push(`/${locale}/payments/sdi-reconciliation/${r.id}`);
    },
  });
  return (
    <ConfirmDialog open title={x.uploadTitle} confirmLabel={x.upload} busy={up.isPending} error={up.isError ? errText(up.error) : null} confirmDisabled={!!problem} onClose={() => { up.reset(); onClose(); }} onConfirm={() => up.mutate()}>
      <p className="text-sm text-body">{x.uploadBody}</p>
      <Select label={x.kind} value={kind} onChange={(v) => setKind(v as typeof kind)} options={REPORT_KINDS.map((k) => ({ value: k, label: x.kinds[k] }))} required />
      <label className="block text-sm font-bold text-ink">
        {x.file}
        <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="mt-2 block w-full text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-describedby="sdi-file-hint" data-testid="sdi-file" />
      </label>
      {file && problem && problem !== "none" && <p id="sdi-file-hint" className="text-sm text-danger" role="alert">{x.fileProblems[problem]}</p>}
      <Checkbox label={x.isSynthetic} checked={synthetic} onChange={setSynthetic} />
      {kind === "ATTENDEES" && <Notice tone="gold"><p>{x.attendeesHint}</p></Notice>}
      <TextArea label={x.notes} value={notes} onChange={setNotes} rows={2} maxLength={2000} />
      {up.isPending && <p className="text-sm text-body" role="status">{x.uploading} <span className="num">{Math.round(progress * 100)}%</span></p>}
    </ConfirmDialog>
  );
}
