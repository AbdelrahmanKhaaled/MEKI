"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CheckCircle2, CircleSlash, RefreshCw, RotateCcw } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { TextInput } from "@/components/content/ui";
import { ConfirmDialog, DataTable, DateText, DetailGrid, FilterBar, Money, Notice, PageHeader, Pagination, Ref, SearchFilter, SelectFilter, useErrorText, type Column } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { FinancePage } from "@/features/finance/FinancePage";
import { useUrlState } from "@/hooks/useUrlState";
import { cleanQuery } from "@/lib/finance";
import { fill } from "@/lib/i18n";
import { MATCH_STATUSES, type ProviderPayment } from "@/lib/zeffy-schemas";
import * as svc from "@/services/zeffy";

const KEYS = ["q", "match", "class"] as const;
const keys = { status: ["zeffy", "status"] as const, list: (q: unknown) => ["zeffy", "payments", q] as const };

export function ZeffyPage() {
  const { t } = useLocale();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.donors }, { label: t.zeffy.title }]} anyOf={["payments.read"]}>
      <Zeffy />
    </FinancePage>
  );
}

const MATCH_TONE: Record<string, string> = { CONFIRMED: "bg-ok/10 text-ok", MATCHED: "bg-info/10 text-info", NEEDS_REVIEW: "bg-warn/10 text-warn", UNMATCHED: "bg-bg text-body", IGNORED: "bg-bg text-muted" };

function Zeffy() {
  const { t } = useLocale();
  const { can } = useAuth();
  const errText = useErrorText();
  const qc = useQueryClient();
  const x = t.zeffy;
  const { values: f, page, set, clear, active } = useUrlState(KEYS);
  const status = useQuery({ queryKey: keys.status, queryFn: svc.getZeffyStatus });
  const query = { ...cleanQuery({ search: f.q, matchStatus: f.match, classification: f.class }), page, pageSize: 25 };
  const list = useQuery({ queryKey: keys.list(query), queryFn: () => svc.listProviderPayments(query), placeholderData: (prev) => prev });
  const [dialog, setDialog] = useState<null | "reconcile" | { recheck: ProviderPayment }>(null);
  const [days, setDays] = useState("30");
  const [msg, setMsg] = useState<string | null>(null);
  const done = () => void qc.invalidateQueries({ queryKey: ["zeffy"] });
  const reconcile = useMutation({ mutationFn: (d: number) => svc.reconcileZeffy(d), onSuccess: (r) => { done(); setMsg(fill(x.reconcileDone, { payments: r.payments, confirmed: r.confirmed, matched: r.matched, review: r.review, unmatched: r.unmatched, ignored: r.ignored, failed: r.failed })); setDialog(null); } });
  const recheck = useMutation({ mutationFn: (id: string) => svc.recheckProviderPayment(id), onSuccess: () => { done(); setDialog(null); } });
  const canManage = can("payments.manage");
  const s = status.data;
  const hasKey = !!s?.configured.apiKey;
  const yes = (b: boolean) => (b ? <span className="inline-flex items-center gap-1 text-ok"><CheckCircle2 className="size-4" aria-hidden="true" /> {x.configured}</span> : <span className="inline-flex items-center gap-1 text-muted"><CircleSlash className="size-4" aria-hidden="true" /> {x.missing}</span>);

  const columns = useMemo<Column<ProviderPayment>[]>(
    () => [
      { key: "created", header: x.cols.created, cell: (r) => <DateText value={r.providerCreatedAt} /> },
      { key: "amount", header: x.cols.amount, numeric: true, cell: (r) => <Money value={r.amount} currency={r.currency} /> },
      { key: "refunded", header: x.cols.refunded, numeric: true, cell: (r) => (r.refundedAmount !== "0.00" ? <Money value={r.refundedAmount} currency={r.currency} /> : "—") },
      { key: "status", header: x.cols.status, cell: (r) => <span className="text-xs">{r.status}{r.disputeStatus ? ` · dispute ${r.disputeStatus}` : ""}{r.deletedAtProvider ? ` · ${x.deleted}` : ""}</span> },
      { key: "type", header: x.cols.type, cell: (r) => (r.classification ? x.classes[r.classification] ?? r.classification : "—") },
      { key: "ref", header: x.cols.ref, cell: (r) => (r.correlationRef ? <Ref>{r.correlationRef}</Ref> : "—") },
      { key: "match", header: x.cols.match, cell: (r) => <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${MATCH_TONE[r.matchStatus]}`} data-match={r.matchStatus}>{x.match[r.matchStatus]}</span> },
      { key: "reason", header: x.cols.reason, cell: (r) => <span className="line-clamp-2 text-xs text-body">{r.matchReason ?? "—"}</span> },
      { key: "payment", header: x.cols.payment, cell: (r) => <Ref className="text-xs">{r.providerPaymentId}</Ref> },
      {
        key: "act",
        header: t.fin.common.actions,
        cell: (r) => (canManage && hasKey ? <button type="button" className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-bold text-meki-green-dark hover:bg-bg" onClick={() => setDialog({ recheck: r })}><RotateCcw className="size-4" aria-hidden="true" /> {x.recheck}</button> : null),
      },
    ],
    [x, t, canManage, hasKey],
  );

  return (
    <>
      <PageHeader
        title={x.title}
        subtitle={x.subtitle}
        right={canManage ? <button type="button" className="btn-admin btn-primary" disabled={!s?.configured.apiKey} onClick={() => setDialog("reconcile")} data-testid="zeffy-reconcile"><RefreshCw className="size-4" aria-hidden="true" /> {x.reconcile}</button> : undefined}
      />
      {msg && <p className="rounded-lg bg-ok/10 p-3 text-sm text-ok" role="status">{msg}</p>}
      <Card labelledBy="zf-s">
        <CardHeader id="zf-s" title={x.status} />
        <WidgetState q={status} minH="min-h-40">
          {s && (
            <div className="space-y-4" data-testid="zeffy-status">
              <DetailGrid
                items={[
                  [x.apiKey, yes(s.configured.apiKey)],
                  [x.webhookSecret, yes(s.configured.webhookSecret)],
                  [x.galaCampaign, yes(s.configured.galaTicketCampaign)],
                  [x.donationCampaigns, String(s.configured.donationCampaigns)],
                  [x.forms, [s.configured.forms.donation, s.configured.forms.galaTicket, s.configured.forms.galaGiving].filter(Boolean).length + " / 3"],
                  [x.api, <span key="api" className={s.api.state === "ok" ? "text-ok" : s.api.state === "error" ? "text-danger" : "text-muted"} data-api={s.api.state}>{x.apiStates[s.api.state]}{s.api.code ? ` (${s.api.code})` : ""}</span>],
                  [x.lastVerified, s.webhook.lastVerifiedAt ? <DateText key="w" value={s.webhook.lastVerifiedAt} /> : x.none],
                  [x.failedEvents, String(s.webhook.failedEvents)],
                  [x.lastRun, s.lastReconciliation ? <DateText key="r" value={s.lastReconciliation.at} /> : x.never],
                  [x.autoConfirm, s.autoConfirm ? x.autoOn : x.autoOff],
                ]}
              />
              <div className="flex flex-wrap gap-2" aria-label={x.queue}>
                {MATCH_STATUSES.map((k) => <span key={k} className={`rounded-full px-3 py-1 text-xs font-bold ${MATCH_TONE[k]}`}>{x.match[k]}: <span className="num">{s.queue[k] ?? 0}</span></span>)}
              </div>
              {!s.hostedCheckout.available && <Notice tone="gold"><p>{x.checkoutOff}</p></Notice>}
              {(!s.configured.apiKey || !s.configured.webhookSecret) && <Notice tone="warn"><p>{x.pending}</p></Notice>}
              <p className="text-xs text-muted">{x.separation}</p>
            </div>
          )}
        </WidgetState>
      </Card>
      <Card labelledBy="zf-p">
        <CardHeader id="zf-p" title={x.payments} />
        <FilterBar active={active} onClear={clear}>
          <SearchFilter value={f.q} onChange={(v) => set({ q: v })} label={x.search} />
          <SelectFilter label={x.matchFilter} allLabel={t.content.common.anyStatus} value={f.match} onChange={(v) => set({ match: v })} options={MATCH_STATUSES.map((k) => ({ value: k, label: x.match[k] }))} />
          <SelectFilter label={x.classFilter} allLabel={t.content.common.anyStatus} value={f.class} onChange={(v) => set({ class: v })} options={Object.entries(x.classes).map(([value, label]) => ({ value, label }))} />
        </FilterBar>
        <WidgetState q={list} isEmpty={(list.data?.items.length ?? 0) === 0} emptyText={active ? x.emptyFiltered : x.empty} minH="min-h-40">
          <DataTable caption={x.payments} rows={list.data?.items ?? []} columns={columns} rowKey={(r) => r.id} dimmed={list.isPlaceholderData} minW="min-w-[80rem]" />
          <Pagination page={list.data?.page ?? 1} totalPages={list.data?.totalPages ?? 1} total={list.data?.total ?? 0} onPage={(p) => set({ page: p })} />
        </WidgetState>
      </Card>
      {dialog === "reconcile" && (
        <ConfirmDialog open title={x.reconcileTitle} confirmLabel={x.reconcile} busy={reconcile.isPending} error={reconcile.isError ? errText(reconcile.error) : null} confirmDisabled={!/^\d{1,3}$/.test(days) || Number(days) < 1 || Number(days) > 400} onClose={() => { reconcile.reset(); setDialog(null); }} onConfirm={() => reconcile.mutate(Number(days))}>
          <div className="space-y-3">
            <p>{x.reconcileBody}</p>
            <TextInput label={x.days} value={days} onChange={(v) => setDays(v.replace(/\D/g, ""))} dir="ltr" inputMode="numeric" maxLength={3} />
          </div>
        </ConfirmDialog>
      )}
      {dialog && typeof dialog === "object" && (
        <ConfirmDialog open title={x.recheckTitle} confirmLabel={x.recheck} busy={recheck.isPending} error={recheck.isError ? errText(recheck.error) : null} onClose={() => { recheck.reset(); setDialog(null); }} onConfirm={() => recheck.mutate(dialog.recheck.id)}>
          <p>{x.recheckBody}</p>
          <p className="mt-2 text-xs"><Ref>{dialog.recheck.providerPaymentId}</Ref></p>
        </ConfirmDialog>
      )}
    </>
  );
}
