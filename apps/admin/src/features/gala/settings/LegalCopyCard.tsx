"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BadgeCheck, CheckCircle2, CircleSlash, FileText, Globe, Undo2 } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { TextArea, TextInput } from "@/components/content/ui";
import { ConfirmDialog, DateText, Notice } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useSdiError } from "@/features/finance/sdi/shared";
import { amountsProblem, publishBlocker, type LegalCopy, type LegalKind } from "@/lib/legal-copy-schemas";
import { SDI_WORDING_NOV21, SDI_WORDING_SOURCE } from "@/lib/legal-copy-source";
import type { GalaEvent } from "@/lib/gala-schemas";
import { fill } from "@/lib/i18n";
import * as svc from "@/services/legal-copy";

/**
 * Nov 19 2026 — the three MEKI legal drafts for the Gala. Wording is pasted verbatim (never generated); SDI approval is recorded
 * by a different administrator; publishing is only possible for the two disclosures (never the receipt wording) and only when
 * the stated price equals the live ticket price. Read: events.read · edit: events.manage · approve/publish: events.approve.
 */
export function LegalCopyCard({ ev }: { ev: GalaEvent }) {
  const { t } = useLocale();
  const x = t.sdi.legal;
  const q = useQuery({ queryKey: ["gala", "legal-copy", ev.id], queryFn: () => svc.listLegalCopy(ev.id) });
  return (
    <Card labelledBy="gs-legal">
      <CardHeader id="gs-legal" title={x.title} subtitle={x.subtitle} />
      <WidgetState q={q} minH="min-h-40">
        {q.data && (
          <div className="space-y-6" data-testid="gala-legal-copy">
            <p className="text-sm text-muted">{fill(x.live, { price: q.data.liveTicketPrice ?? "—" })}</p>
            {q.data.items.map((c) => <Item key={`${c.kind}-${c.sdiApprovedAt ?? ""}-${c.publishedAt ?? ""}-${c.textEn ?? ""}`} ev={ev} c={c} live={q.data.liveTicketPrice} />)}
          </div>
        )}
      </WidgetState>
    </Card>
  );
}

type Dialog = null | "save" | "approve" | "publish" | { withdraw: "SDI_APPROVAL" | "PUBLICATION" };

function Item({ ev, c, live }: { ev: GalaEvent; c: LegalCopy; live: string | null }) {
  const { t } = useLocale();
  const x = t.sdi.legal;
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const errText = useSdiError();
  const init = { textEn: c.textEn ?? "", textAr: c.textAr ?? "", ticketPrice: c.ticketPrice ?? "", fairMarketValue: c.fairMarketValue ?? "", deductibleAmount: c.deductibleAmount ?? "", sourceNote: c.sourceNote ?? "" };
  const [f, setF] = useState(init);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [note, setNote] = useState("");
  const canEdit = can("events.manage");
  const approver = can("events.approve");
  const dirty = (Object.keys(init) as (keyof typeof init)[]).some((k) => f[k].trim() !== init[k]);
  const amounts = amountsProblem(f.ticketPrice, f.fairMarketValue, f.deductibleAmount);
  const blocker = publishBlocker(c, live);
  const src = SDI_WORDING_NOV21[c.kind as LegalKind];
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["gala", "legal-copy", ev.id] });
    setDialog(null);
    setNote("");
  };
  const val = (v: string) => v.trim() || null;
  const save = useMutation({ mutationFn: () => svc.updateLegalCopy(ev.id, c.kind as LegalKind, { textEn: val(f.textEn), textAr: val(f.textAr), ticketPrice: val(f.ticketPrice), fairMarketValue: val(f.fairMarketValue), deductibleAmount: val(f.deductibleAmount), sourceNote: val(f.sourceNote) }), onSuccess: done });
  const approve = useMutation({ mutationFn: () => svc.recordSdiApproval(ev.id, c.kind as LegalKind, note.trim()), onSuccess: done });
  const publish = useMutation({ mutationFn: () => svc.publishLegalCopy(ev.id, c.kind as LegalKind), onSuccess: done });
  const withdraw = useMutation({ mutationFn: (what: "SDI_APPROVAL" | "PUBLICATION") => svc.withdrawLegalCopy(ev.id, c.kind as LegalKind, what, note.trim()), onSuccess: done });
  const state = (ok: boolean, yes: string, no: string, at?: string | null) => (ok ? <span className="inline-flex flex-wrap items-center gap-1 text-ok"><CheckCircle2 className="size-4" aria-hidden="true" /> {yes} {at && <DateText value={at} />}</span> : <span className="inline-flex items-center gap-1 text-muted"><CircleSlash className="size-4" aria-hidden="true" /> {no}</span>);

  return (
    <section className="rounded-xl border border-line p-4" aria-label={x.kinds[c.kind]} data-kind={c.kind}>
      <h3 className="mb-2 text-sm font-bold text-ink">{x.kinds[c.kind]}</h3>
      <div className="mb-3 flex flex-wrap gap-4 text-xs">
        {state(!!c.sdiApprovedAt, x.sdiApproved, x.notApproved, c.sdiApprovedAt)}
        {c.publishable ? state(!!c.publishedAt, x.published, x.notPublished, c.publishedAt) : <span className="text-muted">{x.receiptNote}</span>}
      </div>
      {canEdit ? (
        <div className="space-y-3">
          <TextArea label={x.textEn} value={f.textEn} onChange={(v) => setF({ ...f, textEn: v })} rows={4} maxLength={10000} dir="ltr" />
          <TextArea label={x.textAr} value={f.textAr} onChange={(v) => setF({ ...f, textAr: v })} rows={3} maxLength={10000} dir="rtl" />
          <div className="grid gap-3 sm:grid-cols-3">
            <TextInput label={x.price} value={f.ticketPrice} onChange={(v) => setF({ ...f, ticketPrice: v.replace(/[^\d.]/g, "") })} dir="ltr" inputMode="decimal" maxLength={15} />
            <TextInput label={x.fmv} value={f.fairMarketValue} onChange={(v) => setF({ ...f, fairMarketValue: v.replace(/[^\d.]/g, "") })} dir="ltr" inputMode="decimal" maxLength={15} />
            <TextInput label={x.deductible} value={f.deductibleAmount} onChange={(v) => setF({ ...f, deductibleAmount: v.replace(/[^\d.]/g, "") })} dir="ltr" inputMode="decimal" maxLength={15} />
          </div>
          {amounts && <p className="text-sm text-warn" role="status">{x.amounts[amounts]}</p>}
          <TextInput label={x.source} value={f.sourceNote} onChange={(v) => setF({ ...f, sourceNote: v })} maxLength={255} />
          <div className="flex flex-wrap items-center gap-2">
            {/* Phase 13B: fills the editor with the verbatim 21 Nov wording; nothing is saved, approved or published by this. */}
            {f.textEn.trim() !== src.textEn && (
              <button type="button" className="btn-admin btn-ghost" data-testid={`legal-load-${c.kind}`} onClick={() => setF({ ...f, textEn: src.textEn, ticketPrice: src.ticketPrice, fairMarketValue: src.fairMarketValue, deductibleAmount: src.deductibleAmount, sourceNote: SDI_WORDING_SOURCE })}>
                <FileText className="size-4" aria-hidden="true" /> {x.loadSource}
              </button>
            )}
            <button type="button" className="btn-admin btn-primary" disabled={!dirty || !!amounts} onClick={() => setDialog("save")}>{x.save}</button>
          </div>
          {f.textEn.trim() === src.textEn && <p className="text-xs text-muted">{x.sourceMatches}</p>}
        </div>
      ) : (
        c.textEn && <p className="whitespace-pre-line text-sm">{c.textEn}</p>
      )}
      {approver && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
          {!c.sdiApprovedAt && <button type="button" className="btn-admin btn-ghost" disabled={!c.textEn || c.updatedById === user?.id} onClick={() => setDialog("approve")}><BadgeCheck className="size-4" aria-hidden="true" /> {x.recordApproval}</button>}
          {c.publishable && !c.publishedAt && <button type="button" className="btn-admin btn-ghost" disabled={!!blocker} onClick={() => setDialog("publish")}><Globe className="size-4" aria-hidden="true" /> {x.publish}</button>}
          {c.publishedAt && <button type="button" className="btn-admin btn-ghost text-danger" onClick={() => setDialog({ withdraw: "PUBLICATION" })}><Undo2 className="size-4" aria-hidden="true" /> {x.withdraw} · {x.published}</button>}
          {c.sdiApprovedAt && <button type="button" className="btn-admin btn-ghost text-danger" onClick={() => setDialog({ withdraw: "SDI_APPROVAL" })}><Undo2 className="size-4" aria-hidden="true" /> {x.withdraw} · {x.sdiApproved}</button>}
        </div>
      )}
      {approver && c.sdiApprovedAt && blocker && blocker !== "notApproved" && <p className="mt-2 text-xs text-warn">{x.blockers[blocker]}</p>}

      {dialog === "save" && (
        <ConfirmDialog open title={x.saveTitle} confirmLabel={x.save} busy={save.isPending} error={save.isError ? errText(save.error) : null} onClose={() => { save.reset(); setDialog(null); }} onConfirm={() => save.mutate()}>
          {(c.sdiApprovedAt || c.publishedAt) && <Notice tone="warn"><p>{x.saveBody}</p></Notice>}
        </ConfirmDialog>
      )}
      {dialog === "approve" && (
        <ConfirmDialog open title={x.approvalTitle} confirmLabel={x.recordApproval} busy={approve.isPending} error={approve.isError ? errText(approve.error) : null} confirmDisabled={note.trim().length < 5} onClose={() => { approve.reset(); setDialog(null); }} onConfirm={() => approve.mutate()}>
          <p>{x.approvalBody}</p>
          <TextArea label={x.approvalNote} value={note} onChange={setNote} rows={2} maxLength={500} required />
        </ConfirmDialog>
      )}
      {dialog === "publish" && (
        <ConfirmDialog open title={x.publishTitle} confirmLabel={x.publish} busy={publish.isPending} error={publish.isError ? errText(publish.error) : null} onClose={() => { publish.reset(); setDialog(null); }} onConfirm={() => publish.mutate()}>
          <p>{x.publishBody}</p>
        </ConfirmDialog>
      )}
      {dialog && typeof dialog === "object" && (
        <ConfirmDialog open danger title={x.withdrawTitle} confirmLabel={x.withdraw} busy={withdraw.isPending} error={withdraw.isError ? errText(withdraw.error) : null} confirmDisabled={note.trim().length < 3} onClose={() => { withdraw.reset(); setDialog(null); }} onConfirm={() => withdraw.mutate(dialog.withdraw)}>
          <p>{x.withdrawBody}</p>
          <TextArea label={x.reason} value={note} onChange={setNote} rows={2} maxLength={500} required />
        </ConfirmDialog>
      )}
    </section>
  );
}
