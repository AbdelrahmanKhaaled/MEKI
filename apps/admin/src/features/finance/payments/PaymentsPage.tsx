"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { Card, CardHeader, TintTile } from "@/components/cards/Card";
import { Modal } from "@/components/common/Modal";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { DataTable, DateText, DetailGrid, FilterBar, Money, PageHeader, Pagination, Ref, SearchFilter, SelectFilter, StatusBadge, Tabs, TestBadge, type Column } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useProviders, useRefundList, useRefundReport, useTransaction, useTransactionList, useWebhookList } from "@/hooks/useFinanceData";
import { useUrlState } from "@/hooks/useUrlState";
import { cleanQuery, isTestProviderCode } from "@/lib/finance";
import type { RefundRow, Transaction, WebhookEvent } from "@/lib/finance-schemas";
import { formatNumber } from "@/lib/format";
import { FinancePage, useDetailHref, useHref } from "../FinancePage";
import { CurrencyFilter, ProviderStatus } from "../shared";

const KEYS = ["tab", "q", "status", "type", "currency", "provider"] as const;
const NO_FILTERS = { q: "", status: "", type: "", currency: "", provider: "" };
type TabKey = "transactions" | "refunds" | "events" | "providers";

export function PaymentsPage() {
  const { t } = useLocale();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.donors }, { label: t.fin.payments.title }]} anyOf={["payments.read", "donations.read"]}>
      <Payments />
    </FinancePage>
  );
}

function Payments() {
  const { t } = useLocale();
  const { can } = useAuth();
  const p = t.fin.payments;
  const url = useUrlState(KEYS);
  const allowed: TabKey[] = [...(can("payments.read") ? (["transactions"] as const) : []), ...(can("donations.read") ? (["refunds"] as const) : []), ...(can("payments.read") ? (["events", "providers"] as const) : [])];
  const tab = (allowed.includes(url.values.tab as TabKey) ? url.values.tab : allowed[0]) as TabKey;
  return (
    <>
      <PageHeader title={p.title} subtitle={p.subtitle} />
      <ProviderStatus compact />
      <Tabs label={p.title} active={tab} tabs={allowed.map((k) => ({ key: k, label: p.tabs[k] }))} onChange={(k) => url.set({ tab: k, ...NO_FILTERS })} />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "transactions" && <TransactionsTab url={url} />}
        {tab === "refunds" && <RefundsTab url={url} />}
        {tab === "events" && <EventsTab url={url} />}
        {tab === "providers" && <ProviderStatus />}
      </div>
    </>
  );
}

type Url = ReturnType<typeof useUrlState<(typeof KEYS)[number]>>;

function ProviderFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useLocale();
  const providers = useProviders(true);
  return <SelectFilter label={t.fin.common.provider} allLabel={t.fin.common.all} value={value} onChange={onChange} options={(providers.data ?? []).map((x) => ({ value: x.code, label: x.displayName }))} />;
}

function TransactionsTab({ url }: { url: Url }) {
  const { t } = useLocale();
  const href = useHref();
  const { can } = useAuth();
  const x = t.fin.payments.tx;
  const f = url.values;
  const q = { ...cleanQuery({ search: f.q, status: f.status, type: f.type, currency: f.currency, provider: f.provider }), page: url.page, pageSize: 20 };
  const list = useTransactionList(q, true);
  const [open, setOpen] = useState<string | null>(null);
  const canDonations = can("donations.read");
  const columns = useMemo<Column<Transaction>[]>(
    () => [
      { key: "ref", header: x.providerRef, cell: (r) => <span className="inline-flex flex-wrap items-center gap-2"><Ref className="font-bold">{r.providerTransactionRef}</Ref><TestBadge show={r.isTest} /></span> },
      { key: "don", header: x.donation, cell: (r) => (r.donation ? canDonations ? <Link href={href(`/donations/${r.donationId}`)} className="text-meki-green-dark hover:underline"><Ref>{r.donation.reference}</Ref></Link> : <Ref>{r.donation.reference}</Ref> : "—") },
      { key: "prov", header: t.fin.common.provider, cell: (r) => <Ref>{r.provider}</Ref> },
      { key: "type", header: x.type, cell: (r) => <StatusBadge kind="txType" status={r.type} /> },
      { key: "amt", header: t.fin.common.amount, numeric: true, cell: (r) => <Money value={r.amount} currency={r.currency} className="font-bold" /> },
      { key: "cur", header: t.fin.common.currency, cell: (r) => <bdi dir="ltr">{r.currency}</bdi> },
      { key: "st", header: t.fin.common.status, cell: (r) => <StatusBadge kind="tx" status={r.status} /> },
      { key: "occ", header: x.occurred, cell: (r) => <DateText value={r.occurredAt} /> },
      { key: "act", header: t.fin.common.actions, cell: (r) => <button type="button" onClick={() => setOpen(r.id)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-meki-green-dark hover:bg-bg"><Eye className="size-4" aria-hidden="true" /> {t.fin.common.viewDetails}</button> },
    ],
    [x, t, href, canDonations],
  );
  return (
    <Card labelledBy="tx-t" className="mt-4">
      <CardHeader id="tx-t" title={t.fin.payments.tabs.transactions} />
      <FilterBar active={url.active} onClear={() => url.set(NO_FILTERS)}>
        <SearchFilter value={f.q} onChange={(v) => url.set({ q: v })} label={x.search} />
        <SelectFilter label={x.type} allLabel={x.anyType} value={f.type} onChange={(v) => url.set({ type: v })} options={Object.entries(t.fin.statuses.txType).map(([value, label]) => ({ value, label }))} />
        <SelectFilter label={t.fin.common.status} allLabel={t.fin.common.all} value={f.status} onChange={(v) => url.set({ status: v })} options={Object.entries(t.fin.statuses.tx).map(([value, label]) => ({ value, label }))} />
        <CurrencyFilter value={f.currency} onChange={(v) => url.set({ currency: v })} />
        <ProviderFilter value={f.provider} onChange={(v) => url.set({ provider: v })} />
      </FilterBar>
      <WidgetState q={list} isEmpty={list.data?.items.length === 0} emptyText={url.active ? x.emptyFiltered : x.empty} minH="min-h-56">
        {list.data && (
          <>
            <DataTable caption={t.fin.payments.tabs.transactions} rows={list.data.items} columns={columns} rowKey={(r) => r.id} dimmed={list.isPlaceholderData} />
            <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} onPage={(pg) => url.set({ page: pg })} />
          </>
        )}
      </WidgetState>
      <TransactionModal id={open} onClose={() => setOpen(null)} />
    </Card>
  );
}

/** Loads the transaction from GET /admin/payments/transactions/:id (not from the list row). */
function TransactionModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t } = useLocale();
  const x = t.fin.payments.tx;
  const q = useTransaction(id, !!id);
  return (
    <Modal open={!!id} title={x.detail} closeLabel={t.fin.common.close} onClose={onClose} footer={<button type="button" className="btn-admin btn-primary" onClick={onClose}>{t.fin.common.close}</button>}>
      <WidgetState q={q} minH="min-h-40">
        {q.data && (
          <DetailGrid
            cols={2}
            items={[
              [x.providerRef, <Ref key="r">{q.data.providerTransactionRef}</Ref>],
              [x.donation, q.data.donation ? <Ref key="d">{q.data.donation.reference}</Ref> : "—"],
              [x.type, <StatusBadge key="t" kind="txType" status={q.data.type} />],
              [t.fin.common.status, <StatusBadge key="s" kind="tx" status={q.data.status} />],
              [t.fin.common.amount, <Money key="a" value={q.data.amount} currency={q.data.currency} />],
              [t.fin.common.provider, <Ref key="p">{q.data.provider}</Ref>],
              [x.fee, q.data.feeAmount ? <Money key="f" value={q.data.feeAmount} currency={q.data.currency} /> : "—"],
              [x.settlement, q.data.settlementAmount && q.data.settlementCurrency ? <Money key="se" value={q.data.settlementAmount} currency={q.data.settlementCurrency} /> : "—"],
              [x.failure, q.data.failureCode ? <Ref key="fc">{q.data.failureCode}</Ref> : "—"],
              [x.attempt, q.data.paymentAttemptId ? <Ref key="pa">{q.data.paymentAttemptId}</Ref> : "—"],
              [x.refund, q.data.refundId ? <Ref key="rf">{q.data.refundId}</Ref> : "—"],
              [x.webhook, q.data.webhookEventId ? <Ref key="wh">{q.data.webhookEventId}</Ref> : "—"],
              [x.occurred, <DateText key="o" value={q.data.occurredAt} />],
              [t.fin.common.test, q.data.isTest ? t.fin.common.yes : t.fin.common.no],
            ]}
          />
        )}
      </WidgetState>
    </Modal>
  );
}

function RefundsTab({ url }: { url: Url }) {
  const { locale, t } = useLocale();
  const href = useHref();
  const { can } = useAuth();
  const x = t.fin.payments.refunds;
  const detail = useDetailHref();
  const f = url.values;
  const q = { ...cleanQuery({ search: f.q, status: f.status }), page: url.page, pageSize: 20, sort: "requestedAt:desc" };
  const list = useRefundList(q, true);
  const canReports = can("reports.read");
  const report = useRefundReport(canReports);
  const providers = useProviders(can("payments.read"));
  const columns = useMemo<Column<RefundRow>[]>(
    () => [
      {
        key: "ref",
        header: x.reference,
        cell: (r) => (
          <span className="inline-flex flex-wrap items-center gap-2">
            <Link href={detail(`/payments/refunds/${r.id}`)} className="text-meki-green-dark hover:underline"><Ref className="font-bold">{r.reference}</Ref></Link>
            <TestBadge show={r.donation?.isTest ?? isTestProviderCode(r.provider, providers.data)} />
          </span>
        ),
      },
      { key: "don", header: x.donation, cell: (r) => <Link href={href(`/donations/${r.donationId}`)} className="text-meki-green-dark hover:underline"><Ref>{r.donation?.reference ?? t.fin.common.openDonation}</Ref></Link> },
      { key: "amt", header: t.fin.common.amount, numeric: true, cell: (r) => <Money value={r.amount} currency={r.currency} className="font-bold" /> },
      { key: "cur", header: t.fin.common.currency, cell: (r) => <bdi dir="ltr">{r.currency}</bdi> },
      { key: "st", header: t.fin.common.status, cell: (r) => <StatusBadge kind="refund" status={r.status} /> },
      { key: "prov", header: t.fin.common.provider, cell: (r) => (r.provider ? <Ref>{r.provider}</Ref> : "—") },
      { key: "req", header: x.requested, cell: (r) => <DateText value={r.requestedAt} /> },
      { key: "done", header: x.completed, cell: (r) => <DateText value={r.completedAt} /> },
      { key: "act", header: t.fin.common.actions, cell: (r) => <Link href={detail(`/payments/refunds/${r.id}`)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-meki-green-dark hover:bg-bg"><Eye className="size-4" aria-hidden="true" /> {t.fin.common.viewDetails}</Link> },
    ],
    [x, t, href, detail, providers.data],
  );
  // Report: counts per status (all currencies — counts are not money); amounts stay per currency in the tile hint.
  const byStatus = new Map<string, { count: number; amounts: { currency: string; amount: string }[] }>();
  for (const r of report.data ?? []) {
    const e = byStatus.get(r.status) ?? { count: 0, amounts: [] };
    e.count += r.count;
    e.amounts.push({ currency: r.currency, amount: r.amount });
    byStatus.set(r.status, e);
  }
  const tone = { REQUESTED: "amber", APPROVED: "blue", PROCESSING: "blue", SUCCEEDED: "green", REJECTED: "grey", FAILED: "red" } as const;
  return (
    <div className="mt-4 space-y-4">
      {canReports && (
        <Card labelledBy="rr-t">
          <CardHeader id="rr-t" title={x.report} />
          <WidgetState q={report} isEmpty={(report.data?.length ?? 0) === 0} emptyText={x.reportEmpty} minH="min-h-20">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {(Object.keys(tone) as (keyof typeof tone)[]).map((s) => {
                const e = byStatus.get(s);
                return (
                  <TintTile
                    key={s}
                    tone={tone[s]}
                    label={t.fin.statuses.refund[s]}
                    value={formatNumber(e?.count ?? 0, locale)}
                  />
                );
              })}
            </div>
            <ul className="mt-3 space-y-1 text-xs text-muted">
              {[...byStatus.entries()].flatMap(([s, e]) => e.amounts.map((a) => (
                <li key={`${s}-${a.currency}`}>{t.fin.statuses.refund[s] ?? s}: <Money value={a.amount} currency={a.currency} /></li>
              )))}
            </ul>
            <p className="mt-2 text-xs text-muted">{t.fin.common.perCurrency}</p>
          </WidgetState>
        </Card>
      )}
      <Card labelledBy="rf-t">
        <CardHeader id="rf-t" title={t.fin.payments.tabs.refunds} />
        <FilterBar active={url.active} onClear={() => url.set(NO_FILTERS)}>
          <SearchFilter value={f.q} onChange={(v) => url.set({ q: v })} label={x.search} />
          <SelectFilter label={t.fin.common.status} allLabel={t.fin.common.all} value={f.status} onChange={(v) => url.set({ status: v })} options={Object.entries(t.fin.statuses.refund).map(([value, label]) => ({ value, label }))} />
        </FilterBar>
        <WidgetState q={list} isEmpty={list.data?.items.length === 0} emptyText={url.active ? x.emptyFiltered : x.empty} minH="min-h-56">
          {list.data && (
            <>
              <DataTable caption={t.fin.payments.tabs.refunds} rows={list.data.items} columns={columns} rowKey={(r) => r.id} dimmed={list.isPlaceholderData} />
              <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} onPage={(pg) => url.set({ page: pg })} />
            </>
          )}
        </WidgetState>
      </Card>
    </div>
  );
}

function EventsTab({ url }: { url: Url }) {
  const { t } = useLocale();
  const x = t.fin.payments.events;
  const f = url.values;
  const q = { ...cleanQuery({ search: f.q, status: f.status, provider: f.provider }), page: url.page, pageSize: 20 };
  const list = useWebhookList(q, true);
  const providers = useProviders(true);
  const columns = useMemo<Column<WebhookEvent>[]>(
    () => [
      { key: "id", header: x.eventId, cell: (r) => <span className="inline-flex flex-wrap items-center gap-2"><Ref className="font-bold">{r.providerEventId}</Ref><TestBadge show={isTestProviderCode(r.provider, providers.data)} /></span> },
      { key: "type", header: x.type, cell: (r) => <Ref>{r.eventType}</Ref> },
      { key: "prov", header: t.fin.common.provider, cell: (r) => <Ref>{r.provider}</Ref> },
      { key: "sig", header: x.verified, cell: (r) => <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${r.signatureVerified ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"}`}>{r.signatureVerified ? x.verifiedYes : x.verifiedNo}</span> },
      { key: "st", header: t.fin.common.status, cell: (r) => <StatusBadge kind="webhook" status={r.status} /> },
      { key: "att", header: x.attempts, numeric: true, cell: (r) => <span className="num">{r.attempts}</span> },
      { key: "rec", header: x.received, cell: (r) => <DateText value={r.receivedAt} /> },
      { key: "proc", header: x.processed, cell: (r) => <DateText value={r.processedAt} /> },
      { key: "err", header: x.error, cell: (r) => (r.lastError ? <span className="line-clamp-2 max-w-64 text-xs text-danger" title={r.lastError}><bdi>{r.lastError}</bdi></span> : "—") },
    ],
    [x, t, providers.data],
  );
  return (
    <Card labelledBy="ev-t" className="mt-4">
      <CardHeader id="ev-t" title={t.fin.payments.tabs.events} />
      <FilterBar active={url.active} onClear={() => url.set(NO_FILTERS)}>
        <SearchFilter value={f.q} onChange={(v) => url.set({ q: v })} label={x.search} />
        <SelectFilter label={t.fin.common.status} allLabel={t.fin.common.all} value={f.status} onChange={(v) => url.set({ status: v })} options={Object.entries(t.fin.statuses.webhook).map(([value, label]) => ({ value, label }))} />
        <ProviderFilter value={f.provider} onChange={(v) => url.set({ provider: v })} />
      </FilterBar>
      <WidgetState q={list} isEmpty={list.data?.items.length === 0} emptyText={url.active ? x.emptyFiltered : x.empty} minH="min-h-56">
        {list.data && (
          <>
            <DataTable caption={t.fin.payments.tabs.events} rows={list.data.items} columns={columns} rowKey={(r) => r.id} dimmed={list.isPlaceholderData} minW="min-w-[72rem]" />
            <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} onPage={(pg) => url.set({ page: pg })} />
          </>
        )}
      </WidgetState>
      <p className="mt-3 text-xs text-muted">{t.fin.common.readOnly}</p>
    </Card>
  );
}
