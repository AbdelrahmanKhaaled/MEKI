"use client";

import { useState } from "react";
import { Ban, FileCog, Pencil, Send } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { Modal } from "@/components/common/Modal";
import { useLocale } from "@/components/common/Providers";
import { ErrorState, WidgetSkeleton, WidgetState } from "@/components/common/States";
import { TextArea, TextInput } from "@/components/content/ui";
import { ConfirmDialog, DateText, DetailGrid, Money, Notice, PageHeader, Ref, TestBadge } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useBackHref } from "@/features/finance/FinancePage";
import { AuditList } from "@/features/finance/shared";
import { useEntityAudit } from "@/hooks/useFinanceData";
import { useBooking, useGalaMutation } from "@/hooks/useGalaData";
import { cancelGate, pdfGate, regenerateGate, resendGate } from "@/lib/gala";
import type { BookingDetail, BookingGuest, GalaEvent, Job } from "@/lib/gala-schemas";
import { fill } from "@/lib/i18n";
import * as svc from "@/services/gala";
import { DownloadButton, GalaBadge, GalaPage, ReasonDialog, TicketStatusBadge, useGalaError, GalaGateNotice } from "../shared";

export function BookingDetailPage({ id }: { id: string }) {
  const { t } = useLocale();
  return (
    <GalaPage crumbs={[{ label: t.gala.bookings.title, href: undefined }, { label: t.gala.common.booking }]} anyOf={["gala.bookings.read"]}>
      {(ev) => <Loader ev={ev} id={id} />}
    </GalaPage>
  );
}

function Loader({ ev, id }: { ev: GalaEvent; id: string }) {
  const q = useBooking(ev.id, id, true);
  if (q.isPending) return <WidgetSkeleton rows={6} minH="min-h-80" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} minH="min-h-80" />;
  return <Detail ev={ev} b={q.data} />;
}

type Dialog = null | "cancel" | "resend" | "regenerate" | "purchaser" | { guest: BookingGuest };

function Detail({ ev, b }: { ev: GalaEvent; b: BookingDetail }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const backHref = useBackHref("/gala/bookings");
  const errText = useGalaError();
  const x = t.gala.bookings;
  const c = t.gala.common;
  const [dialog, setDialog] = useState<Dialog>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const cancel = useGalaMutation((reason: string) => svc.cancelBooking(ev.id, b.id, reason));
  const resend = useGalaMutation(() => svc.resendBooking(ev.id, b.id));
  const regen = useGalaMutation(() => svc.regenerateTickets(ev.id, b.id));
  const cG = cancelGate(b, can("gala.bookings.manage"));
  const rsG = resendGate(b, can("gala.bookings.manage"));
  const rgG = regenerateGate(b, can("gala.tickets.manage"));
  const close = () => { cancel.reset(); resend.reset(); regen.reset(); setDialog(null); };
  const canEdit = can("gala.bookings.manage") && (b.bookingStatus === "PENDING" || b.bookingStatus === "CONFIRMED");
  // Phase 12: Zeffy owns tickets, PDFs, QR codes, e-mails and check-in for hosted bookings — MEKI's ticket actions are not offered.
  const zeffy = b.ticketIssuer === "ZEFFY";
  const z = t.sdi.booking;

  return (
    <>
      <PageHeader
        back={{ href: backHref, label: x.title }}
        title={<Ref className="text-2xl">{b.publicReference}</Ref>}
        badges={<><GalaBadge kind="booking" status={b.bookingStatus} /><GalaBadge kind="bookingPayment" status={b.paymentStatus} />{b.isTest && <TestBadge />}</>}
        right={
          <span className="flex flex-wrap gap-2">
            {!zeffy && <button type="button" className="btn-admin btn-ghost" disabled={!rsG.allowed} onClick={() => setDialog("resend")}><Send className="size-4" aria-hidden="true" /> {x.resend}</button>}
            {!zeffy && <button type="button" className="btn-admin btn-ghost" disabled={!rgG.allowed} onClick={() => setDialog("regenerate")}><FileCog className="size-4" aria-hidden="true" /> {x.regenerate}</button>}
            <button type="button" className="btn-admin btn-ghost text-danger" disabled={!cG.allowed} onClick={() => setDialog("cancel")}><Ban className="size-4" aria-hidden="true" /> {x.cancel}</button>
          </span>
        }
      />
      {msg && <p className="rounded-lg bg-ok/10 p-3 text-sm text-ok" role="status">{msg}</p>}
      {b.isTest && <Notice tone="warn">{x.testBooking}</Notice>}
      <Notice><p>{x.financeNote} {c.noTokens}</p></Notice>
      {zeffy && <Notice tone="gold"><p data-testid="zeffy-owned">{z.zeffyNote}</p></Notice>}
      {!cG.allowed && b.bookingStatus !== "CANCELLED" && b.bookingStatus !== "REFUNDED" && <GalaGateNotice gate={cG} title={x.cancel} />}

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="min-w-0 space-y-4 xl:col-span-8">
          <Card labelledBy="bd-i">
            <CardHeader id="bd-i" title={x.info} />
            <DetailGrid
              items={[
                [c.reference, <Ref key="r">{b.publicReference}</Ref>],
                [x.cols.date, <DateText key="d" value={b.createdAt} />],
                [x.cols.guests, <span key="g" className="num">{b.guestCount}</span>],
                [x.unitPrice, <Money key="u" value={b.unitPrice} currency={b.currency} />],
                [x.total, <Money key="t" value={b.totalAmount} currency={b.currency} />],
                [x.refunded, <Money key="rf" value={b.refundedAmount} currency={b.currency} />],
                [x.paidAt, <DateText key="p" value={b.paidAt} />],
                [x.locale, b.locale.toUpperCase()],
                [z.issuer, zeffy ? z.zeffy : z.meki],
                ...(zeffy ? ([[z.reported, b.reportedTicketCount != null ? <span key="rt" className="num">{b.reportedTicketCount}</span> : z.pendingReport]] as [string, React.ReactNode][]) : []),
                ...(b.cancelledAt ? ([[x.cancelledAt, <DateText key="c" value={b.cancelledAt} />], [x.cancelReason, <bdi key="cr">{b.cancelReason ?? "—"}</bdi>]] as [string, React.ReactNode][]) : []),
              ]}
            />
          </Card>

          {zeffy && <SdiCard b={b} />}
          {!zeffy && (
          <Card labelledBy="bd-g">
            <CardHeader id="bd-g" title={x.guests} />
            <ol className="space-y-3" data-testid="booking-guests">
              {b.guests.map((g) => (
                <li key={g.id} className="rounded-xl border border-line p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-ink"><span className="num me-2 text-xs text-muted">{g.position}</span><bdi>{g.fullName}</bdi>{g.isPurchaser && <span className="ms-2 rounded-full bg-bg px-2 py-0.5 text-xs text-body">{x.purchaserGuest}</span>}</p>
                      <p className="mt-1 text-xs"><Ref>{g.email}</Ref> · <bdi dir="ltr">{g.phone}</bdi></p>
                      <p className="mt-1 text-xs text-body">{x.dietary}: <bdi>{g.dietaryRequirements}</bdi></p>
                    </div>
                    {canEdit && <button type="button" className="btn-admin btn-ghost !min-h-9" onClick={() => setDialog({ guest: g })}><Pencil className="size-4" aria-hidden="true" /> {x.editGuest}</button>}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs">
                    {g.ticket ? (
                      <>
                        <Ref>{g.ticket.ticketNumber}</Ref>
                        <TicketStatusBadge status={g.ticket.status} />
                        {g.ticket.issuedAt && <span className="text-muted">{t.gala.tickets.cols.issued}: <DateText value={g.ticket.issuedAt} /></span>}
                        {g.ticket.checkedInAt && <span className="text-muted">{t.gala.tickets.cols.checkedIn}: <DateText value={g.ticket.checkedInAt} /></span>}
                        <span className={g.ticket.hasPdf ? "text-ok" : "text-muted"}>{g.ticket.hasPdf ? x.pdfReady : x.pdfMissing}</span>
                        {can("gala.tickets.read") && pdfGate(g.ticket, true).allowed && <DownloadButton run={() => svc.downloadTicketPdf(ev.id, g.ticket!.id, g.ticket!.ticketNumber)} label={t.gala.tickets.pdfDownload} className="btn-admin btn-ghost !min-h-8 !py-1 text-xs" />}
                      </>
                    ) : (
                      <span className="text-muted">{x.noTicket}</span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
          )}

          <Card labelledBy="bd-p">
            <CardHeader id="bd-p" title={x.paymentInfo} subtitle={t.gala.common.ticketRevenue} />
            <DetailGrid cols={2} items={[[x.provider, b.paymentProvider ?? "—"], [x.providerRef, b.providerReference ? <Ref key="pr">{b.providerReference}</Ref> : "—"]]} />
            <h3 className="mb-2 mt-5 text-sm font-bold text-ink">{x.attempts}</h3>
            {b.attempts.length === 0 ? <p className="text-sm text-muted">{x.noAttempts}</p> : (
              <ul className="space-y-2 text-sm">
                {b.attempts.map((a) => (
                  <li key={a.reference} className="flex flex-wrap items-center gap-2 rounded-lg bg-bg p-2">
                    <Ref>{a.reference}</Ref><span>{a.provider}</span><span className="font-bold">{t.gala.statuses.attempt[a.status] ?? a.status}</span><Money value={a.amount} currency={a.currency} />
                    {a.failureCode && <span className="text-danger">{a.failureCode}</span>}<span className="text-muted"><DateText value={a.initiatedAt} /></span>
                  </li>
                ))}
              </ul>
            )}
            <h3 className="mb-2 mt-5 text-sm font-bold text-ink">{x.transactions}</h3>
            {b.transactions.length === 0 ? <p className="text-sm text-muted">{x.noTransactions}</p> : (
              <ul className="space-y-2 text-sm" data-testid="booking-transactions">
                {b.transactions.map((tx) => (
                  <li key={tx.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-bg p-2">
                    <span className="font-bold">{t.fin.statuses.txType[tx.type] ?? tx.type}</span><span>{t.fin.statuses.tx[tx.status] ?? tx.status}</span><Money value={tx.amount} currency={tx.currency} />
                    <Ref>{tx.providerTransactionRef}</Ref><span className="text-xs text-muted" data-classification={tx.classification}>{tx.classification}</span><span className="text-muted"><DateText value={tx.occurredAt} /></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-4 xl:col-span-4">
          <Card labelledBy="bd-pu">
            <CardHeader id="bd-pu" title={x.purchaser} right={canEdit ? <button type="button" className="btn-admin btn-ghost !min-h-9" onClick={() => setDialog("purchaser")}><Pencil className="size-4" aria-hidden="true" /> {x.editPurchaser}</button> : undefined} />
            <p className="font-bold text-ink"><bdi>{b.purchaserName}</bdi></p>
            <p className="mt-1 text-sm"><Ref>{b.purchaserEmail}</Ref></p>
            <p className="mt-1 text-sm"><bdi dir="ltr">{b.purchaserPhone}</bdi></p>
          </Card>
          <Card labelledBy="bd-j">
            <CardHeader id="bd-j" title={x.jobs} />
            <JobList jobs={b.jobs} />
          </Card>
          <Audit id={b.id} />
        </div>
      </div>

      {dialog === "cancel" && (
        <ReasonDialog title={fill(x.cancelTitle, { ref: b.publicReference })} body={<p>{b.paymentStatus === "PAID" ? x.cancelBodyPaid : x.cancelBodyUnpaid}</p>} confirmLabel={x.cancel} busy={cancel.isPending} error={cancel.isError ? errText(cancel.error) : null} onClose={close} onConfirm={(r) => cancel.mutate(r, { onSuccess: close })} />
      )}
      {dialog === "resend" && (
        <ConfirmDialog open title={fill(x.resendTitle, { ref: b.publicReference })} confirmLabel={x.resend} busy={resend.isPending} error={resend.isError ? errText(resend.error) : null} onClose={close} onConfirm={() => resend.mutate(undefined, { onSuccess: (r) => { close(); setMsg(fill(x.resendDone, { n: r.requeued })); } })}>
          <p>{x.resendBody}</p>
        </ConfirmDialog>
      )}
      {dialog === "regenerate" && (
        <ConfirmDialog open title={x.regenerateTitle} confirmLabel={x.regenerate} busy={regen.isPending} error={regen.isError ? errText(regen.error) : null} onClose={close} onConfirm={() => regen.mutate(undefined, { onSuccess: () => { close(); setMsg(t.gala.tickets.done); } })}>
          <p>{x.regenerateBody}</p>
        </ConfirmDialog>
      )}
      {dialog === "purchaser" && <PurchaserDialog ev={ev} b={b} onClose={() => setDialog(null)} />}
      {dialog && typeof dialog === "object" && <GuestDialog ev={ev} b={b} g={dialog.guest} onClose={() => setDialog(null)} />}
    </>
  );
}

export function JobList({ jobs }: { jobs: Job[] }) {
  const { t } = useLocale();
  const s = t.gala.statuses;
  if (!jobs.length) return <p className="text-sm text-muted">{t.gala.bookings.noJobs}</p>;
  return (
    <ul className="space-y-2 text-xs" data-testid="booking-jobs">
      {jobs.map((j) => (
        <li key={j.id} className="rounded-lg bg-bg p-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold">{s.jobType[j.type] ?? j.type}</span>
            {j.template && <span>{s.template[j.template] ?? j.template}</span>}
            <GalaBadge kind="job" status={j.status} />
            <span className="text-muted">{t.gala.comms.cols.attempts}: <span className="num">{j.attempts}</span></span>
          </div>
          {j.lastError && <p className="mt-1 break-words text-danger"><bdi dir="ltr">{j.lastError}</bdi></p>}
        </li>
      ))}
    </ul>
  );
}

function PurchaserDialog({ ev, b, onClose }: { ev: GalaEvent; b: BookingDetail; onClose: () => void }) {
  const { t } = useLocale();
  const errText = useGalaError();
  const x = t.gala.bookings;
  const [v, setV] = useState({ purchaserName: b.purchaserName, purchaserEmail: b.purchaserEmail, purchaserPhone: b.purchaserPhone });
  const changed = Object.fromEntries(Object.entries(v).filter(([k, val]) => val.trim() !== (b[k as keyof typeof v] ?? "")).map(([k, val]) => [k, val.trim()]));
  const save = useGalaMutation(() => svc.updateBooking(ev.id, b.id, changed));
  return (
    <Modal open title={x.editPurchaser} closeLabel={t.fin.common.close} onClose={onClose}
      footer={<>{save.isError && <span className="me-auto self-center text-sm text-danger" role="alert">{errText(save.error)}</span>}<button type="button" className="btn-admin btn-ghost" onClick={onClose}>{t.fin.common.close}</button><button type="button" className="btn-admin btn-primary" disabled={!Object.keys(changed).length || save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>{t.content.common.save}</button></>}>
      <div className="space-y-4">
        <TextInput label={t.gala.guests.cols.name} value={v.purchaserName} onChange={(s) => setV({ ...v, purchaserName: s })} maxLength={160} />
        <TextInput label={t.gala.guests.cols.email} type="email" value={v.purchaserEmail} onChange={(s) => setV({ ...v, purchaserEmail: s })} dir="ltr" maxLength={191} />
        <TextInput label={t.gala.guests.cols.phone} value={v.purchaserPhone} onChange={(s) => setV({ ...v, purchaserPhone: s })} dir="ltr" maxLength={40} />
      </div>
    </Modal>
  );
}

function GuestDialog({ ev, b, g, onClose }: { ev: GalaEvent; b: BookingDetail; g: BookingGuest; onClose: () => void }) {
  const { t } = useLocale();
  const errText = useGalaError();
  const x = t.gala.bookings;
  const init = { fullName: g.fullName, email: g.email, phone: g.phone, dietaryRequirements: g.dietaryRequirements };
  const [v, setV] = useState(init);
  const changed = Object.fromEntries(Object.entries(v).filter(([k, val]) => val.trim() !== init[k as keyof typeof init]).map(([k, val]) => [k, val.trim()]));
  const renamesIssued = "fullName" in changed && g.ticket?.status === "ISSUED";
  const save = useGalaMutation(() => svc.updateBooking(ev.id, b.id, { guests: [{ id: g.id, ...changed }] }));
  return (
    <Modal open title={fill(x.editTitle, { n: g.position })} closeLabel={t.fin.common.close} onClose={onClose}
      footer={<>{save.isError && <span className="me-auto self-center text-sm text-danger" role="alert">{errText(save.error)}</span>}<button type="button" className="btn-admin btn-ghost" onClick={onClose}>{t.fin.common.close}</button><button type="button" className="btn-admin btn-primary" disabled={!Object.keys(changed).length || save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>{t.content.common.save}</button></>}>
      <div className="space-y-4">
        {renamesIssued && <Notice tone="warn">{x.editWarning}</Notice>}
        {g.ticket?.status === "CHECKED_IN" && <Notice tone="warn">{t.gala.errors.TICKET_CHECKED_IN}</Notice>}
        <TextInput label={t.gala.guests.cols.name} value={v.fullName} onChange={(s) => setV({ ...v, fullName: s })} maxLength={160} />
        <TextInput label={t.gala.guests.cols.email} type="email" value={v.email} onChange={(s) => setV({ ...v, email: s })} dir="ltr" maxLength={191} />
        <TextInput label={t.gala.guests.cols.phone} value={v.phone} onChange={(s) => setV({ ...v, phone: s })} dir="ltr" maxLength={40} />
        <TextArea label={x.dietary} value={v.dietaryRequirements} onChange={(s) => setV({ ...v, dietaryRequirements: s })} rows={2} maxLength={500} />
      </div>
    </Modal>
  );
}

/** Phase 12: SDI orders and report rows for a Zeffy-owned booking (read-only; changes only through an approved SDI report). */
function SdiCard({ b }: { b: BookingDetail }) {
  const { t, locale } = useLocale();
  const z = t.sdi.booking;
  const orders = b.sdi?.orders ?? [];
  const rows = b.sdi?.reportRows ?? [];
  return (
    <Card labelledBy="bd-sdi">
      <CardHeader id="bd-sdi" title={z.orders} subtitle={t.sdi.noApi} />
      {orders.length === 0 ? <p className="text-sm text-muted">{z.noOrders}</p> : (
        <ul className="space-y-2 text-sm" data-testid="booking-sdi-orders">
          {orders.map((o) => (
            <li key={o.orderId} className="flex flex-wrap items-center gap-2 rounded-lg bg-bg p-2">
              <Ref>{o.orderId}</Ref><span className="font-bold">{o.status}</span><Money value={o.amount} currency={o.currency} />
              {o.refundedAmount !== "0.00" && <span className="text-danger">− <Money value={o.refundedAmount} currency={o.currency} /></span>}
              <span className={o.linked ? "text-ok" : "text-warn"}>{o.linked ? z.linked : z.notLinked}</span><span className="text-muted"><DateText value={o.reportedAt} /></span>
            </li>
          ))}
        </ul>
      )}
      <h3 className="mb-2 mt-5 text-sm font-bold text-ink">{z.reportRows}</h3>
      {rows.length === 0 ? <p className="text-sm text-muted">{z.noReportRows}</p> : (
        <ul className="space-y-2 text-xs">
          {rows.map((r) => (
            <li key={`${r.importId}-${r.rowNumber}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-bg p-2">
              <a className="font-bold text-meki-green-dark underline-offset-4 hover:underline" href={`/${locale}/payments/sdi-reconciliation/${r.importId}`}>#{r.rowNumber}</a>
              {r.orderId && <Ref>{r.orderId}</Ref>}<span>{r.status ?? "—"}</span>{r.amount && <Money value={r.amount} currency="USD" />}
              <span className="font-bold">{t.sdi.rowStatuses[r.matchStatus] ?? r.matchStatus}</span>{r.applied && <span className="text-ok">✓</span>}
              {r.synthetic && <span className="font-bold uppercase text-warn">{t.sdi.synthetic}</span>}
              {r.note && <span className="w-full text-muted">{r.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Audit({ id }: { id: string }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const allowed = can("audit.read");
  const q = useEntityAudit("EventBooking", id, allowed);
  return (
    <Card labelledBy="bd-a">
      <CardHeader id="bd-a" title={t.gala.bookings.activity} />
      <WidgetState q={q} unavailable={!allowed ? { text: t.gala.bookings.auditLocked, locked: true } : false} minH="min-h-20">
        <AuditList items={q.data ?? []} emptyText={t.gala.bookings.auditEmpty} />
      </WidgetState>
    </Card>
  );
}
