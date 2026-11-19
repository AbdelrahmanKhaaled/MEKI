"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { DateText } from "@/components/finance/ui";
import * as svc from "@/services/sdi";
import { SyntheticBadge } from "./shared";

/** Phase 12 dashboard card: SDI reconciliation health (counts and dates only — no money is computed here). */
export function SdiDashboardCard() {
  const { t, locale } = useLocale();
  const x = t.sdi;
  const q = useQuery({ queryKey: ["sdi", "status"], queryFn: svc.getSdiStatus });
  const s = q.data;
  const tile = (label: string, value: React.ReactNode, warn = false) => (
    <div className={`rounded-xl border p-3 ${warn ? "border-warn/40 bg-warn/5" : "border-line"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-lg font-bold ${warn ? "text-warn" : "text-ink"}`}>{value}</p>
    </div>
  );
  return (
    <Card id="sdi" labelledBy="sdi-d">
      <CardHeader id="sdi-d" title={x.title} subtitle={x.noApi} right={<Link href={`/${locale}/payments/sdi-reconciliation`} className="text-sm font-bold text-meki-green-dark underline-offset-4 hover:underline">{x.open}</Link>} />
      <WidgetState q={q} minH="min-h-28">
        {s && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="sdi-dashboard">
            {tile(x.lastApplied, s.lastAppliedReport ? <span className="inline-flex flex-wrap items-center gap-2 text-sm"><DateText value={s.lastAppliedReport.appliedAt} />{s.lastAppliedReport.isSynthetic && <SyntheticBadge />}</span> : x.never)}
            {tile(x.awaiting, <span className="num">{s.importsAwaitingAction}</span>, s.importsAwaitingAction > 0)}
            {tile(x.review, <span className="num">{s.rowsRequiringReview}</span>, s.rowsRequiringReview > 0)}
            {tile(x.missingDays, <span className="num">{s.missingBusinessDays.length}</span>, s.missingBusinessDays.length > 0)}
          </div>
        )}
      </WidgetState>
    </Card>
  );
}
