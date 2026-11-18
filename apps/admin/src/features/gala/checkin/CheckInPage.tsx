"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { CheckCircle2, History, Search, TriangleAlert, XCircle } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { ConfirmDialog, DateText, Notice, PageHeader, Ref } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useHref } from "@/features/finance/FinancePage";
import { useCheckInStats, useDoorLookup, useGalaMutation } from "@/hooks/useGalaData";
import { createScanGuard, galaTone, lookupError, manualCheckInGate, normalizeScan, undoCheckInGate } from "@/lib/gala";
import type { CheckInResponse, GalaEvent, LookupRow } from "@/lib/gala-schemas";
import { fill } from "@/lib/i18n";
import * as svc from "@/services/gala";
import { GalaPage, Progress, ReasonDialog, Stat, TicketStatusBadge, useGalaError } from "../shared";
import { QRScanner } from "./QRScanner";

export function CheckInPage() {
  const { t } = useLocale();
  return (
    <GalaPage crumbs={[{ label: t.gala.checkin.title }]} anyOf={["gala.checkin.validate"]}>
      {(ev) => <CheckIn ev={ev} />}
    </GalaPage>
  );
}

function CheckIn({ ev }: { ev: GalaEvent }) {
  const { t } = useLocale();
  const href = useHref();
  const errText = useGalaError();
  const x = t.gala.checkin;
  const [verifyOnly, setVerifyOnly] = useState(false);
  const [result, setResult] = useState<(CheckInResponse & { verifyOnly: boolean }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const guard = useRef(createScanGuard());
  const input = useRef<HTMLInputElement>(null);
  const stats = useCheckInStats(ev.id, true);
  const validate = useGalaMutation((a: { token: string; verifyOnly: boolean }) => svc.validateScan(ev.id, a.token, a.verifyOnly));

  /** One server request per distinct scan; repeats of the same code within 2.5 s and scans while a request runs are ignored. */
  const submit = useCallback(
    (raw: string) => {
      const token = normalizeScan(raw);
      if (!token || !guard.current.tryStart(token)) return;
      setBusy(true);
      setError(null);
      validate.mutate(
        { token, verifyOnly },
        {
          onSuccess: (r) => setResult({ ...r, verifyOnly }),
          onError: (e) => { setResult(null); setError(errText(e)); },
          onSettled: () => { guard.current.done(); setBusy(false); if (input.current) { input.current.value = ""; input.current.focus(); } },
        },
      );
    },
    [validate, verifyOnly, errText],
  );

  return (
    <>
      <PageHeader title={x.title} subtitle={x.subtitle} right={<Link href={href("/gala/check-in/history")} className="btn-admin btn-ghost"><History className="size-4" aria-hidden="true" /> {x.openHistory}</Link>} />
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="min-w-0 space-y-4 xl:col-span-7">
          <Card labelledBy="ci-s">
            <CardHeader id="ci-s" title={x.scanner} />
            <div className="space-y-4">
              <form onSubmit={(e) => { e.preventDefault(); submit(input.current?.value ?? ""); }} className="space-y-2">
                <label htmlFor="scan-input" className="text-xs font-bold text-body">{x.scanInput}</label>
                <div className="flex gap-2">
                  {/* masked: the QR secret is never displayed */}
                  <input id="scan-input" ref={input} type="password" autoComplete="off" autoFocus spellCheck={false} dir="ltr" maxLength={100} disabled={busy} aria-describedby="scan-hint" className="min-h-12 w-full rounded-xl border border-line bg-white px-3 text-base outline-none focus:border-meki-green" data-testid="scan-input" />
                  <button type="submit" className="btn-admin btn-primary !min-h-12 shrink-0" disabled={busy}>{busy ? x.processing : x.submit}</button>
                </div>
                <p id="scan-hint" className="text-xs text-muted">{x.scanHint}</p>
                <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-meki-green" checked={verifyOnly} onChange={(e) => setVerifyOnly(e.target.checked)} data-testid="verify-only" /> {x.verifyOnly}</label>
              </form>
              <QRScanner onCode={submit} paused={busy} />
            </div>
          </Card>
          <CheckInResult result={result} error={error} />
          <Lookup ev={ev} />
        </div>
        <div className="min-w-0 space-y-4 xl:col-span-5">
          <Card labelledBy="ci-st">
            <CardHeader id="ci-st" title={x.stats} />
            <WidgetState q={stats} minH="min-h-32">
              {stats.data && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <Stat label={x.valid} value={stats.data.validTickets} />
                    <Stat label={x.arrived} value={stats.data.checkedIn} tone="ok" testId="stat-arrived" />
                    <Stat label={x.remaining} value={stats.data.remaining} />
                  </div>
                  {stats.data.validTickets > 0 ? (
                    <><p className="flex justify-between text-sm"><span>{t.gala.overview.rate}</span><span className="num font-bold">{stats.data.percentCheckedIn}%</span></p><Progress value={stats.data.percentCheckedIn} label={t.gala.overview.rate} /></>
                  ) : (
                    <p className="text-sm text-muted">{t.gala.overview.noDenominator}</p>
                  )}
                </div>
              )}
            </WidgetState>
          </Card>
          <Notice>{t.gala.common.noTokens}</Notice>
        </div>
      </div>
    </>
  );
}

const PANEL: Record<string, string> = { ok: "border-ok bg-ok/10 text-ok", warn: "border-warn bg-warn/10 text-warn", danger: "border-danger bg-danger/10 text-danger", info: "border-info bg-info/10 text-info", neutral: "border-line bg-bg text-body" };

export function CheckInResult({ result, error }: { result: (CheckInResponse & { verifyOnly: boolean }) | null; error: string | null }) {
  const { t } = useLocale();
  const x = t.gala.checkin;
  if (!result && !error) return <div aria-live="assertive" className="sr-only" />;
  if (error) return <div role="alert" aria-live="assertive" className={`rounded-2xl border-2 p-5 ${PANEL.danger}`} data-testid="checkin-result" data-result="ERROR"><p className="text-lg font-bold">{error}</p></div>;
  const r = result!;
  const tone = r.verifyOnly && r.result === "VALID" ? "info" : galaTone("checkin", r.result);
  const Icon = tone === "ok" ? CheckCircle2 : tone === "warn" || tone === "info" ? TriangleAlert : XCircle;
  return (
    <div role="status" aria-live="assertive" className={`rounded-2xl border-2 p-5 ${PANEL[tone]}`} data-testid="checkin-result" data-result={r.result}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-8 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-bold">{r.verifyOnly && r.result === "VALID" ? x.verified : t.gala.statuses.checkin[r.result]}</p>
          <p className="mt-1 text-sm text-ink">{x.describe[r.result]}</p>
          {r.ticket && (
            <dl className="mt-4 grid gap-2 text-sm text-ink sm:grid-cols-2">
              <div><dt className="text-xs font-bold text-muted">{x.guest}</dt><dd className="text-xl font-bold"><bdi>{r.ticket.guestName}</bdi></dd></div>
              <div><dt className="text-xs font-bold text-muted">{x.ticket}</dt><dd><Ref>{r.ticket.ticketNumber}</Ref></dd></div>
              <div><dt className="text-xs font-bold text-muted">{x.bookingRef}</dt><dd><Ref>{r.ticket.bookingReference}</Ref></dd></div>
              {r.ticket.checkedInAt && <div><dt className="text-xs font-bold text-muted">{x.checkedInAt}</dt><dd><DateText value={r.ticket.checkedInAt} /></dd></div>}
            </dl>
          )}
          <p className="mt-3 text-xs text-muted">{x.scanNext}</p>
        </div>
      </div>
    </div>
  );
}

function Lookup({ ev }: { ev: GalaEvent }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const errText = useGalaError();
  const x = t.gala.checkin;
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const q = useDoorLookup(ev.id, term, term.length >= 3);
  const [dialog, setDialog] = useState<null | { kind: "manual" | "undo"; row: LookupRow }>(null);
  const manual = useGalaMutation((id: string) => svc.manualCheckIn(ev.id, id));
  const undo = useGalaMutation((a: { id: string; reason: string }) => svc.undoCheckIn(ev.id, a.id, a.reason));
  const bad = text ? lookupError(text) : null;
  const close = () => { manual.reset(); undo.reset(); setDialog(null); };
  const canManage = can("gala.checkin.manage");
  return (
    <Card labelledBy="ci-l">
      <CardHeader id="ci-l" title={x.lookup} subtitle={x.lookupHint} />
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!lookupError(text)) setTerm(text.trim()); }}>
        <label htmlFor="door-lookup" className="sr-only">{x.lookup}</label>
        <input id="door-lookup" value={text} onChange={(e) => setText(e.target.value)} maxLength={60} className="min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-meki-green" aria-invalid={!!bad} aria-describedby={bad ? "door-lookup-e" : undefined} data-testid="door-lookup" />
        <button type="submit" className="btn-admin btn-primary shrink-0" disabled={!!bad || !text}><Search className="size-4" aria-hidden="true" /> {x.lookupBtn}</button>
      </form>
      {bad && <p id="door-lookup-e" className="mt-1 text-xs text-danger">{t.gala.errors[bad]}</p>}
      {!canManage && <p className="mt-2 text-xs text-muted">{x.manualLocked}</p>}
      {term && (
        <div className="mt-4">
          <WidgetState q={q} isEmpty={(q.data ?? []).length === 0} emptyText={x.noMatch} minH="min-h-16">
            <ul className="space-y-2" data-testid="lookup-results">
              {(q.data ?? []).map((r) => {
                const m = manualCheckInGate(r, canManage);
                const u = undoCheckInGate(r, canManage);
                return (
                  <li key={r.ticketId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3">
                    <div className="min-w-0">
                      <p className="font-bold text-ink"><bdi>{r.guestName}</bdi></p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs"><Ref>{r.ticketNumber}</Ref><TicketStatusBadge status={r.status} />{r.checkedInAt && <DateText value={r.checkedInAt} />}{!r.bookingConfirmed && <span className="font-bold text-danger">{t.gala.statuses.checkin.PAYMENT_NOT_CONFIRMED}</span>}</p>
                    </div>
                    {canManage && (r.status === "CHECKED_IN" ? (
                      <button type="button" className="btn-admin btn-ghost !min-h-9" disabled={!u.allowed} onClick={() => setDialog({ kind: "undo", row: r })}>{x.undo}</button>
                    ) : (
                      <button type="button" className="btn-admin btn-primary !min-h-9" disabled={!m.allowed} onClick={() => setDialog({ kind: "manual", row: r })} title={m.allowed ? undefined : m.reasons.map((k) => t.gala.gate[k]).join(" ")}>{x.manual}</button>
                    ))}
                  </li>
                );
              })}
            </ul>
          </WidgetState>
        </div>
      )}
      {dialog?.kind === "manual" && (
        <ConfirmDialog open title={fill(x.manualTitle, { name: dialog.row.guestName, n: dialog.row.ticketNumber })} confirmLabel={x.manual} busy={manual.isPending} error={manual.isError ? errText(manual.error) : null} onClose={close} onConfirm={() => manual.mutate(dialog.row.ticketId, { onSuccess: close })}>
          <p>{x.manualBody}</p>
        </ConfirmDialog>
      )}
      {dialog?.kind === "undo" && (
        <ReasonDialog title={fill(x.undoTitle, { n: dialog.row.ticketNumber })} body={<p>{x.undoBody}</p>} confirmLabel={x.undo} busy={undo.isPending} error={undo.isError ? errText(undo.error) : null} onClose={close} onConfirm={(reason) => undo.mutate({ id: dialog.row.ticketId, reason }, { onSuccess: close })} />
      )}
    </Card>
  );
}
