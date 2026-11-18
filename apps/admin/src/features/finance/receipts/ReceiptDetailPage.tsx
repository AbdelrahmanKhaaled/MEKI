"use client";

import Link from "next/link";
import { ExternalLink, Scale } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { ErrorState, WidgetSkeleton, WidgetState } from "@/components/common/States";
import { DateText, DetailGrid, Money, Notice, PageHeader, Ref, StatusBadge, TestBadge } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useEntityAudit, useReceipt } from "@/hooks/useFinanceData";
import { fill } from "@/lib/i18n";
import { receiptDocumentUrl } from "@/services/finance";
import { FinancePage, useBackHref, useHref } from "../FinancePage";
import { AuditList, frequencyLabel } from "../shared";

export function ReceiptDetailPage({ id }: { id: string }) {
  const { t } = useLocale();
  const href = useHref();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.donors }, { label: t.fin.receipts.title, href: href("/receipts") }, { label: t.fin.receipt.record }]} anyOf={["receipts.read"]}>
      <Receipt id={id} />
    </FinancePage>
  );
}

function Receipt({ id }: { id: string }) {
  const { locale, t } = useLocale();
  const href = useHref();
  const { can } = useAuth();
  const q = useReceipt(id);
  const backHref = useBackHref("/receipts");
  if (q.isPending) return <WidgetSkeleton rows={6} minH="min-h-80" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} minH="min-h-80" />;
  const r = q.data;
  const s = r.snapshot;
  const x = t.fin.receipt;
  const issuerName = locale === "ar" && s.issuer.nameAr ? s.issuer.nameAr : s.issuer.nameEn;
  const issuerAddr = locale === "ar" && s.issuer.addressAr ? s.issuer.addressAr : s.issuer.addressEn;
  const purpose = (locale === "ar" ? s.purpose.titleAr : null) ?? s.purpose.titleEn;
  const desKind = s.purpose.designation === "CAMPAIGN" ? t.fin.common.campaign : s.purpose.designation === "PROGRAMME" ? t.fin.common.programme : t.fin.common.generalFund;
  return (
    <>
      <PageHeader
        back={{ href: backHref, label: t.fin.receipts.title }}
        title={<Ref className="!text-2xl font-bold sm:!text-3xl">{r.receiptNumber}</Ref>}
        badges={<><StatusBadge kind="receipt" status={r.status} /><TestBadge show={s.isTest} /></>}
        right={
          r.status === "ISSUED" ? (
            <a href={receiptDocumentUrl(r.id, locale)} target="_blank" rel="noopener noreferrer" className="btn-admin btn-primary">
              <ExternalLink className="size-4" aria-hidden="true" /> {x.document}
            </a>
          ) : undefined
        }
      />
      <Notice tone="gold" icon={Scale}>
        <p>{t.fin.receipts.fiscal}</p>
        <p className="text-xs text-muted">{x.documentNote} {x.pdf}</p>
      </Notice>
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="min-w-0 space-y-4 xl:col-span-8">
          <Card labelledBy="rec-t">
            <CardHeader id="rec-t" title={x.record} />
            <DetailGrid
              items={[
                [t.fin.receipts.cols.number, <Ref key="n">{r.receiptNumber}</Ref>],
                [t.fin.receipts.cols.status, <StatusBadge key="s" kind="receipt" status={r.status} />],
                [t.fin.receipts.cols.version, <span key="v" className="num">{r.version}</span>],
                [t.fin.receipts.cols.locale, r.locale === "ar" ? "العربية" : "English"],
                [t.fin.receipts.cols.issued, <DateText key="i" value={r.issuedAt} />],
                [t.fin.receipts.cols.voided, <DateText key="vo" value={r.voidedAt} />],
                [x.voidReason, r.voidReason ? <bdi key="vr">{r.voidReason}</bdi> : "—"],
                [x.replaces, r.replacesReceiptId ? <Link key="rp" href={href(`/receipts/${r.replacesReceiptId}`)} className="text-meki-green-dark hover:underline">{t.fin.common.view}</Link> : "—"],
              ]}
            />
          </Card>
          <Card labelledBy="snap-t">
            <CardHeader id="snap-t" title={x.snapshot} />
            <DetailGrid
              items={[
                [t.fin.receipts.cols.donation, can("donations.read") ? <Link key="d" href={href(`/donations/${r.donationId}`)} className="text-meki-green-dark hover:underline"><Ref className="font-bold">{s.donation.reference}</Ref></Link> : <Ref key="d">{s.donation.reference}</Ref>],
                [t.fin.common.amount, <Money key="a" value={s.donation.amount} currency={s.donation.currency} className="font-bold" />],
                [t.fin.donation.frequency, frequencyLabel(s.donation.frequency, t)],
                [t.fin.donation.confirmedAt, <DateText key="c" value={s.donation.confirmedAt} />],
                [x.donor, <bdi key="dn">{s.donor.organizationName || s.donor.name}</bdi>],
                [x.purpose, purpose ? <span key="p"><bdi>{purpose}</bdi> <span className="text-xs text-muted">({desKind})</span></span> : desKind],
              ]}
            />
          </Card>
        </div>
        <div className="min-w-0 space-y-4 xl:col-span-4">
          <Card labelledBy="iss-t">
            <CardHeader id="iss-t" title={x.issuer} />
            <DetailGrid
              cols={2}
              items={[
                [t.fin.donor.name, <bdi key="n">{issuerName}</bdi>],
                [t.fin.donor.address, issuerAddr ? <bdi key="a">{issuerAddr}</bdi> : "—"],
                [s.issuer.taxIdLabel ?? x.taxId, s.issuer.taxId ? <Ref key="t">{s.issuer.taxId}</Ref> : "—"],
              ]}
            />
            <p className="mt-4 text-xs text-muted">{t.fin.receipts.issueOff}</p>
          </Card>
          <ReceiptAudit id={r.id} />
        </div>
      </div>
      <span className="sr-only">{fill(x.title, { no: r.receiptNumber })}</span>
    </>
  );
}

function ReceiptAudit({ id }: { id: string }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const allowed = can("audit.read");
  const q = useEntityAudit("DonationReceipt", id, allowed);
  return (
    <Card labelledBy="raud-t">
      <CardHeader id="raud-t" title={t.fin.refund.audit} />
      <WidgetState q={q} unavailable={!allowed ? { text: t.fin.donation.auditLocked, locked: true } : false} minH="min-h-24">
        <AuditList items={q.data ?? []} emptyText={t.fin.refund.auditEmpty} />
      </WidgetState>
    </Card>
  );
}
