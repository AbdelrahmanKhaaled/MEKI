"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CircleSlash, Eye, RefreshCw, Send, ShieldAlert } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { Checkbox, TextArea, TextInput } from "@/components/content/ui";
import { ConfirmDialog, DataTable, DateText, DetailGrid, Money, Notice, PageHeader, Ref, SearchFilter, SelectFilter, useErrorText } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { ApiError } from "@/lib/api";
import { evidenceAr, evidenceEn } from "@/lib/i18n-evidence";
import * as svc from "@/services/manual-evidence";
import { FinancePage } from "../FinancePage";

const REF = /^(DN|EB)-[A-Z0-9]{12}$/;
const STATE_TONE: Record<string, string> = {
  PENDING_REVIEW: "bg-warn/10 text-warn",
  AWAITING_APPROVAL: "bg-harvest-gold/15 text-gold-text",
  APPROVED: "bg-ok/10 text-ok",
  REJECTED: "bg-danger/10 text-danger",
};
/** Fields that are free text in the user's language; everything else is an identifier / machine value (LTR). */
const TEXT_FIELDS = new Set(["note"]);

/**
 * Phase 14B — private SDI payment evidence. Finance staff record an ORIGINAL SDI confirmation email against a pending EB- booking
 * or DN- Gala gift; a DIFFERENT administrator rejects it or (only once SDI_MANUAL_CONFIRMATION_ENABLED is deliberately turned on
 * after an authentic email sample is validated) approves it. Evidence is immutable; corrections are new submissions.
 * Read/submit: sdi.reports.upload · decide: sdi.reports.upload + sdi.reports.approve (never your own submission).
 */
export function ManualEvidencePage() {
  const { locale, t } = useLocale();
  const c = locale === "ar" ? evidenceAr : evidenceEn;
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.donors }, { label: c.title }]} anyOf={["sdi.reports.upload"]}>
      <Queue />
    </FinancePage>
  );
}

function Queue() {
  const { locale } = useLocale();
  const c = locale === "ar" ? evidenceAr : evidenceEn;
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const fallback = useErrorText();
  const errText = (e: unknown) => (e instanceof ApiError && c.errors[e.code]) || fallback(e);
  const [status, setStatus] = useState("");
  const [reference, setReference] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<"SUBMIT" | "APPROVE" | "REJECT" | null>(null);

  const validFilter = !reference || REF.test(reference);
  const q = useQuery({ queryKey: ["manual-evidence", status, reference], queryFn: () => svc.listEvidence(status || undefined, reference || undefined), enabled: validFilter });
  const detail = useQuery({ queryKey: ["manual-evidence", "detail", selectedId], queryFn: () => svc.getEvidence(selectedId!), enabled: !!selectedId });
  const selected = q.data?.items.find((e) => e.id === selectedId) ?? null;

  const submit = useMutation({
    mutationFn: () => svc.submitEvidence({ ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()])), originalSdiEmail: original }),
    onSuccess: (e) => {
      setConfirm(null);
      setFields({});
      setOriginal(false);
      setSelectedId(e.id);
      void qc.invalidateQueries({ queryKey: ["manual-evidence"] });
    },
  });
  const decide = useMutation({
    mutationFn: (decision: "APPROVE" | "REJECT") => svc.decideEvidence(selectedId!, decision, note.trim()),
    onSuccess: () => {
      setConfirm(null);
      setNote("");
      void qc.invalidateQueries();
    },
  });

  const busy = submit.isPending || decide.isPending;
  const canSubmit = !!fields.reference && REF.test(fields.reference.trim().toUpperCase()) && (fields.note ?? "").trim().length >= 10;
  const canDecide = !!selected && can("sdi.reports.approve") && selected.submittedById !== user?.id && ["PENDING_REVIEW", "AWAITING_APPROVAL"].includes(selected.status);
  const who = (id: string | null) => (!id ? "—" : id === user?.id ? c.you : c.another);
  const pill = (s: string) => <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${STATE_TONE[s] ?? "bg-bg text-muted"}`}>{c.states[s as keyof typeof c.states] ?? s}</span>;
  const dialogError = confirm === "SUBMIT" ? submit.error : decide.error;

  return (
    <>
      <PageHeader title={c.title} subtitle={c.intro} />
      {!q.data?.approvalEnabled && (
        <Notice tone="warn" icon={ShieldAlert}>
          <p data-testid="evidence-approval-disabled">{c.disabled}</p>
        </Notice>
      )}
      <Notice><p>{c.privacy}</p></Notice>

      <Card labelledBy="ev-new">
        <CardHeader id="ev-new" title={c.newTitle} />
        <form
          className="grid gap-4 md:grid-cols-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && canSubmit) setConfirm("SUBMIT");
          }}
        >
          {Object.entries(c.fields).map(([key, label]) =>
            key === "note" ? (
              <div key={key} className="md:col-span-2">
                <TextArea label={label} value={fields[key] ?? ""} onChange={(v) => setFields((f) => ({ ...f, [key]: v }))} rows={3} maxLength={500} required disabled={busy} />
              </div>
            ) : (
              <TextInput
                key={key}
                label={label}
                value={fields[key] ?? ""}
                onChange={(v) => setFields((f) => ({ ...f, [key]: key === "reference" || key === "evidenceReference" || key === "currency" || key === "classification" ? v.toUpperCase() : v }))}
                dir={TEXT_FIELDS.has(key) ? undefined : "ltr"}
                required={key === "reference"}
                maxLength={key === "formUrl" ? 1000 : 255}
                placeholder={key === "occurredAt" || key === "emailReceivedAt" ? c.isoHint : key === "protectedReference" ? "sdi-evidence:…" : undefined}
                disabled={busy}
              />
            ),
          )}
          <div className="md:col-span-2">
            <Checkbox label={c.original} checked={original} onChange={setOriginal} disabled={busy} />
          </div>
          <div className="md:col-span-2">
            <button type="submit" className="btn-admin btn-primary" disabled={busy || !canSubmit}>
              <Send className="size-4" aria-hidden="true" /> {c.submit}
            </button>
          </div>
        </form>
      </Card>

      <Card labelledBy="ev-q">
        <CardHeader
          id="ev-q"
          title={c.queueTitle}
          right={
            <button type="button" className="btn-admin btn-ghost" onClick={() => void q.refetch()}>
              <RefreshCw className="size-4" aria-hidden="true" /> {c.refresh}
            </button>
          }
        />
        <div className="mb-4 flex flex-wrap gap-3">
          <SearchFilter label={c.filter} value={reference} onChange={(v) => setReference(v.trim().toUpperCase())} />
          <SelectFilter label={c.all} allLabel={c.all} value={status} onChange={setStatus} options={Object.entries(c.states).map(([value, label]) => ({ value, label }))} />
        </div>
        <WidgetState q={q} isEmpty={q.data?.items.length === 0} emptyText={c.empty} minH="min-h-40">
          {q.data && (
            <DataTable
              caption={c.queueTitle}
              minW="min-w-[48rem]"
              rows={q.data.items}
              rowKey={(e) => e.id}
              columns={[
                { key: "ref", header: c.fields.reference, cell: (e) => <Ref className="font-bold">{e.reference}</Ref> },
                { key: "st", header: c.all, cell: (e) => pill(e.status) },
                { key: "amt", header: c.fields.amount, numeric: true, cell: (e) => (e.amount && e.currency ? <Money value={e.amount} currency={e.currency} /> : "—") },
                { key: "ext", header: c.fields.externalPaymentId, cell: (e) => (e.externalPaymentId ? <Ref>{e.externalPaymentId}</Ref> : "—") },
                { key: "by", header: c.submitted, cell: (e) => who(e.submittedById) },
                { key: "at", header: c.created, cell: (e) => <DateText value={e.createdAt} /> },
                {
                  key: "act",
                  header: "",
                  cell: (e) => (
                    <button type="button" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-meki-green-dark hover:bg-bg" aria-pressed={selectedId === e.id} onClick={() => { setSelectedId(e.id); setNote(""); decide.reset(); }}>
                      <Eye className="size-4" aria-hidden="true" /> {c.select}
                    </button>
                  ),
                },
              ]}
            />
          )}
        </WidgetState>
      </Card>

      {selected && (
        <Card labelledBy="ev-d">
          <CardHeader id="ev-d" title={c.detailTitle} right={pill(selected.status)} />
          <DetailGrid
            cols={2}
            items={[
              ...Object.entries(c.fields).map(([key, label]): [string, React.ReactNode] => {
                const v = selected[key as keyof svc.Evidence];
                const shown = v === null || v === undefined || v === "" ? "—" : key === "occurredAt" || key === "emailReceivedAt" ? <DateText value={String(v)} /> : <bdi className="break-all" dir={TEXT_FIELDS.has(key) ? undefined : "ltr"}>{String(v)}</bdi>;
                return [label, shown];
              }),
              [c.submitted, <span key="s">{who(selected.submittedById)} · <DateText value={selected.createdAt} /></span>],
              [c.decided, <span key="d">{who(selected.decidedById)}{selected.decidedAt ? <> · <DateText value={selected.decidedAt} /></> : null}{selected.decisionNote ? <> · <bdi>{selected.decisionNote}</bdi></> : null}</span>],
              [c.reconciled, selected.reportReconciledAt ? <Ref key="r">{selected.reportImportId}</Ref> : c.unreconciled],
            ]}
          />
          {selected.reviewReason && <Notice tone="warn"><p>{selected.reviewReason}</p></Notice>}
          {detail.data && detail.data.history.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-bold text-ink">{c.history}</h3>
              <ol className="space-y-1 text-sm">
                {detail.data.history.map((h, i) => (
                  <li key={i} className="flex flex-wrap gap-2"><DateText value={h.createdAt} /> <span className="font-mono text-xs">{h.action}</span> · {who(h.actorId)}</li>
                ))}
              </ol>
            </div>
          )}
          {canDecide && (
            <div className="mt-5 space-y-3 border-t border-line pt-4">
              <TextArea label={c.reason} value={note} onChange={setNote} rows={2} maxLength={500} required disabled={busy} />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-admin btn-primary" disabled={busy || note.trim().length < 10 || !q.data?.approvalEnabled || selected.status !== "AWAITING_APPROVAL"} onClick={() => setConfirm("APPROVE")}>
                  <BadgeCheck className="size-4" aria-hidden="true" /> {c.approve}
                </button>
                <button type="button" className="btn-admin btn-ghost text-danger" disabled={busy || note.trim().length < 10} onClick={() => setConfirm("REJECT")}>
                  <CircleSlash className="size-4" aria-hidden="true" /> {c.reject}
                </button>
              </div>
            </div>
          )}
          {decide.isError && !confirm && <p className="mt-3 text-sm text-danger" role="alert">{errText(decide.error)}</p>}
        </Card>
      )}

      {confirm && (
        <ConfirmDialog
          open
          danger={confirm === "REJECT"}
          title={confirm === "SUBMIT" ? c.newTitle : confirm === "APPROVE" ? c.approve : c.reject}
          confirmLabel={confirm === "SUBMIT" ? c.submit : confirm === "APPROVE" ? c.approve : c.reject}
          busy={busy}
          error={dialogError ? errText(dialogError) : null}
          onClose={() => { submit.reset(); decide.reset(); setConfirm(null); }}
          onConfirm={() => (confirm === "SUBMIT" ? submit.mutate() : decide.mutate(confirm))}
        >
          <p className="mb-2"><Ref className="font-bold">{confirm === "SUBMIT" ? fields.reference : selected?.reference}</Ref></p>
          <p>{confirm === "SUBMIT" ? c.privacy : note}</p>
        </ConfirmDialog>
      )}
    </>
  );
}
