"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CircleSlash, Plus, Undo2 } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { Checkbox, TextArea, TextInput } from "@/components/content/ui";
import { ConfirmDialog, DataTable, DateText, Notice, PageHeader } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { zakatRequestProblem, type ZakatTarget } from "@/lib/giving-schemas";
import * as svc from "@/services/giving";
import { FinancePage } from "../finance/FinancePage";
import { Pill, useGivingError } from "./GivingIntentsPage";

/**
 * Phase 14 — Zakat eligibility per program / project / campaign. NOTHING is eligible by default. One administrator requests
 * (zakat.manage, with the MEKI authority AND SDI acceptance references); a DIFFERENT administrator decides (zakat.approve).
 * Revoking is immediate. This screen records decisions made elsewhere; it never makes a religious ruling.
 */
export function ZakatEligibilityPage() {
  const { t } = useLocale();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.donors }, { label: t.giving.zakat.title }]} anyOf={["donations.read"]}>
      <Overview />
    </FinancePage>
  );
}

type Dialog = null | { kind: "request"; target: ZakatTarget } | { kind: "approve" | "reject"; target: ZakatTarget } | { kind: "revoke"; target: ZakatTarget };

function Overview() {
  const { t, locale } = useLocale();
  const x = t.giving.zakat;
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const errText = useGivingError();
  const q = useQuery({ queryKey: ["giving", "zakat"], queryFn: svc.zakatOverview });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [eligible, setEligible] = useState(true);
  const [authority, setAuthority] = useState("");
  const [sdi, setSdi] = useState("");
  const [note, setNote] = useState("");
  const done = () => {
    setDialog(null);
    setAuthority("");
    setSdi("");
    setNote("");
    void qc.invalidateQueries({ queryKey: ["giving", "zakat"] });
  };
  const m = useMutation({
    mutationFn: async (d: NonNullable<Dialog>) => {
      const tg = d.target;
      if (d.kind === "request") return svc.requestZakat({ targetType: tg.targetType, targetId: tg.id, eligible, ...(eligible ? { authorityReference: authority.trim(), sdiAcceptanceReference: sdi.trim() } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
      if (d.kind === "approve") return svc.approveZakat(tg.pending!.id, note.trim() || undefined);
      if (d.kind === "reject") return svc.rejectZakat(tg.pending!.id, note.trim());
      return svc.revokeZakat({ targetType: tg.targetType, targetId: tg.id, reason: note.trim() });
    },
    onSuccess: done,
  });
  const name = (tg: ZakatTarget) => (locale === "ar" ? tg.nameAr || tg.nameEn : tg.nameEn);
  const problem = dialog?.kind === "request" ? zakatRequestProblem(eligible, authority, sdi) : null;

  return (
    <>
      <PageHeader title={x.title} subtitle={x.subtitle} />
      <Notice tone="warn"><p>{x.warning}</p></Notice>
      <Card labelledBy="zk-t">
        <CardHeader id="zk-t" title={x.title} />
        <WidgetState q={q} minH="min-h-56">
          {q.data && (
            <DataTable
              caption={x.title}
              rows={q.data.targets}
              rowKey={(r) => `${r.targetType}-${r.id}`}
              columns={[
                { key: "type", header: x.cols.type, cell: (r) => x.types[r.targetType] },
                { key: "target", header: x.cols.target, cell: (r) => <span><bdi className="font-bold">{name(r)}</bdi> <span className="font-mono text-xs text-muted" dir="ltr">{r.code}</span></span> },
                { key: "state", header: x.cols.state, cell: (r) => <Pill value={r.eligible ? "VERIFIED" : null} label={r.eligible ? x.eligible : x.notEligible} /> },
                {
                  key: "pending",
                  header: x.cols.pending,
                  cell: (r) =>
                    r.pending ? (
                      <span className="text-xs">
                        <span className="font-bold">{r.pending.eligible ? x.requestEligible : x.requestNotEligible}</span> · <DateText value={r.pending.requestedAt} />
                        {r.pending.requestedById === user?.id && <span className="block text-muted">{x.ownRequest}</span>}
                      </span>
                    ) : "—",
                },
                {
                  key: "act",
                  header: x.cols.actions,
                  cell: (r) => (
                    <span className="flex flex-wrap gap-1">
                      {can("zakat.manage") && !r.pending && <button type="button" className="btn-admin btn-ghost !min-h-9" onClick={() => { setEligible(!r.eligible); setDialog({ kind: "request", target: r }); }}><Plus className="size-4" aria-hidden="true" /> {x.request}</button>}
                      {can("zakat.approve") && r.pending && r.pending.requestedById !== user?.id && (
                        <>
                          <button type="button" className="btn-admin btn-ghost !min-h-9" onClick={() => setDialog({ kind: "approve", target: r })}><BadgeCheck className="size-4" aria-hidden="true" /> {x.approve}</button>
                          <button type="button" className="btn-admin btn-ghost !min-h-9 text-danger" onClick={() => setDialog({ kind: "reject", target: r })}><CircleSlash className="size-4" aria-hidden="true" /> {x.reject}</button>
                        </>
                      )}
                      {can("zakat.approve") && r.eligible && <button type="button" className="btn-admin btn-ghost !min-h-9 text-danger" onClick={() => setDialog({ kind: "revoke", target: r })}><Undo2 className="size-4" aria-hidden="true" /> {x.revoke}</button>}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </WidgetState>
      </Card>

      {dialog && (
        <ConfirmDialog
          open
          danger={dialog.kind === "reject" || dialog.kind === "revoke"}
          title={dialog.kind === "request" ? x.requestTitle : dialog.kind === "revoke" ? x.revokeTitle : `${dialog.kind === "approve" ? x.approve : x.reject} · ${name(dialog.target)}`}
          confirmLabel={dialog.kind === "request" ? x.request : dialog.kind === "approve" ? x.approve : dialog.kind === "reject" ? x.reject : x.revoke}
          busy={m.isPending}
          error={m.isError ? errText(m.error) : null}
          confirmDisabled={!!problem || ((dialog.kind === "reject" || dialog.kind === "revoke") && note.trim().length < 3)}
          onClose={() => { m.reset(); setDialog(null); }}
          onConfirm={() => m.mutate(dialog)}
        >
          <p className="mb-3 font-bold"><bdi>{name(dialog.target)}</bdi></p>
          {dialog.kind === "request" && (
            <div className="space-y-3">
              <Checkbox label={x.makeEligible} checked={eligible} onChange={setEligible} />
              {eligible && (
                <>
                  <TextInput label={x.authority} value={authority} onChange={setAuthority} maxLength={255} required />
                  <TextInput label={x.sdi} value={sdi} onChange={setSdi} maxLength={255} required />
                  {problem && <p className="text-sm text-warn" role="status">{x.refsRequired}</p>}
                </>
              )}
            </div>
          )}
          {dialog.kind === "approve" && dialog.target.pending && (
            <dl className="mb-3 space-y-1 text-sm">
              <div><dt className="inline text-muted">{x.authority}: </dt><dd className="inline"><bdi>{dialog.target.pending.authorityReference ?? "—"}</bdi></dd></div>
              <div><dt className="inline text-muted">{x.sdi}: </dt><dd className="inline"><bdi>{dialog.target.pending.sdiAcceptanceReference ?? "—"}</bdi></dd></div>
            </dl>
          )}
          {dialog.kind === "revoke" && <p className="mb-3">{x.revokeBody}</p>}
          <TextArea label={dialog.kind === "request" || dialog.kind === "approve" ? x.note : x.reason} value={note} onChange={setNote} rows={2} maxLength={500} required={dialog.kind === "reject" || dialog.kind === "revoke"} />
          {dialog.target.history.length > 0 && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer font-bold">{x.history}</summary>
              <ul className="mt-2 space-y-1">
                {dialog.target.history.map((h) => (
                  <li key={h.id}>{x.statuses[h.status]} · {h.eligible ? x.requestEligible : x.requestNotEligible} · <DateText value={h.decidedAt ?? h.requestedAt} /></li>
                ))}
              </ul>
            </details>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
