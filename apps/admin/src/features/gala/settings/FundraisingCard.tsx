"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BadgeCheck, CheckCircle2, CircleSlash, Undo2 } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { Select, TextArea, TextInput } from "@/components/content/ui";
import { ConfirmDialog, DateText, DetailGrid, Notice, Ref } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useSdiError } from "@/features/finance/sdi/shared";
import { canRecordApproval, clearedBy, type ApprovalStep, type FundraisingView } from "@/lib/fundraising-schemas";
import { ISO_WITH_OFFSET } from "@/lib/gala";
import type { GalaEvent } from "@/lib/gala-schemas";
import { fill } from "@/lib/i18n";
import { listCauses } from "@/services/content";
import * as svc from "@/services/fundraising";

/**
 * Phase 12B — the single approved Gala project (SDI agreement). Read: events.read. Edit: events.manage. Approvals and revocations:
 * events.approve, by a DIFFERENT administrator than the last editor (four eyes, enforced by the API too). The project is chosen
 * by a person from existing, non-DEMO project records — never preselected.
 */
export function FundraisingCard({ ev }: { ev: GalaEvent }) {
  const { t } = useLocale();
  const x = t.sdi.fundraising;
  const q = useQuery({ queryKey: ["gala", "fundraising", ev.id], queryFn: () => svc.getFundraising(ev.id) });
  return (
    <Card labelledBy="gs-fr">
      <CardHeader id="gs-fr" title={x.title} subtitle={x.subtitle} />
      <WidgetState q={q} minH="min-h-40">{q.data && <Body key={q.data.config?.updatedAt ?? "none"} ev={ev} v={q.data} />}</WidgetState>
    </Card>
  );
}

type Dialog = null | "save" | { approve: ApprovalStep } | { revoke: ApprovalStep };

function Body({ ev, v }: { ev: GalaEvent; v: FundraisingView }) {
  const { t } = useLocale();
  const x = t.sdi.fundraising;
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const errText = useSdiError();
  const c = v.config;
  const canEdit = can("events.manage");
  const approver = can("events.approve");
  const mayApprove = canRecordApproval(c, user?.id, approver);
  const init = {
    projectId: c?.projectId ?? "",
    projectPlanReference: c?.projectPlanReference ?? "",
    donationsCloseAt: c?.donationsCloseAt ?? "",
    ticketRefundPolicyEn: c?.ticketRefundPolicyEn ?? "",
    ticketRefundPolicyAr: c?.ticketRefundPolicyAr ?? "",
  };
  const [f, setF] = useState(init);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [note, setNote] = useState("");
  const projects = useQuery({ queryKey: ["gala", "fundraising-projects"], queryFn: () => listCauses({}), enabled: canEdit && can("programmes.read") });
  const changed = (Object.keys(init) as (keyof typeof init)[]).filter((k) => f[k].trim() !== init[k]);
  const closeErr = f.donationsCloseAt.trim() && !ISO_WITH_OFFSET.test(f.donationsCloseAt.trim()) ? t.gala.errors.datetime : null;
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["gala", "fundraising", ev.id] });
    setDialog(null);
    setNote("");
  };
  const save = useMutation({
    mutationFn: () => svc.updateFundraising(ev.id, Object.fromEntries(changed.map((k) => [k, f[k].trim() || null]))),
    onSuccess: done,
  });
  const approve = useMutation({ mutationFn: (s: ApprovalStep) => svc.approveFundraising(ev.id, s, note), onSuccess: done });
  const revoke = useMutation({ mutationFn: (s: ApprovalStep) => svc.revokeFundraising(ev.id, s, note.trim()), onSuccess: done });

  const flag = (ok: boolean, yes: string, no: string) => (ok ? <span className="inline-flex items-center gap-1 text-ok"><CheckCircle2 className="size-4" aria-hidden="true" /> {yes}</span> : <span className="inline-flex items-center gap-1 text-muted"><CircleSlash className="size-4" aria-hidden="true" /> {no}</span>);
  const approvedAt = (at: string | null | undefined, yes = x.approved) => (at ? <span className="inline-flex flex-wrap items-center gap-2">{flag(true, yes, "")}<DateText value={at} /></span> : flag(false, "", x.pending));
  const s = v.state;
  const giving = s.givingAvailable ? flag(true, x.available, "") : s.authorized && !s.campaignOpen ? <span className="text-warn">{x.closed}</span> : flag(false, "", x.unavailable);
  const actions = (step: ApprovalStep, approved: boolean) =>
    approver && c ? (
      approved ? (
        <button type="button" className="btn-admin btn-ghost !min-h-8 !py-1 text-xs text-danger" onClick={() => setDialog({ revoke: step })}><Undo2 className="size-3.5" aria-hidden="true" /> {x.revoke}</button>
      ) : (
        <button type="button" className="btn-admin btn-ghost !min-h-8 !py-1 text-xs" disabled={!mayApprove} onClick={() => setDialog({ approve: step })} data-testid={`approve-${step}`}><BadgeCheck className="size-3.5" aria-hidden="true" /> {x.approve}</button>
      )
    ) : null;
  const row = (label: string, value: React.ReactNode, step?: ApprovalStep, approved?: boolean): [string, React.ReactNode] => [label, <span key={label} className="flex flex-wrap items-center gap-2">{value}{step && actions(step, !!approved)}</span>];
  const projectOptions = (projects.data ?? []).filter((p) => p.provenance !== "DEMO").map((p) => ({ value: p.id, label: `${p.nameEn} · ${p.code}` }));

  return (
    <div className="space-y-5" data-testid="gala-fundraising">
      <DetailGrid
        cols={2}
        items={[
          [x.project, v.project ? <span key="p"><bdi className="font-bold">{v.project.nameEn}</bdi> <Ref className="text-xs">{v.project.code}</Ref>{v.project.programme && <span className="block text-xs text-muted">{v.project.programme.nameEn}</span>}</span> : <span className="text-muted">{x.noProject}</span>],
          [x.planReference, c?.projectPlanReference ? <bdi key="r">{c.projectPlanReference}</bdi> : "—"],
          row(x.planApproval, approvedAt(c?.projectPlanApprovedAt), "PROJECT_PLAN", !!c?.projectPlanApprovedAt),
          [x.closesAt, c?.donationsCloseAt ? <DateText key="d" value={c.donationsCloseAt} /> : "—"],
          row(x.publicAuthorization, approvedAt(c?.fundraisingAuthorizedAt, x.authorized), "PUBLIC_FUNDRAISING", !!c?.fundraisingAuthorizedAt),
          [x.givingForm, v.env.galaGivingSwitch ? (v.env.galaGivingFormConfigured ? flag(true, x.available, "") : <span className="text-warn">{x.formMissing}</span>) : <span className="text-muted">{x.switchOff}</span>],
          [x.givingState, <span key="g" data-testid="public-giving-state">{giving}</span>],
          row(x.donationRefund, approvedAt(c?.donationRefundNoticeApprovedAt), "DONATION_REFUND_NOTICE", !!c?.donationRefundNoticeApprovedAt),
          row(x.ticketPolicy, approvedAt(c?.ticketRefundPolicyApprovedAt), "TICKET_REFUND_POLICY", !!c?.ticketRefundPolicyApprovedAt),
        ]}
      />
      {approver && c && !mayApprove && <Notice tone="gold"><p>{x.selfApproval}</p></Notice>}
      <Notice><p>{fill(x.scope, { general: v.env.generalGivingAuthorized ? x.scopeYes : x.scopeNo, programme: v.env.programmeGivingAuthorized ? x.scopeYes : x.scopeNo })}</p></Notice>
      {/* Nov 19 2026: MEKI requests recorded as PENDING SDI AGREEMENT — informational only, nothing here changes a gate. */}
      <Notice tone="gold">
        <p className="font-bold">{t.sdi.pending.title}</p>
        <ul className="mt-2 list-disc space-y-1 ps-5" data-testid="pending-sdi-agreement">{t.sdi.pending.items.map((i) => <li key={i}>{i}</li>)}</ul>
      </Notice>

      {canEdit && (
        <div className="space-y-4 border-t border-line pt-5">
          <Select label={x.project} value={f.projectId} onChange={(val) => setF({ ...f, projectId: val })} emptyLabel={x.selectProject} options={projectOptions} hint={x.demoExcluded} />
          <TextInput label={x.planReference} hint={x.planReferenceHint} value={f.projectPlanReference} onChange={(val) => setF({ ...f, projectPlanReference: val })} maxLength={255} />
          <TextInput label={x.closesAt} hint={x.closesAtHint} value={f.donationsCloseAt} onChange={(val) => setF({ ...f, donationsCloseAt: val })} error={closeErr} dir="ltr" placeholder="2027-01-31T23:59:59-05:00" maxLength={40} />
          <div className="grid gap-4 md:grid-cols-2">
            <TextArea label={`${x.ticketPolicy} (EN)`} hint={x.ticketPolicyHint} value={f.ticketRefundPolicyEn} onChange={(val) => setF({ ...f, ticketRefundPolicyEn: val })} rows={3} maxLength={4000} dir="ltr" />
            <TextArea label={`${x.ticketPolicy} (AR)`} value={f.ticketRefundPolicyAr} onChange={(val) => setF({ ...f, ticketRefundPolicyAr: val })} rows={3} maxLength={4000} dir="rtl" />
          </div>
          <button type="button" className="btn-admin btn-primary" disabled={changed.length === 0 || !!closeErr} onClick={() => setDialog("save")} data-testid="fundraising-save">{x.save}</button>
        </div>
      )}

      {dialog === "save" && (
        <ConfirmDialog open title={x.saveTitle} confirmLabel={x.save} busy={save.isPending} error={save.isError ? errText(save.error) : null} onClose={() => { save.reset(); setDialog(null); }} onConfirm={() => save.mutate()}>
          <p>{x.saveBody}</p>
          {clearedBy(changed, c).length > 0 && <Notice tone="warn"><p>{fill(x.clears, { steps: clearedBy(changed, c).map((k) => x.steps[k]).join(", ") })}</p></Notice>}
        </ConfirmDialog>
      )}
      {dialog && typeof dialog === "object" && "approve" in dialog && (
        <ConfirmDialog open title={fill(x.approveTitle, { step: x.steps[dialog.approve] })} confirmLabel={x.approve} busy={approve.isPending} error={approve.isError ? errText(approve.error) : null} onClose={() => { approve.reset(); setDialog(null); }} onConfirm={() => approve.mutate(dialog.approve)}>
          <p>{x.approveBody}</p>
          <TextArea label={x.note} value={note} onChange={setNote} rows={2} maxLength={500} />
        </ConfirmDialog>
      )}
      {dialog && typeof dialog === "object" && "revoke" in dialog && (
        <ConfirmDialog open danger title={fill(x.revokeTitle, { step: x.steps[dialog.revoke] })} confirmLabel={x.revoke} busy={revoke.isPending} error={revoke.isError ? errText(revoke.error) : null} confirmDisabled={note.trim().length < 3} onClose={() => { revoke.reset(); setDialog(null); }} onConfirm={() => revoke.mutate(dialog.revoke)}>
          <p>{x.revokeBody}</p>
          <TextArea label={x.reason} value={note} onChange={setNote} rows={2} maxLength={500} required />
        </ConfirmDialog>
      )}
    </div>
  );
}
