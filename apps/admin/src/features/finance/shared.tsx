"use client";

import Link from "next/link";
import { useId } from "react";
import { Banknote, CheckCircle2, CircleSlash, FileText, KeyRound, ShieldCheck, Ticket } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { EmptyState, WidgetState } from "@/components/common/States";
import { Notice, Ref } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useCurrencies, useProviders } from "@/hooks/useFinanceData";
import { designationOf, donorName, providerState } from "@/lib/finance";
import type { AuditEntry, DonationListRow } from "@/lib/finance-schemas";
import { describeAudit, formatDate } from "@/lib/format";
import { fill } from "@/lib/i18n";
import { useHref } from "./FinancePage";

/** Currency filter: the configured currency list when the user may read it (settings.read), otherwise an ISO-code input. */
export function CurrencyFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const q = useCurrencies(can("settings.read"));
  const id = useId();
  const c = t.fin.common;
  if (q.data && q.data.length > 0) {
    return (
      <div>
        <label htmlFor={id} className="mb-1 block text-xs font-bold text-muted">{c.currency}</label>
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-meki-green sm:min-w-36">
          <option value="">{c.anyCurrency}</option>
          {q.data.map((x) => <option key={x.code} value={x.code}>{x.code}</option>)}
        </select>
      </div>
    );
  }
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-bold text-muted">{c.currency}</label>
      <input
        id={id}
        dir="ltr"
        value={value}
        maxLength={3}
        placeholder="USD"
        onChange={(e) => {
          const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, "");
          if (v.length === 0 || v.length === 3) onChange(v);
        }}
        className="min-h-10 w-24 rounded-xl border border-line bg-white px-3 text-sm uppercase outline-none focus:border-meki-green"
        aria-describedby={`${id}-h`}
      />
      <span id={`${id}-h`} className="sr-only">ISO 4217</span>
    </div>
  );
}

export function DonorCell({ row }: { row: Pick<DonationListRow, "isAnonymous" | "donor" | "donorId"> }) {
  const { t } = useLocale();
  const href = useHref();
  const { can } = useAuth();
  const name = donorName(row.donor);
  if (!row.donor) return <span className="text-muted">{t.fin.common.restricted}</span>;
  return (
    <span className="inline-flex flex-col">
      {can("donors.read") && row.donorId ? (
        <Link href={href(`/donors/${row.donorId}`)} className="font-bold text-ink hover:text-meki-green-dark hover:underline"><bdi>{name ?? "—"}</bdi></Link>
      ) : (
        <bdi className="font-bold text-ink">{name ?? "—"}</bdi>
      )}
      {row.isAnonymous && <span className="text-xs text-muted">{t.fin.common.anonymous}</span>}
    </span>
  );
}

export function DesignationCell({ allocations }: { allocations: DonationListRow["allocations"] }) {
  const { t } = useLocale();
  const d = designationOf(allocations);
  const kind = d.kind === "CAMPAIGN" ? t.fin.common.campaign : d.kind === "PROGRAMME" ? t.fin.common.programme : d.kind === "GENERAL_FUND" ? t.fin.common.generalFund : "—";
  return (
    <span className="inline-flex max-w-56 flex-col">
      {d.title ? <bdi className="truncate" title={d.title}>{d.title}</bdi> : <span>{kind}</span>}
      {d.title && <span className="text-xs text-muted">{kind}</span>}
    </span>
  );
}

export const frequencyLabel = (f: string, t: ReturnType<typeof useLocale>["t"]) => (f === "MONTHLY" ? t.fin.common.monthly : f === "ONE_TIME" ? t.fin.common.oneTime : f);

/** Audit timeline (same visual language as the dashboard activity widget). */
export function AuditList({ items, emptyText }: { items: AuditEntry[]; emptyText: string }) {
  const { locale, t } = useLocale();
  if (items.length === 0) return <EmptyState text={emptyText} minH="min-h-24" />;
  return (
    <ol className="relative space-y-4 before:absolute before:inset-y-2 before:start-4 before:w-px before:bg-line">
      {items.map((a) => {
        const info = describeAudit(a.action);
        const Icon = info.category === "donation" || info.category === "payment" ? Banknote : info.category === "gala" ? Ticket : info.category === "access" ? KeyRound : info.category === "content" ? FileText : ShieldCheck;
        return (
          <li key={a.id} className="relative flex gap-3">
            <span className="z-10 grid size-8 shrink-0 place-items-center rounded-full border border-line bg-white text-meki-green-dark" aria-hidden="true"><Icon className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink" title={a.action}><bdi>{info.text}</bdi></p>
              <p className="text-xs text-muted">
                {t.dashboard.activity.by} <bdi>{a.actorEmail ?? t.dashboard.activity.system}</bdi> · <bdi>{a.entityType}</bdi>
              </p>
            </div>
            <time dateTime={a.createdAt} className="num shrink-0 text-xs text-muted">{formatDate(a.createdAt, locale, true)}</time>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * What the SERVER says about payment providers (GET /admin/payments/providers). Live only when an adapter is configured, active,
 * enabled and not a test provider — Zeffy/SDI are never presented as live unless the server reports them so.
 */
export function ProviderStatus({ compact = false }: { compact?: boolean }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const allowed = can("payments.read");
  const q = useProviders(allowed);
  const p = t.fin.payments.provider;
  if (!allowed) return compact ? null : <Notice>{p.unknown}</Notice>;
  if (compact) {
    if (!q.data) return null;
    const s = providerState(q.data);
    return <Notice tone={s.live ? "info" : "gold"}>{s.live ? fill(p.live, { name: s.live.displayName }) : s.testOnly ? p.testOnly : p.none}</Notice>;
  }
  const yes = (b: boolean) => (b ? <CheckCircle2 className="mx-auto size-4 text-ok" aria-label={t.fin.common.yes} /> : <CircleSlash className="mx-auto size-4 text-muted" aria-label={t.fin.common.no} />);
  return (
    <Card labelledBy="prov-t">
      <CardHeader id="prov-t" title={p.title} />
      <WidgetState q={q} isEmpty={q.data?.length === 0} emptyText={p.none} minH="min-h-24">
        {q.data && (() => {
          const s = providerState(q.data);
          return (
            <div className="space-y-4">
              <Notice tone={s.live ? "info" : "gold"}>
                <p>{s.live ? fill(p.live, { name: s.live.displayName }) : s.testOnly ? p.testOnly : p.none}</p>
                <p className="text-xs text-muted">{p.zeffy}</p>
              </Notice>
              <div className="-mx-5 overflow-x-auto sm:-mx-6">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead>
                    <tr className="border-y border-line bg-bg/70 text-xs uppercase tracking-wide text-muted">
                      {[t.fin.common.provider, p.configured, p.active, p.enabled, p.testProvider, p.refunds, p.partial, p.recurring].map((h, i) => (
                        <th key={h} scope="col" className={`px-3 py-3 font-bold first:ps-5 last:pe-5 sm:first:ps-6 sm:last:pe-6 ${i === 0 ? "text-start" : "text-center"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.map((x) => (
                      <tr key={x.code} className="border-b border-line/70">
                        <td className="px-3 py-3 ps-5 sm:ps-6"><span className="font-bold text-ink"><bdi>{x.displayName}</bdi></span> <Ref className="text-muted">{x.code}</Ref></td>
                        <td className="px-3 py-3 text-center">{yes(x.configuredOnServer)}</td>
                        <td className="px-3 py-3 text-center">{yes(x.activeOnServer)}</td>
                        <td className="px-3 py-3 text-center">{yes(x.isEnabled)}</td>
                        <td className="px-3 py-3 text-center">{yes(x.isTestProvider)}</td>
                        <td className="px-3 py-3 text-center">{yes(x.supportsRefunds)}</td>
                        <td className="px-3 py-3 text-center">{yes(x.supportsPartialRefund)}</td>
                        <td className="px-3 py-3 pe-5 text-center sm:pe-6">{yes(x.supportsRecurring)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
      </WidgetState>
    </Card>
  );
}
