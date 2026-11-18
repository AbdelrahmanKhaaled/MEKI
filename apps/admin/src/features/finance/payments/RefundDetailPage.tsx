"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Send, X } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { ErrorState, WidgetSkeleton, WidgetState } from "@/components/common/States";
import { ConfirmDialog, DateText, DetailGrid, GateNotice, Money, Notice, PageHeader, Ref, StatusBadge, TestBadge, useErrorText } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useDecideRefund, useDonation, useEntityAudit, useExecuteRefund, useProviders, useRefund } from "@/hooks/useFinanceData";
import { refundDecisionGate, refundExecuteGate } from "@/lib/finance";
import type { RefundDetail } from "@/lib/finance-schemas";
import { formatMoney } from "@/lib/format";
import { fill } from "@/lib/i18n";
import { FinancePage, useBackHref, useHref } from "../FinancePage";
import { AuditList } from "../shared";

export function RefundDetailPage({ id }: { id: string }) {
  const { t } = useLocale();
  const href = useHref();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.donors }, { label: t.fin.payments.title, href: href("/payments?tab=refunds") }, { label: t.fin.payments.tabs.refunds }]} anyOf={["donations.read"]}>
      <Refund id={id} />
    </FinancePage>
  );
}

function Refund({ id }: { id: string }) {
  const { t } = useLocale();
  const href = useHref();
  const q = useRefund(id);
  const backHref = useBackHref("/payments", "tab=refunds");
  // The refund endpoint does not say whether the donation is a test record — the donation does (same permission).
  const donation = useDonation(q.data?.donationId ?? "", !!q.data);
  if (q.isPending) return <WidgetSkeleton rows={6} minH="min-h-80" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} minH="min-h-80" />;
  const r = q.data;
  const x = t.fin.refund;
  const isTest = donation.data?.isTest ?? null;
  return (
    <>
      <PageHeader
        back={{ href: backHref, label: t.fin.payments.tabs.refunds }}
        title={<Ref className="!text-2xl font-bold sm:!text-3xl">{r.reference}</Ref>}
        badges={<><StatusBadge kind="refund" status={r.status} /><TestBadge show={!!isTest} /></>}
      />
      {r.status === "PROCESSING" && <Notice tone="gold">{x.processingNote}</Notice>}
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="min-w-0 space-y-4 xl:col-span-8">
          <Card labelledBy="rf-t">
            <CardHeader id="rf-t" title={x.refund} />
            <div className="mb-5 rounded-xl border border-line bg-gradient-to-br from-[#d8f0ea] to-white p-4">
              <p className="text-sm font-bold text-body">{x.amount}</p>
              <p className="mt-1 font-serif text-3xl text-deep-green"><Money value={r.amount} currency={r.currency} /></p>
            </div>
            <DetailGrid
              items={[
                [t.fin.common.status, <StatusBadge key="s" kind="refund" status={r.status} />],
                [t.fin.common.provider, r.provider ? <Ref key="p">{r.provider}</Ref> : "—"],
                [x.providerRef, r.providerRefundRef ? <Ref key="pr">{r.providerRefundRef}</Ref> : "—"],
                [x.requestedBy, <bdi key="rb">{r.requestedBy.name}</bdi>],
                [x.decidedBy, r.decidedBy ? <bdi key="db">{r.decidedBy.name}</bdi> : "—"],
                [x.decisionNote, r.decisionNote ? <bdi key="dn">{r.decisionNote}</bdi> : "—"],
                [x.failure, r.failureReason ? <bdi key="f" className="text-danger">{r.failureReason}</bdi> : "—"],
              ]}
            />
            <div className="mt-5 rounded-xl bg-bg p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">{x.reason}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-ink"><bdi>{r.reason}</bdi></p>
            </div>
          </Card>
          <Card labelledBy="tl-t">
            <CardHeader id="tl-t" title={x.timeline} />
            <DetailGrid
              cols={4}
              items={[
                [x.requestedAt, <DateText key="a" value={r.requestedAt} />],
                [x.decidedAt, <DateText key="b" value={r.decidedAt} />],
                [x.executedAt, <DateText key="c" value={r.executedAt} />],
                [x.completedAt, <DateText key="d" value={r.completedAt} />],
              ]}
            />
          </Card>
          <Actions r={r} isTest={isTest} />
        </div>
        <div className="min-w-0 space-y-4 xl:col-span-4">
          <Card labelledBy="or-t">
            <CardHeader id="or-t" title={x.original} />
            <DetailGrid
              cols={2}
              items={[
                [t.fin.common.donation, <Link key="d" href={href(`/donations/${r.donationId}`)} className="text-meki-green-dark hover:underline"><Ref className="font-bold">{r.donation.reference}</Ref></Link>],
                [x.donationAmount, <Money key="a" value={r.donation.amount} currency={r.donation.currency} />],
                [x.alreadyRefunded, <Money key="r" value={r.donation.refundedAmount} currency={r.donation.currency} />],
                [t.fin.donation.paymentStatus, donation.data ? <StatusBadge key="ps" kind="payment" status={donation.data.paymentStatus} /> : "…"],
              ]}
            />
          </Card>
          <RefundAudit id={r.id} />
        </div>
      </div>
    </>
  );
}

function Actions({ r, isTest }: { r: RefundDetail; isTest: boolean | null }) {
  const { locale, t } = useLocale();
  const { user, can } = useAuth();
  const x = t.fin.refund;
  const errText = useErrorText();
  const canPayments = can("payments.read");
  const providers = useProviders(canPayments);
  const provs = canPayments ? (providers.data ?? null) : null;
  const test = isTest ?? true; // unknown → treated as test: never enable money movement on missing information
  const approveG = refundDecisionGate({ decision: "approve", canApprove: can("refunds.approve"), status: r.status, requestedById: r.requestedById, userId: user?.id, isTest: test, provider: r.provider, providers: provs });
  const rejectG = refundDecisionGate({ decision: "reject", canApprove: can("refunds.approve"), status: r.status, requestedById: r.requestedById, userId: user?.id, isTest: test, provider: r.provider, providers: provs });
  const execG = refundExecuteGate({ canExecute: can("refunds.execute"), status: r.status, isTest: test, provider: r.provider, providers: provs });
  const decide = useDecideRefund(r.id);
  const exec = useExecuteRefund(r.id);
  const [dialog, setDialog] = useState<null | "approve" | "reject" | "execute">(null);
  const [note, setNote] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const close = () => { decide.reset(); exec.reset(); setDialog(null); setNote(""); };
  const ok = (status: string) => { close(); setDone(`${t.fin.common.serverConfirmed} ${t.fin.statuses.refund[status] ?? status}.`); };
  const amount = formatMoney(r.amount, r.currency, locale);
  const anyRelevant = ["REQUESTED", "APPROVED"].includes(r.status);
  return (
    <Card labelledBy="ac-t">
      <CardHeader id="ac-t" title={t.fin.common.actions} />
      {done && <p className="mb-3 rounded-lg bg-ok/10 p-3 text-sm text-ok" role="status">{done}</p>}
      {!anyRelevant ? (
        <p className="text-sm text-muted">{t.fin.gate.wrongState}</p>
      ) : (
        <div className="space-y-3">
          {r.status === "REQUESTED" && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-admin btn-primary" disabled={!approveG.allowed} onClick={() => setDialog("approve")}><Check className="size-4" aria-hidden="true" /> {x.approve}</button>
              <button type="button" className="btn-admin btn-ghost" disabled={!rejectG.allowed} onClick={() => setDialog("reject")}><X className="size-4" aria-hidden="true" /> {x.reject}</button>
            </div>
          )}
          {r.status === "APPROVED" && (
            <button type="button" className="btn-admin btn-primary" disabled={!execG.allowed} onClick={() => setDialog("execute")}><Send className="size-4" aria-hidden="true" /> {x.execute}</button>
          )}
          {r.status === "REQUESTED" && <GateNotice gate={approveG.allowed ? rejectG : approveG} />}
          {r.status === "APPROVED" && <GateNotice gate={execG} />}
        </div>
      )}
      {(dialog === "approve" || dialog === "reject") && (
        <ConfirmDialog
          open
          title={fill(dialog === "approve" ? x.approveTitle : x.rejectTitle, { ref: r.reference })}
          confirmLabel={dialog === "approve" ? x.approve : x.reject}
          danger={dialog === "reject"}
          busy={decide.isPending}
          error={decide.isError ? errText(decide.error) : null}
          onClose={close}
          onConfirm={() => decide.mutate({ decision: dialog, note: note.trim() || undefined }, { onSuccess: (res) => ok(res.status) })}
        >
          <p>{dialog === "approve" ? x.approveBody : x.rejectBody}</p>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-muted">{t.fin.common.note}</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-meki-green" />
          </label>
        </ConfirmDialog>
      )}
      {dialog === "execute" && (
        <ConfirmDialog open title={fill(x.executeTitle, { ref: r.reference })} confirmLabel={x.execute} busy={exec.isPending} error={exec.isError ? errText(exec.error) : null} onClose={close} onConfirm={() => exec.mutate(undefined, { onSuccess: (res) => ok(res.status) })}>
          <p>{fill(x.executeBody, { amount })}</p>
        </ConfirmDialog>
      )}
    </Card>
  );
}

function RefundAudit({ id }: { id: string }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const allowed = can("audit.read");
  const q = useEntityAudit("Refund", id, allowed);
  return (
    <Card labelledBy="ra-t">
      <CardHeader id="ra-t" title={t.fin.refund.audit} />
      <WidgetState q={q} unavailable={!allowed ? { text: t.fin.donation.auditLocked, locked: true } : false} minH="min-h-24">
        <AuditList items={q.data ?? []} emptyText={t.fin.refund.auditEmpty} />
      </WidgetState>
    </Card>
  );
}
