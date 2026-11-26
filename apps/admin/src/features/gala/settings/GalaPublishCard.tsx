"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BadgeCheck, Globe, Undo2 } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { Bilingual, TextArea, useContentError } from "@/components/content/ui";
import { ConfirmDialog, DateText, DetailGrid, Notice } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { galaKeys } from "@/hooks/useGalaData";
import type { RevalidationOutcome } from "@/lib/api";
import type { EventDetail, GalaEvent } from "@/lib/gala-schemas";
import { fill } from "@/lib/i18n";
import * as svc from "@/services/gala";

/** Statuses in which the public API serves the event (mirrors the API's PUBLIC_EVENT_STATUSES). */
export const PUBLIC_STATUSES = ["PUBLISHED", "CANCELLED", "COMPLETED"];
export const isEventPublic = (d: Pick<EventDetail, "status" | "publishedAt">) => PUBLIC_STATUSES.includes(d.status) && !!d.publishedAt;

type Dialog = null | "approve" | "publish" | "unpublish";

/**
 * The admin path to make the Gala event public (26 Nov 2026: the content is already client-approved, so NO approval step blocks it):
 *   Publish event    → POST /admin/events/:id/publish   (events.publish; the API needs date/time/timezone + short description, and publishes
 *                         the event AND its landing page in one transaction, then refreshes the website)
 *   Record approval  → POST /admin/events/:id/approve   (OPTIONAL, events.approve; a human-entered reference ≥ 5 chars if used; never automatic)
 * Page sections (agenda, photos…) are published separately in their own cards; they stay hidden until THIS event is public.
 * The "Record SDI approval" / "Publish" buttons of the legal-copy card are a different workflow (legal wording) and do not touch the event.
 */
export function GalaPublishCard({ ev, d }: { ev: GalaEvent; d: EventDetail }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const errText = useContentError();
  const qc = useQueryClient();
  const x = t.gala.settings.publish;
  const [dialog, setDialog] = useState<Dialog>(null);
  const [note, setNote] = useState("");
  const [descEn, setDescEn] = useState("");
  const [descAr, setDescAr] = useState("");
  const [outcome, setOutcome] = useState<RevalidationOutcome | null | "none">("none");

  const done = () => {
    setDialog(null);
    setNote("");
    void Promise.all([
      qc.invalidateQueries({ queryKey: galaKeys.event(ev.id) }),
      qc.invalidateQueries({ queryKey: galaKeys.events }), // the chosen-event list carries the status shown elsewhere
      qc.invalidateQueries({ queryKey: ["gala", "page-sections", ev.id] }),
      qc.invalidateQueries({ queryKey: ["fin", "audit"] }),
    ]);
  };
  const approve = useMutation({ mutationFn: () => svc.approveEvent(ev.id, note.trim()), onSuccess: () => { setOutcome("none"); done(); } });
  const publish = useMutation({ mutationFn: () => svc.publishEvent(ev.id), onSuccess: (r) => { setOutcome(r.revalidation); done(); } });
  const unpublish = useMutation({ mutationFn: () => svc.unpublishEvent(ev.id), onSuccess: (r) => { setOutcome(r.revalidation); done(); } });

  const saveDesc = useMutation({
    mutationFn: () => svc.updateEvent(ev.id, { shortDescEn: descEn.trim(), ...(descAr.trim() ? { shortDescAr: descAr.trim() } : {}) }),
    onSuccess: () => { setDescEn(""); setDescAr(""); done(); },
  });
  const publicNow = isEventPublic(d);
  const canApprove = can("events.approve");
  const canPublish = can("events.publish");
  const blockers = d.publishBlockers ?? [];
  const closed = d.status === "ARCHIVED" || d.status === "COMPLETED" || d.status === "CANCELLED";
  const showApprove = !d.approvedAt && !closed;
  const showPublish = ["DRAFT", "IN_REVIEW"].includes(d.status);
  const showUnpublish = d.status === "PUBLISHED";
  const approvedLine = d.approvedAt
    ? fill(x.approvedBy, { name: d.approvedBy?.name ?? "—", date: new Date(d.approvedAt).toLocaleDateString() })
    : x.notApproved;

  return (
    <Card labelledBy="gs-publish">
      <CardHeader id="gs-publish" title={x.title} subtitle={x.subtitle} />
      <div className="space-y-4" data-testid="gala-publish-card">
        <Notice tone={publicNow ? "info" : "warn"}>
          <p data-testid="gala-publish-state">{publicNow ? x.live : x.notPublic}</p>
        </Notice>
        <DetailGrid
          cols={4}
          items={[
            [x.status, <span key="s" data-testid="gala-event-status">{d.status}</span>],
            [x.page, <span key="p" data-testid="gala-page-status">{d.page?.status ?? "—"}</span>],
            [x.approval, <span key="a" data-testid="gala-approval">{approvedLine}</span>],
            [x.publishedAt, d.publishedAt ? <DateText key="d" value={d.publishedAt} /> : x.neverPublished],
          ]}
        />
        {d.approvedAt && d.approvalNote && <p className="text-xs text-muted">{fill(x.approvalRef, { note: d.approvalNote })}</p>}
        {showPublish && blockers.length > 0 && (
          <div className="rounded-lg border border-warn/30 bg-warn/5 p-3 text-sm" data-testid="gala-publish-blockers">
            <p className="font-bold">{x.blockers}</p>
            <ul className="mt-1 list-disc ps-5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
          </div>
        )}
        {showPublish && blockers.some((b) => /shortDescEn/.test(b)) && can("events.manage") && (
          <div className="space-y-2" data-testid="gala-short-desc">
            <Bilingual label={x.shortDesc} en={descEn} ar={descAr} onEn={setDescEn} onAr={setDescAr} maxLength={500} />
            <button type="button" className="btn-admin btn-ghost" disabled={saveDesc.isPending || !descEn.trim()} onClick={() => saveDesc.mutate()} data-testid="gala-short-desc-save">{x.shortDescSave}</button>
            {saveDesc.isError && <p className="text-xs text-danger" role="alert">{errText(saveDesc.error)}</p>}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {showApprove && canApprove && (
            <button type="button" className="btn-admin btn-ghost" onClick={() => setDialog("approve")} data-testid="gala-record-approval">
              <BadgeCheck className="size-4" aria-hidden="true" /> {x.recordApproval}
            </button>
          )}
          {showPublish && canPublish && (
            <button type="button" className="btn-admin btn-primary" disabled={blockers.length > 0} onClick={() => setDialog("publish")} data-testid="gala-publish-event">
              <Globe className="size-4" aria-hidden="true" /> {x.publish}
            </button>
          )}
          {showUnpublish && canPublish && (
            <button type="button" className="btn-admin btn-ghost text-danger" onClick={() => setDialog("unpublish")} data-testid="gala-unpublish-event">
              <Undo2 className="size-4" aria-hidden="true" /> {x.unpublish}
            </button>
          )}
        </div>
        {showApprove && !canApprove && <p className="text-xs text-muted">{x.needApprovePerm}</p>}
        {(showPublish || showUnpublish) && !canPublish && <p className="text-xs text-muted">{x.needPublishPerm}</p>}
        {closed && d.status !== "COMPLETED" && d.status !== "ARCHIVED" && <p className="text-xs text-muted">{x.cancelled}</p>}
        {outcome !== "none" && (
          <p className="text-sm font-bold text-ok" role="status" data-testid="gala-publish-outcome">
            {outcome === "revalidated" ? x.revalidated : outcome === "pending" ? x.pending : x.disabled}
          </p>
        )}
      </div>

      {dialog === "approve" && (
        <ConfirmDialog open title={x.approvalTitle} confirmLabel={x.recordApproval} busy={approve.isPending} error={approve.isError ? errText(approve.error) : null} confirmDisabled={note.trim().length < 5} onClose={() => { approve.reset(); setDialog(null); }} onConfirm={() => approve.mutate()}>
          <p>{x.approvalBody}</p>
          <TextArea label={x.approvalNote} value={note} onChange={setNote} rows={3} maxLength={500} />
        </ConfirmDialog>
      )}
      {dialog === "publish" && (
        <ConfirmDialog open title={x.publishTitle} confirmLabel={x.publish} busy={publish.isPending} error={publish.isError ? errText(publish.error) : null} onClose={() => { publish.reset(); setDialog(null); }} onConfirm={() => publish.mutate()}>
          <p>{x.publishBody}</p>
        </ConfirmDialog>
      )}
      {dialog === "unpublish" && (
        <ConfirmDialog open danger title={x.unpublishTitle} confirmLabel={x.unpublish} busy={unpublish.isPending} error={unpublish.isError ? errText(unpublish.error) : null} onClose={() => { unpublish.reset(); setDialog(null); }} onConfirm={() => unpublish.mutate()}>
          <p>{x.unpublishBody}</p>
        </ConfirmDialog>
      )}
    </Card>
  );
}
