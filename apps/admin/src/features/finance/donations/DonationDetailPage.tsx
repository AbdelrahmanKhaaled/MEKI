"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink, Undo2 } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { EmptyState, ErrorState, WidgetSkeleton, WidgetState } from "@/components/common/States";
import { ConfirmDialog, DataTable, DateText, DetailGrid, GateNotice, Money, Notice, PageHeader, Ref, StatusBadge, TestBadge, useErrorText } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useCurrencies, useDonation, useProviders, useRelatedAudit, useRequestRefund } from "@/hooks/useFinanceData";
import { designationOf, donorName, isValidAmount, cmpMoney, receiptAvailability, refundableBalance, refundRequestGate } from "@/lib/finance";
import type { DonationDetail } from "@/lib/finance-schemas";
import { fill } from "@/lib/i18n";
import { receiptDocumentUrl } from "@/services/finance";
import { FinancePage, useBackHref, useHref } from "../FinancePage";
import { AuditList, frequencyLabel } from "../shared";

export function DonationDetailPage({ id }: { id: string }) {
  const { t } = useLocale();
  const href = useHref();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.donors }, { label: t.fin.donations.title, href: href("/donations") }, { label: t.fin.donation.summary }]} anyOf={["donations.read"]}>
      <DonationDetail id={id} />
    </FinancePage>
  );
}

function DonationDetail({ id }: { id: string }) {
  const { t } = useLocale();
  const q = useDonation(id);
  const backHref = useBackHref("/donations");
  if (q.isPending) return <WidgetSkeleton rows={6} minH="min-h-80" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} minH="min-h-80" />;
  const dn = q.data;
  return (
    <>
      <PageHeader
        back={{ href: backHref, label: t.fin.donations.title }}
        title={<Ref className="!text-2xl font-bold sm:!text-3xl">{dn.reference}</Ref>}
        badges={
          <>
            <StatusBadge kind="donation" status={dn.status} />
            <StatusBadge kind="payment" status={dn.paymentStatus} />
            <TestBadge show={dn.isTest} />
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="min-w-0 space-y-4 xl:col-span-8">
          <Summary dn={dn} />
          <Attempts dn={dn} />
          <Ledger dn={dn} />
          <Refunds dn={dn} />
        </div>
        <div className="min-w-0 space-y-4 xl:col-span-4">
          <DonorBox dn={dn} />
          <Receipts dn={dn} />
          {dn.recurringDonation && (
            <Card labelledBy="rc-t">
              <CardHeader id="rc-t" title={t.fin.donation.recurring} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Ref className="font-bold">{dn.recurringDonation.reference}</Ref>
                <StatusBadge kind="recurring" status={dn.recurringDonation.status} />
              </div>
              <RecurringLink id={dn.recurringDonation.id} />
            </Card>
          )}
          <Audit dn={dn} />
        </div>
      </div>
    </>
  );
}

function RecurringLink({ id }: { id: string }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const href = useHref();
  if (!can("recurring.read")) return null;
  return <Link href={href(`/recurring/${id}`)} className="mt-3 inline-block text-sm font-bold text-meki-green-dark hover:underline">{t.fin.common.viewDetails}</Link>;
}

function Summary({ dn }: { dn: DonationDetail }) {
  const { t } = useLocale();
  const x = t.fin.donation;
  const des = designationOf(dn.allocations);
  const a = dn.allocations[0];
  const utm = [dn.utm.source, dn.utm.medium, dn.utm.campaign].filter(Boolean).join(" · ");
  return (
    <Card labelledBy="sum-t">
      <CardHeader id="sum-t" title={x.summary} />
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([
          [x.gross, dn.amount, "from-[#d9efe4]"],
          [x.refunded, dn.refundedAmount, "from-[#f7dcd9]"],
          [x.net, dn.netAmount, "from-[#d8f0ea]"],
        ] as const).map(([label, v, bg]) => (
          <div key={label} className={`rounded-xl border border-line bg-gradient-to-br ${bg} to-white p-4`}>
            <p className="text-sm font-bold text-body">{label}</p>
            <p className="mt-1 font-serif text-2xl text-ink"><Money value={v} currency={dn.currency} /></p>
          </div>
        ))}
      </div>
      <DetailGrid
        items={[
          [t.fin.common.currency, <bdi key="c" dir="ltr">{dn.currency}</bdi>],
          [x.frequency, frequencyLabel(dn.frequency, t)],
          [x.designation, des.kind === "CAMPAIGN" ? t.fin.common.campaign : des.kind === "PROGRAMME" ? t.fin.common.programme : des.kind === "GENERAL_FUND" ? t.fin.common.generalFund : "—"],
          [x.campaign, a?.campaign ? <bdi key="ca">{a.campaign.titleEn}</bdi> : "—"],
          [x.programme, a?.programme ? <bdi key="pr">{a.programme.nameEn}</bdi> : "—"],
          [x.provider, dn.provider ? <Ref key="p">{dn.provider}</Ref> : x.noProvider],
          [x.status, <StatusBadge key="s" kind="donation" status={dn.status} />],
          [x.paymentStatus, <StatusBadge key="ps" kind="payment" status={dn.paymentStatus} />],
          [x.source, dn.source ? <Ref key="so">{dn.source}</Ref> : "—"],
          [x.event, dn.sourceEvent ? <bdi key="e">{dn.sourceEvent.titleEn}</bdi> : "—"],
          [x.utm, utm ? <Ref key="u">{utm}</Ref> : "—"],
          [t.fin.common.created, <DateText key="cr" value={dn.createdAt} />],
          [x.confirmedAt, dn.confirmedAt ? <DateText key="cf" value={dn.confirmedAt} /> : x.notConfirmed],
        ]}
      />
      {dn.donorMessage && (
        <div className="mt-5 rounded-xl bg-bg p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">{x.message}</p>
          <p className="mt-1 whitespace-pre-line text-sm text-ink"><bdi>{dn.donorMessage}</bdi></p>
        </div>
      )}
    </Card>
  );
}

function DonorBox({ dn }: { dn: DonationDetail }) {
  const { t } = useLocale();
  const href = useHref();
  const { can } = useAuth();
  const x = t.fin.donation;
  return (
    <Card labelledBy="dnr-t">
      <CardHeader id="dnr-t" title={x.donorTitle} />
      {!dn.donor ? (
        <EmptyState text={x.donorRestricted} minH="min-h-24" />
      ) : (
        <div className="space-y-4">
          <DetailGrid
            cols={2}
            items={[
              [t.fin.donor.name, <bdi key="n" className="font-bold">{donorName(dn.donor) ?? "—"}</bdi>],
              [x.email, dn.donor.email ? <Ref key="e">{dn.donor.email}</Ref> : "—"],
              [x.organization, dn.donor.organizationName ? <bdi key="o">{dn.donor.organizationName}</bdi> : "—"],
              [x.country, dn.donor.countryCode ? <bdi key="c" dir="ltr">{dn.donor.countryCode}</bdi> : "—"],
            ]}
          />
          {dn.isAnonymous && <Notice>{x.anonymousNote}</Notice>}
          {can("donors.read") && dn.donorId && (
            <Link href={href(`/donors/${dn.donorId}`)} className="btn-admin btn-ghost w-full justify-center">{t.fin.common.openDonor}</Link>
          )}
        </div>
      )}
    </Card>
  );
}

function Attempts({ dn }: { dn: DonationDetail }) {
  const { t } = useLocale();
  const x = t.fin.donation;
  return (
    <Card labelledBy="att-t">
      <CardHeader id="att-t" title={x.attempts} />
      {dn.attempts.length === 0 ? (
        <EmptyState text={x.attemptsEmpty} minH="min-h-24" />
      ) : (
        <DataTable
          caption={x.attempts}
          minW="min-w-[48rem]"
          rows={dn.attempts}
          rowKey={(r) => r.id}
          columns={[
            { key: "ref", header: x.attemptRef, cell: (r) => <span className="inline-flex flex-wrap gap-2"><Ref>{r.reference}</Ref><TestBadge show={r.isTest} /></span> },
            { key: "prov", header: t.fin.common.provider, cell: (r) => <Ref>{r.provider}</Ref> },
            { key: "st", header: t.fin.common.status, cell: (r) => <StatusBadge kind="attempt" status={r.status} /> },
            { key: "amt", header: t.fin.common.amount, numeric: true, cell: (r) => <Money value={r.amount} currency={r.currency} /> },
            { key: "ini", header: x.initiated, cell: (r) => <DateText value={r.initiatedAt} /> },
            { key: "done", header: x.completed, cell: (r) => <DateText value={r.completedAt} /> },
            { key: "fail", header: x.failure, cell: (r) => (r.failureCode || r.failureReason ? <span className="text-xs text-danger"><Ref>{r.failureCode ?? ""}</Ref> {r.failureReason ? <bdi>{r.failureReason}</bdi> : null}</span> : "—") },
          ]}
        />
      )}
    </Card>
  );
}

function Ledger({ dn }: { dn: DonationDetail }) {
  const { t } = useLocale();
  const x = t.fin.donation;
  return (
    <Card labelledBy="led-t">
      <CardHeader id="led-t" title={x.ledger} />
      {dn.transactions.length === 0 ? (
        <EmptyState text={x.ledgerEmpty} minH="min-h-24" />
      ) : (
        <DataTable
          caption={x.ledger}
          minW="min-w-[48rem]"
          rows={dn.transactions}
          rowKey={(r) => r.id}
          columns={[
            { key: "type", header: x.type, cell: (r) => <StatusBadge kind="txType" status={r.type} /> },
            { key: "st", header: t.fin.common.status, cell: (r) => <StatusBadge kind="tx" status={r.status} /> },
            { key: "amt", header: t.fin.common.amount, numeric: true, cell: (r) => <Money value={r.amount} currency={r.currency} /> },
            { key: "ref", header: x.providerRef, cell: (r) => <span className="inline-flex flex-wrap gap-2"><Ref>{r.providerTransactionRef}</Ref><TestBadge show={r.isTest} /></span> },
            { key: "fee", header: x.fee, numeric: true, cell: (r) => (r.feeAmount ? <Money value={r.feeAmount} currency={r.currency} /> : "—") },
            { key: "set", header: x.settlement, numeric: true, cell: (r) => (r.settlementAmount && r.settlementCurrency ? <Money value={r.settlementAmount} currency={r.settlementCurrency} /> : "—") },
            { key: "occ", header: x.occurred, cell: (r) => <DateText value={r.occurredAt} /> },
          ]}
        />
      )}
    </Card>
  );
}

function Refunds({ dn }: { dn: DonationDetail }) {
  const { t } = useLocale();
  const href = useHref();
  const { can } = useAuth();
  const x = t.fin.donation;
  const canPayments = can("payments.read");
  const providers = useProviders(canPayments);
  const g = refundRequestGate({ canRequest: can("refunds.request"), donation: dn, providers: canPayments ? (providers.data ?? null) : null });
  const balance = refundableBalance(dn.amount, dn.refundedAmount, dn.refunds);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  return (
    <Card labelledBy="rf-t">
      <CardHeader
        id="rf-t"
        title={x.refunds}
        subtitle={`${x.refundable}: `}
        right={
          <button type="button" className="btn-admin btn-ghost" disabled={!g.allowed} aria-disabled={!g.allowed} onClick={() => setOpen(true)}>
            <Undo2 className="size-4" aria-hidden="true" /> {x.requestRefund}
          </button>
        }
      />
      <p className="-mt-3 mb-4 text-sm"><Money value={balance} currency={dn.currency} className="font-bold" /></p>
      {canPayments && providers.isPending ? null : <GateNotice gate={g} />}
      {done && <p className="mt-3 rounded-lg bg-ok/10 p-3 text-sm text-ok" role="status">{done}</p>}
      <div className="mt-4">
        {dn.refunds.length === 0 ? (
          <EmptyState text={x.refundsEmpty} minH="min-h-20" />
        ) : (
          <DataTable
            caption={x.refunds}
            minW="min-w-[40rem]"
            rows={dn.refunds}
            rowKey={(r) => r.id}
            columns={[
              { key: "ref", header: t.fin.payments.refunds.reference, cell: (r) => <Link href={href(`/payments/refunds/${r.id}`)} className="text-meki-green-dark hover:underline"><Ref className="font-bold">{r.reference}</Ref></Link> },
              { key: "amt", header: t.fin.common.amount, numeric: true, cell: (r) => <Money value={r.amount} currency={r.currency} /> },
              { key: "st", header: t.fin.common.status, cell: (r) => <StatusBadge kind="refund" status={r.status} /> },
              { key: "req", header: x.requested, cell: (r) => <DateText value={r.requestedAt} /> },
              { key: "done", header: t.fin.payments.refunds.completed, cell: (r) => <DateText value={r.completedAt} /> },
            ]}
          />
        )}
      </div>
      {g.allowed && <RefundRequestDialog open={open} onClose={() => setOpen(false)} dn={dn} max={balance} onDone={(m) => { setOpen(false); setDone(m); }} />}
    </Card>
  );
}

function RefundRequestDialog({ open, onClose, dn, max, onDone }: { open: boolean; onClose: () => void; dn: DonationDetail; max: string; onDone: (msg: string) => void }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const f = t.fin.refundForm;
  const errText = useErrorText();
  const currencies = useCurrencies(can("settings.read"));
  const minor = currencies.data?.find((c) => c.code === dn.currency)?.minorUnits ?? 2;
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const m = useRequestRefund(dn.id);
  const amountOk = isValidAmount(amount, minor);
  const amountErr = !touched ? null : !amountOk ? fill(f.invalidAmount, { n: minor }) : cmpMoney(amount.trim(), max) > 0 ? f.tooMuch : null;
  const reasonErr = touched && reason.trim().length < 5 ? f.reasonShort : null;
  const valid = amountOk && cmpMoney(amount.trim(), max) <= 0 && reason.trim().length >= 5 && reason.trim().length <= 1000;
  return (
    <ConfirmDialog
      open={open}
      title={f.title}
      onClose={() => { m.reset(); onClose(); }}
      confirmLabel={f.submit}
      busy={m.isPending}
      error={m.isError ? errText(m.error) : null}
      onConfirm={() => {
        setTouched(true);
        if (!valid) return;
        m.mutate({ amount: amount.trim(), reason: reason.trim() }, { onSuccess: (r) => onDone(fill(f.done, { ref: r.reference, status: t.fin.statuses.refund[r.status] ?? r.status })) });
      }}
    >
      <p>{f.intro}</p>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-muted">{fill(f.amount, { currency: dn.currency })}</span>
        <input dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} onBlur={() => setTouched(true)} aria-invalid={!!amountErr} className="min-h-10 w-full rounded-xl border border-line px-3 text-sm outline-none focus:border-meki-green" />
        <span className="mt-1 block text-xs text-muted">{fill(f.amountHint, { max, currency: dn.currency })}</span>
        {amountErr && <span className="mt-1 block text-xs text-danger" role="alert">{amountErr}</span>}
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-muted">{f.reason}</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={3} aria-invalid={!!reasonErr} className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-meki-green" />
        {reasonErr && <span className="mt-1 block text-xs text-danger" role="alert">{reasonErr}</span>}
      </label>
    </ConfirmDialog>
  );
}

function Receipts({ dn }: { dn: DonationDetail }) {
  const { locale, t } = useLocale();
  const { can } = useAuth();
  const href = useHref();
  const x = t.fin.donation;
  const state = receiptAvailability(dn.paymentStatus, dn.receipts);
  const canReceipts = can("receipts.read");
  return (
    <Card labelledBy="rcp-t">
      <CardHeader id="rcp-t" title={x.receipts} />
      <p className="mb-3 text-sm text-body">{x.receipt[state]}</p>
      {dn.receipts.length > 0 && (
        <ul className="space-y-2">
          {dn.receipts.map((r) => (
            <li key={r.id} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {canReceipts ? (
                  <Link href={href(`/receipts/${r.id}`)} className="text-meki-green-dark hover:underline"><Ref className="font-bold">{r.receiptNumber}</Ref></Link>
                ) : (
                  <Ref className="font-bold">{r.receiptNumber}</Ref>
                )}
                <StatusBadge kind="receipt" status={r.status} />
              </div>
              <p className="mt-1 text-xs text-muted">
                {x.version} {r.version} · {x.issued} <DateText value={r.issuedAt} />
                {r.voidedAt && <> · {x.voided} <DateText value={r.voidedAt} /></>}
              </p>
              {canReceipts && r.status === "ISSUED" && (
                <a href={receiptDocumentUrl(r.id, locale)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-meki-green-dark hover:underline">
                  <ExternalLink className="size-3.5" aria-hidden="true" /> {x.viewDocument}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <Notice tone="gold">{t.fin.receipts.fiscal}</Notice>
      </div>
    </Card>
  );
}

function Audit({ dn }: { dn: DonationDetail }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const x = t.fin.donation;
  const allowed = can("audit.read");
  const entities = [
    ...dn.refunds.map((r) => ({ type: "Refund", id: r.id })),
    ...dn.receipts.map((r) => ({ type: "DonationReceipt", id: r.id })),
    ...(dn.recurringDonation ? [{ type: "RecurringDonation", id: dn.recurringDonation.id }] : []),
  ];
  const q = useRelatedAudit(entities, allowed);
  return (
    <Card labelledBy="aud-t">
      <CardHeader id="aud-t" title={x.audit} subtitle={x.auditNote} />
      <WidgetState q={q} unavailable={!allowed ? { text: x.auditLocked, locked: true } : entities.length === 0 ? { text: x.auditEmpty } : false} minH="min-h-24">
        <AuditList items={q.data} emptyText={x.auditEmpty} />
      </WidgetState>
    </Card>
  );
}
