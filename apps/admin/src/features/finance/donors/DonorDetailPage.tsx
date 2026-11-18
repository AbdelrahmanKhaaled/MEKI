"use client";

import Link from "next/link";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { EmptyState, ErrorState, WidgetSkeleton, WidgetState } from "@/components/common/States";
import { DataTable, DateText, DetailGrid, Money, Notice, PageHeader, Ref, StatusBadge, TestBadge } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useDonor, useEntityAudit } from "@/hooks/useFinanceData";
import { confirmedTotalsByCurrency, DONOR_HISTORY_LIMIT, donorName } from "@/lib/finance";
import type { DonorDetail } from "@/lib/finance-schemas";
import { formatDate, formatNumber } from "@/lib/format";
import { fill } from "@/lib/i18n";
import { FinancePage, useBackHref, useHref } from "../FinancePage";
import { AuditList, frequencyLabel } from "../shared";

export function DonorDetailPage({ id }: { id: string }) {
  const { t } = useLocale();
  const href = useHref();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.donors }, { label: t.fin.donors.title, href: href("/donors") }, { label: t.fin.donor.title }]} anyOf={["donors.read"]}>
      <Donor id={id} />
    </FinancePage>
  );
}

function Donor({ id }: { id: string }) {
  const { locale, t } = useLocale();
  const q = useDonor(id);
  const backHref = useBackHref("/donors");
  if (q.isPending) return <WidgetSkeleton rows={6} minH="min-h-80" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} minH="min-h-80" />;
  const d = q.data;
  const x = t.fin.donor;
  const address = [d.addressLine1, d.addressLine2, d.city, d.region, d.postalCode, d.countryCode].filter(Boolean).join(", ");
  return (
    <>
      <PageHeader
        back={{ href: backHref, label: t.fin.donors.title }}
        title={<bdi>{donorName(d) ?? "—"}</bdi>}
        badges={d.anonymizedAt ? <span className="rounded-full bg-bg px-2.5 py-1 text-xs font-bold text-body">{t.fin.donors.anonymized}</span> : undefined}
        subtitle={x.noEdit}
      />
      {d.anonymizedAt && <Notice>{fill(x.anonymizedOn, { date: formatDate(d.anonymizedAt, locale) })}</Notice>}
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="min-w-0 space-y-4 xl:col-span-8">
          <Totals d={d} />
          <History d={d} />
          <Recurring d={d} />
        </div>
        <div className="min-w-0 space-y-4 xl:col-span-4">
          <Card labelledBy="bi-t">
            <CardHeader id="bi-t" title={x.basic} />
            <DetailGrid
              cols={2}
              items={[
                [x.name, <bdi key="n">{`${d.firstName} ${d.lastName}`.trim()}</bdi>],
                [x.type, t.fin.donors.types[d.donorType] ?? d.donorType],
                [x.organization, d.organizationName ? <bdi key="o">{d.organizationName}</bdi> : "—"],
                [x.email, d.anonymizedAt ? "—" : <Ref key="e">{d.email}</Ref>],
                [x.phone, d.phone ? <bdi key="p" dir="ltr" className="num">{d.phone}</bdi> : "—"],
                [x.country, d.countryCode ? <bdi key="c" dir="ltr">{d.countryCode}</bdi> : "—"],
                [x.address, address ? <bdi key="a">{address}</bdi> : "—"],
                [t.fin.common.created, <DateText key="cr" value={d.createdAt} />],
              ]}
            />
          </Card>
          <Card labelledBy="cp-t">
            <CardHeader id="cp-t" title={x.comms} />
            <DetailGrid
              cols={2}
              items={[
                [x.locale, d.preferredLocale === "ar" ? "العربية" : d.preferredLocale === "en" ? "English" : <bdi key="l">{d.preferredLocale}</bdi>],
                [x.marketing, d.marketingConsent && d.marketingConsentAt ? fill(x.granted, { date: formatDate(d.marketingConsentAt, locale) }) : x.notGranted],
                [x.privacy, <DateText key="pv" value={d.privacyConsentAt} />],
                [x.policy, d.privacyPolicyVersion ? <Ref key="pp">{d.privacyPolicyVersion}</Ref> : "—"],
              ]}
            />
          </Card>
          <Card labelledBy="rc-t">
            <CardHeader id="rc-t" title={x.receipts} />
            <p className="text-sm text-body">{x.receiptsNote}</p>
          </Card>
          <Activity id={d.id} />
        </div>
      </div>
    </>
  );
}

function Totals({ d }: { d: DonorDetail }) {
  const { locale, t } = useLocale();
  const x = t.fin.donor;
  const totals = confirmedTotalsByCurrency(d.donations);
  const partial = d.donations.length >= DONOR_HISTORY_LIMIT;
  return (
    <Card labelledBy="tot-t">
      <CardHeader id="tot-t" title={x.totals} subtitle={x.totalsNote} />
      {totals.length === 0 ? (
        <EmptyState text={x.totalsEmpty} minH="min-h-24" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {totals.map((c) => (
            <div key={c.currency} className="rounded-xl border border-line bg-gradient-to-br from-[#e6f2ec] to-white p-4" data-testid={`donor-total-${c.currency}`}>
              <div className="flex items-center justify-between gap-2">
                <bdi dir="ltr" className="text-sm font-bold text-body">{c.currency}</bdi>
                <span className="num text-xs text-muted">{formatNumber(c.count, locale)} {x.count}</span>
              </div>
              <p className="mt-1 font-serif text-2xl text-deep-green"><Money value={c.net} currency={c.currency} /></p>
              <p className="mt-1 text-xs text-muted">
                {x.gross} <Money value={c.gross} currency={c.currency} /> · {x.refunded} <Money value={c.refunded} currency={c.currency} />
              </p>
            </div>
          ))}
        </div>
      )}
      {partial && <p className="mt-3 text-xs text-warn">{fill(x.totalsPartial, { n: DONOR_HISTORY_LIMIT })}</p>}
      <p className="mt-2 text-xs text-muted">{t.fin.common.perCurrency}</p>
    </Card>
  );
}

function History({ d }: { d: DonorDetail }) {
  const { t } = useLocale();
  const href = useHref();
  const { can } = useAuth();
  const x = t.fin.donor;
  const canDonations = can("donations.read");
  return (
    <Card labelledBy="hist-t">
      <CardHeader id="hist-t" title={x.history} subtitle={d.donations.length >= DONOR_HISTORY_LIMIT ? fill(t.fin.common.partialList, { n: DONOR_HISTORY_LIMIT }) : undefined} />
      {d.donations.length === 0 ? (
        <EmptyState text={x.historyEmpty} minH="min-h-24" />
      ) : (
        <DataTable
          caption={x.history}
          minW="min-w-[48rem]"
          rows={d.donations}
          rowKey={(r) => r.id}
          columns={[
            {
              key: "ref",
              header: t.fin.donations.cols.reference,
              cell: (r) => (
                <span className="inline-flex flex-wrap items-center gap-2">
                  {canDonations ? <Link href={href(`/donations/${r.id}`)} className="text-meki-green-dark hover:underline"><Ref className="font-bold">{r.reference}</Ref></Link> : <Ref>{r.reference}</Ref>}
                  <TestBadge show={r.isTest} />
                </span>
              ),
            },
            { key: "amt", header: t.fin.common.amount, numeric: true, cell: (r) => <Money value={r.amount} currency={r.currency} className="font-bold" /> },
            { key: "ref2", header: t.fin.donation.refunded, numeric: true, cell: (r) => <Money value={r.refundedAmount} currency={r.currency} /> },
            { key: "type", header: t.fin.donations.cols.type, cell: (r) => frequencyLabel(r.frequency, t) },
            { key: "ps", header: t.fin.donations.cols.paymentStatus, cell: (r) => <StatusBadge kind="payment" status={r.paymentStatus} /> },
            { key: "date", header: t.fin.common.date, cell: (r) => <DateText value={r.confirmedAt ?? r.createdAt} /> },
          ]}
        />
      )}
    </Card>
  );
}

function Recurring({ d }: { d: DonorDetail }) {
  const { t } = useLocale();
  const href = useHref();
  const { can } = useAuth();
  const x = t.fin.donor;
  const canRec = can("recurring.read");
  return (
    <Card labelledBy="rec-t">
      <CardHeader id="rec-t" title={x.recurring} subtitle={t.fin.recurring.subtitle} />
      {d.recurringDonations.length === 0 ? (
        <EmptyState text={x.recurringEmpty} minH="min-h-20" />
      ) : (
        <DataTable
          caption={x.recurring}
          minW="min-w-[36rem]"
          rows={d.recurringDonations}
          rowKey={(r) => r.id}
          columns={[
            { key: "ref", header: t.fin.recurring.cols.reference, cell: (r) => (canRec ? <Link href={href(`/recurring/${r.id}`)} className="text-meki-green-dark hover:underline"><Ref className="font-bold">{r.reference}</Ref></Link> : <Ref>{r.reference}</Ref>) },
            { key: "amt", header: t.fin.agreement.commitment, numeric: true, cell: (r) => <Money value={r.amount} currency={r.currency} /> },
            { key: "st", header: t.fin.common.status, cell: (r) => <StatusBadge kind="recurring" status={r.status} /> },
            { key: "next", header: x.nextBilling, cell: (r) => <DateText value={r.nextBillingDate} withTime={false} /> },
          ]}
        />
      )}
    </Card>
  );
}

function Activity({ id }: { id: string }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const allowed = can("audit.read");
  const q = useEntityAudit("Donor", id, allowed);
  return (
    <Card labelledBy="act-t">
      <CardHeader id="act-t" title={t.fin.donor.activity} />
      <WidgetState q={q} unavailable={!allowed ? { text: t.fin.donation.auditLocked, locked: true } : false} minH="min-h-24">
        <AuditList items={q.data ?? []} emptyText={t.fin.donor.activityEmpty} />
      </WidgetState>
    </Card>
  );
}
