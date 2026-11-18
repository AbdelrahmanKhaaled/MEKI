"use client";

import Link from "next/link";
import { useState } from "react";
import { Ban, Pause, Play } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { EmptyState, ErrorState, WidgetSkeleton, WidgetState } from "@/components/common/States";
import { ConfirmDialog, DataTable, DateText, DetailGrid, GateNotice, Money, Notice, PageHeader, Ref, StatusBadge, TestBadge, useErrorText } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useChangeRecurring, useEntityAudit, useRecurring } from "@/hooks/useFinanceData";
import { recurringActions, recurringCollected, type RecurringAction } from "@/lib/finance";
import type { RecurringDetail } from "@/lib/finance-schemas";
import { formatNumber } from "@/lib/format";
import { fill } from "@/lib/i18n";
import { FinancePage, useBackHref, useHref } from "../FinancePage";
import { AuditList } from "../shared";
import { useFrequencyText } from "./RecurringListPage";

export function RecurringDetailPage({ id }: { id: string }) {
  const { t } = useLocale();
  const href = useHref();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.donors }, { label: t.fin.recurring.title, href: href("/recurring") }, { label: t.fin.agreement.details }]} anyOf={["recurring.read"]}>
      <Agreement id={id} />
    </FinancePage>
  );
}

function Agreement({ id }: { id: string }) {
  const { locale, t } = useLocale();
  const href = useHref();
  const { can } = useAuth();
  const freq = useFrequencyText();
  const q = useRecurring(id);
  const backHref = useBackHref("/recurring");
  if (q.isPending) return <WidgetSkeleton rows={6} minH="min-h-80" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} minH="min-h-80" />;
  const r = q.data;
  const x = t.fin.agreement;
  const c = recurringCollected(r.paymentHistory, r.currency, r.isTest);
  const des = r.campaign ? r.campaign.titleEn : r.programme ? r.programme.nameEn : null;
  const desKind = r.designation === "CAMPAIGN" ? t.fin.common.campaign : r.designation === "PROGRAMME" ? t.fin.common.programme : t.fin.common.generalFund;
  return (
    <>
      <PageHeader
        back={{ href: backHref, label: t.fin.recurring.title }}
        title={<Ref className="!text-2xl font-bold sm:!text-3xl">{r.reference}</Ref>}
        badges={<><StatusBadge kind="recurring" status={r.status} /><TestBadge show={r.isTest} /></>}
        subtitle={t.fin.recurring.subtitle}
      />
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="min-w-0 space-y-4 xl:col-span-8">
          <Card labelledBy="ag-t">
            <CardHeader id="ag-t" title={x.details} />
            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-gradient-to-br from-[#e9eeec] to-white p-4">
                <p className="text-sm font-bold text-body">{x.commitment}</p>
                <p className="mt-1 font-serif text-2xl text-ink"><Money value={r.amount} currency={r.currency} /></p>
                <p className="text-xs text-muted">{freq(r)}</p>
              </div>
              <div className="rounded-xl border border-line bg-gradient-to-br from-[#d9efe4] to-white p-4" data-testid="agreement-collected">
                <p className="text-sm font-bold text-body">{x.collected}</p>
                {c.collected === null ? (
                  <p className="mt-1 text-sm text-gold-text">{x.collectedTest}</p>
                ) : (
                  <p className="mt-1 font-serif text-2xl text-deep-green"><Money value={c.collected} currency={r.currency} /></p>
                )}
                <p className="text-xs text-muted">
                  {fill(x.captured, { n: formatNumber(c.capturedCount, locale) })}
                  {c.notCaptured > 0 && <> · {fill(x.notCaptured, { n: formatNumber(c.notCaptured, locale) })}</>}
                </p>
              </div>
            </div>
            <DetailGrid
              items={[
                [x.designation, des ? <span key="d"><bdi>{des}</bdi> <span className="text-xs text-muted">({desKind})</span></span> : desKind],
                [t.fin.common.provider, <Ref key="p">{r.provider}</Ref>],
                [x.providerRef, r.providerAgreementRef ? <Ref key="pr">{r.providerAgreementRef}</Ref> : "—"],
                [x.start, <DateText key="s" value={r.startDate} withTime={false} />],
                [x.next, <DateText key="n" value={r.nextBillingDate} withTime={false} />],
                [x.last, <DateText key="l" value={r.lastChargedAt} />],
                [x.failed, <span key="f" className="num">{r.failedAttemptCount} / {r.maxRetryAttempts}</span>],
                [x.paused, <DateText key="pa" value={r.pausedAt} />],
                [x.cancelled, <DateText key="ca" value={r.cancelledAt} />],
                [x.cancelReason, r.cancelReason ? <bdi key="cr">{r.cancelReason}</bdi> : "—"],
                [t.fin.common.created, <DateText key="cr2" value={r.createdAt} />],
              ]}
            />
            {can("donors.read") && <Link href={href(`/donors/${r.donorId}`)} className="btn-admin btn-ghost mt-5">{x.donorLink}</Link>}
          </Card>
          <History r={r} />
        </div>
        <div className="min-w-0 space-y-4 xl:col-span-4">
          <Actions r={r} />
          <AgreementAudit id={r.id} />
        </div>
      </div>
    </>
  );
}

function History({ r }: { r: RecurringDetail }) {
  const { t } = useLocale();
  const href = useHref();
  const { can } = useAuth();
  const x = t.fin.agreement;
  return (
    <Card labelledBy="hi-t">
      <CardHeader id="hi-t" title={x.history} />
      {r.paymentHistory.length === 0 ? (
        <EmptyState text={x.historyEmpty} minH="min-h-24" />
      ) : (
        <DataTable
          caption={x.history}
          minW="min-w-[40rem]"
          rows={r.paymentHistory}
          rowKey={(p) => p.id}
          columns={[
            { key: "ref", header: t.fin.donations.cols.reference, cell: (p) => (can("donations.read") ? <Link href={href(`/donations/${p.id}`)} className="text-meki-green-dark hover:underline"><Ref className="font-bold">{p.reference}</Ref></Link> : <Ref>{p.reference}</Ref>) },
            { key: "amt", header: t.fin.common.amount, numeric: true, cell: (p) => <Money value={p.amount} currency={p.currency} /> },
            { key: "ps", header: t.fin.donations.cols.paymentStatus, cell: (p) => <StatusBadge kind="payment" status={p.paymentStatus} /> },
            { key: "st", header: t.fin.donation.status, cell: (p) => <StatusBadge kind="donation" status={p.status} /> },
            { key: "date", header: t.fin.common.date, cell: (p) => <DateText value={p.confirmedAt ?? p.createdAt} /> },
          ]}
        />
      )}
    </Card>
  );
}

const ICON: Record<RecurringAction, typeof Pause> = { pause: Pause, resume: Play, cancel: Ban };

function Actions({ r }: { r: RecurringDetail }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const x = t.fin.agreement;
  const errText = useErrorText();
  const m = useChangeRecurring(r.id);
  const [dialog, setDialog] = useState<RecurringAction | null>(null);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const canManage = can("recurring.manage");
  const actions = recurringActions(r.status);
  const close = () => { m.reset(); setDialog(null); setReason(""); };
  const titles: Record<RecurringAction, string> = { pause: x.confirmPause, resume: x.confirmResume, cancel: x.confirmCancel };
  const labels: Record<RecurringAction, string> = { pause: x.pause, resume: x.resume, cancel: x.cancel };
  return (
    <Card labelledBy="ra-t">
      <CardHeader id="ra-t" title={x.actions} />
      {done && <p className="mb-3 rounded-lg bg-ok/10 p-3 text-sm text-ok" role="status">{done}</p>}
      {actions.length === 0 ? (
        <p className="text-sm text-muted">{x.noActions}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => {
              const Icon = ICON[a];
              return (
                <button key={a} type="button" className={`btn-admin ${a === "cancel" ? "btn-ghost text-danger" : "btn-ghost"}`} disabled={!canManage} onClick={() => setDialog(a)}>
                  <Icon className="size-4" aria-hidden="true" /> {labels[a]}
                </button>
              );
            })}
          </div>
          <GateNotice gate={{ allowed: canManage, reasons: canManage ? [] : ["permission"] }} />
          {canManage && <p className="mt-3 text-xs text-muted">{x.actionBody}</p>}
        </>
      )}
      {dialog && (
        <ConfirmDialog
          open
          title={fill(titles[dialog], { ref: r.reference })}
          confirmLabel={labels[dialog]}
          danger={dialog === "cancel"}
          busy={m.isPending}
          error={m.isError ? errText(m.error) : null}
          confirmDisabled={dialog === "cancel" && reason.trim().length < 3}
          onClose={close}
          onConfirm={() => m.mutate({ action: dialog, reason: dialog === "cancel" ? reason.trim() : undefined }, { onSuccess: (res) => { close(); setDone(`${t.fin.common.serverConfirmed} ${t.fin.statuses.recurring[res.status] ?? res.status}.`); } })}
        >
          <p>{x.actionBody}</p>
          {r.isTest && <Notice tone="gold">{t.fin.common.testHint}</Notice>}
          {dialog === "cancel" && (
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-muted">{x.cancelReasonInput}</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-meki-green" />
              {reason.length > 0 && reason.trim().length < 3 && <span className="mt-1 block text-xs text-danger" role="alert">{x.reasonShort}</span>}
            </label>
          )}
        </ConfirmDialog>
      )}
    </Card>
  );
}

function AgreementAudit({ id }: { id: string }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const allowed = can("audit.read");
  const q = useEntityAudit("RecurringDonation", id, allowed);
  return (
    <Card labelledBy="aa-t">
      <CardHeader id="aa-t" title={t.fin.refund.audit} />
      <WidgetState q={q} unavailable={!allowed ? { text: t.fin.donation.auditLocked, locked: true } : false} minH="min-h-24">
        <AuditList items={q.data ?? []} emptyText={t.fin.refund.auditEmpty} />
      </WidgetState>
    </Card>
  );
}
