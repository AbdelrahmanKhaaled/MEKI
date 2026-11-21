"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CircleSlash } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { TextArea, TextInput } from "@/components/content/ui";
import { ConfirmDialog, DataTable, DateText, DetailGrid, Money, Notice, PageHeader, Ref, TestBadge } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import type { IntentDetail } from "@/lib/giving-schemas";
import * as svc from "@/services/giving";
import { FinancePage, useDetailHref } from "../finance/FinancePage";
import { Pill, useGivingError } from "./GivingIntentsPage";

/** Phase 14 — one hosted donation intent: the donor's original choice, SDI evidence, audit history and the allocation decision. */
export function GivingIntentDetailPage({ id }: { id: string }) {
  const { t } = useLocale();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.donors }, { label: t.giving.title }]} anyOf={["donations.read"]}>
      <Detail id={id} />
    </FinancePage>
  );
}

function Detail({ id }: { id: string }) {
  const href = useDetailHref();
  const q = useQuery({ queryKey: ["giving", "intent", id], queryFn: () => svc.getIntent(id) });
  return (
    <WidgetState q={q} minH="min-h-64">
      {q.data && <Body d={q.data} back={href("/giving-intents")} />}
    </WidgetState>
  );
}

function Body({ d, back }: { d: IntentDetail; back: string }) {
  const { t, locale } = useLocale();
  const { can } = useAuth();
  const x = t.giving;
  return (
    <>
      <PageHeader title={<Ref className="font-bold">{d.reference}</Ref>} subtitle={x.types[d.intentType]} back={{ href: back, label: x.detail.back }} badges={<TestBadge show={d.isTest} />} />
      <Card labelledBy="gid-f">
        <CardHeader id="gid-f" title={x.detail.facts} subtitle={x.detail.original} />
        <DetailGrid
          items={[
            [x.cols.classification, <Pill key="c" value={d.classification} label={x.classes[d.classification ?? ""] ?? "—"} />],
            [x.cols.designation, <bdi key="d">{x.designation[d.designation.type ?? ""] ?? "—"}{d.designation.name ? ` · ${d.designation.name}` : ""}</bdi>],
            [x.cols.amount, <Money key="a" value={d.amount} currency={d.currency} className="font-bold" />],
            [x.cols.reported, d.reportedAmount ? <Money key="r" value={d.reportedAmount} currency={d.currency} /> : "—"],
            [x.cols.verification, <Pill key="v" value={d.reconciliationStatus} label={x.recon[d.reconciliationStatus ?? ""] ?? "—"} />],
            [x.cols.allocation, <Pill key="al" value={d.allocationStatus} label={x.allocation[d.allocationStatus ?? ""] ?? "—"} />],
            [x.cols.order, d.externalPaymentId ? <Ref key="o">{d.externalPaymentId}</Ref> : "—"],
            [x.detail.payout, <span key="p" className="text-sm text-muted">{x.detail.payoutNote}</span>],
            [x.cols.created, <DateText key="t" value={d.createdAt} />],
            ...(d.donor ? ([[x.cols.donor, <bdi key="dn">{d.donor.name} · {d.donor.email}</bdi>]] as [string, React.ReactNode][]) : []),
          ]}
        />
      </Card>

      <Allocation d={d} />
      {d.interest && <p className="text-sm">{locale === 'ar' ? 'مجال الاهتمام فقط، وليس تخصيصًا للأموال' : 'Area of interest only; funds support the approved Gala project'}: <bdi>{d.interest.name ?? d.interest.kind}</bdi></p>}
      {can('sdi.reports.upload') && <Link className="min-h-11 underline" href={`/${locale}/payments/sdi-evidence`}>{locale === 'ar' ? 'أدلة مدفوعات SDI' : 'SDI payment evidence'}</Link>}

      <Card labelledBy="gid-e">
        <CardHeader id="gid-e" title={x.detail.evidence} />
        {d.evidence.providerPayment && (
          <p className="mb-3 text-sm">
            {x.detail.provider}: <Ref>{d.evidence.providerPayment.orderId}</Ref> · <Money value={d.evidence.providerPayment.amount} currency="USD" /> · {d.evidence.providerPayment.status} · {d.evidence.providerPayment.matchReason}
          </p>
        )}
        {d.evidence.reportRows.length === 0 ? (
          <p className="text-sm text-muted">{x.detail.evidenceEmpty}</p>
        ) : (
          <DataTable
            caption={x.detail.evidence}
            rows={d.evidence.reportRows}
            rowKey={(r) => `${r.importId}-${r.rowNumber}`}
            columns={[
              { key: "f", header: x.detail.rowCols.file, cell: (r) => <span className="text-xs"><bdi>{r.fileName}</bdi>{r.synthetic && <TestBadge show />}</span> },
              { key: "n", header: x.detail.rowCols.row, numeric: true, cell: (r) => r.rowNumber },
              { key: "o", header: x.detail.rowCols.order, cell: (r) => (r.sourceOrderId ? <Ref>{r.sourceOrderId}</Ref> : "—") },
              { key: "a", header: x.detail.rowCols.amount, numeric: true, cell: (r) => (r.amount ? <Money value={r.amount} currency={r.currency ?? "USD"} /> : "—") },
              { key: "t", header: x.detail.rowCols.type, cell: (r) => <bdi>{r.donationTypeRaw ?? "—"}</bdi> },
              { key: "d", header: x.detail.rowCols.designation, cell: (r) => <bdi>{r.designationRaw ?? "—"}</bdi> },
              { key: "m", header: x.detail.rowCols.result, cell: (r) => <span className="text-xs"><span className="font-bold">{r.matchStatus}</span>{r.matchNote ? ` — ${r.matchNote}` : ""}</span> },
              { key: "p", header: x.detail.rowCols.applied, cell: (r) => (r.applied ? <DateText value={r.appliedAt} /> : "—") },
            ]}
          />
        )}
      </Card>

      <Card labelledBy="gid-h">
        <CardHeader id="gid-h" title={x.detail.history} />
        <ol className="space-y-2 text-sm">
          {d.history.map((h, i) => (
            <li key={`${h.action}-${i}`} className="flex flex-wrap gap-2">
              <DateText value={h.at} /> <span className="font-mono text-xs">{h.action}</span>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}

function Allocation({ d }: { d: IntentDetail }) {
  const { t } = useLocale();
  const x = t.giving.detail;
  const { can } = useAuth();
  const qc = useQueryClient();
  const errText = useGivingError();
  const [fund, setFund] = useState(d.designation.name ?? "");
  const [note, setNote] = useState("");
  const [dialog, setDialog] = useState<null | "AUTHORIZE" | "REJECT">(null);
  const m = useMutation({
    mutationFn: (decision: "AUTHORIZE" | "REJECT") => svc.decideAllocation(d.id, { decision, ...(decision === "AUTHORIZE" ? { fund: fund.trim() } : {}), note: note.trim() }),
    onSuccess: () => {
      setDialog(null);
      void qc.invalidateQueries({ queryKey: ["giving"] });
    },
  });
  const verified = d.reconciliationStatus === "VERIFIED" && d.paymentStatus === "PAID";
  const decided = d.allocationStatus !== "PENDING_AUTHORIZATION";
  return (
    <Card labelledBy="gid-a">
      <CardHeader id="gid-a" title={x.allocationTitle} subtitle={x.allocationHelp} />
      {decided ? (
        <p className="text-sm" data-testid="allocation-decided">
          {x.decided}: <span className="font-bold">{t.giving.allocation[d.allocationStatus ?? ""]}</span>
          {d.authorizedFund ? <> · <bdi>{d.authorizedFund}</bdi></> : null} · <DateText value={d.allocationDecidedAt} />
        </p>
      ) : !verified ? (
        <Notice tone="warn"><p>{x.notVerified}</p></Notice>
      ) : can("donations.allocate") ? (
        <div className="space-y-3">
          <TextInput label={x.fund} value={fund} onChange={setFund} maxLength={160} />
          <TextArea label={x.note} value={note} onChange={setNote} rows={2} maxLength={500} required />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-admin btn-primary" disabled={fund.trim().length < 3 || note.trim().length < 3} onClick={() => setDialog("AUTHORIZE")}><BadgeCheck className="size-4" aria-hidden="true" /> {x.authorize}</button>
            <button type="button" className="btn-admin btn-ghost text-danger" disabled={note.trim().length < 3} onClick={() => setDialog("REJECT")}><CircleSlash className="size-4" aria-hidden="true" /> {x.reject}</button>
          </div>
        </div>
      ) : null}
      {dialog && (
        <ConfirmDialog open danger={dialog === "REJECT"} title={x.confirmTitle} confirmLabel={dialog === "AUTHORIZE" ? x.authorize : x.reject} busy={m.isPending} error={m.isError ? errText(m.error) : null} onClose={() => { m.reset(); setDialog(null); }} onConfirm={() => m.mutate(dialog)}>
          <p>{x.confirmBody}</p>
        </ConfirmDialog>
      )}
    </Card>
  );
}
