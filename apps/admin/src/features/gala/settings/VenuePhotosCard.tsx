"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Globe, Plus, Trash2, Undo2 } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { CoverField } from "@/components/content/media";
import { Bilingual, Checkbox, useContentError } from "@/components/content/ui";
import { ConfirmDialog, Notice } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Section, SectionItem } from "@/lib/cms-schemas";
import type { Media } from "@/lib/content-schemas";
import type { GalaEvent } from "@/lib/gala-schemas";
import { fill } from "@/lib/i18n";
import * as svc from "@/services/venue-photos";

/** Same convention as the website (apps/web/src/lib/venue-photos.ts): "Title – Place". */
export const venueCaption = (title: string, place: string) => (place.trim() ? `${title.trim()} – ${place.trim()}` : title.trim());

/**
 * Phase 13B — "pictures of the gala venue to be added". Manages the event's EVENT_VENUE section through the existing Events API.
 * Edit: events.manage · publish: events.publish · media picker: media.read. Nothing appears publicly unless the section is
 * published AND the event is public; the website ignores items without a title or image.
 */
export function VenuePhotosCard({ ev }: { ev: GalaEvent }) {
  const { t } = useLocale();
  const x = t.gala.settings.venuePhotos;
  const { can } = useAuth();
  const qc = useQueryClient();
  const errText = useContentError();
  const key = ["gala", "venue-photos", ev.id];
  const q = useQuery({ queryKey: key, queryFn: () => svc.getEventPage(ev.id) });
  const refresh = () => void qc.invalidateQueries({ queryKey: key });
  const create = useMutation({ mutationFn: () => svc.createVenueSection(ev.id), onSuccess: refresh });
  const section = q.data?.sections.find((s) => s.key === svc.VENUE_KEY);
  const canManage = can("events.manage");
  return (
    <Card labelledBy="gs-venue">
      <CardHeader id="gs-venue" title={x.title} subtitle={x.subtitle} />
      <WidgetState q={q} minH="min-h-32">
        {q.data && (
          <div className="space-y-4" data-testid="gala-venue-photos-admin">
            {!section ? (
              <div className="space-y-2">
                <p className="text-sm text-muted">{x.none}</p>
                {canManage && <button type="button" className="btn-admin btn-ghost" disabled={create.isPending} onClick={() => create.mutate()}><Plus className="size-4" aria-hidden="true" /> {x.create}</button>}
                {create.isError && <p className="text-xs text-danger" role="alert">{errText(create.error)}</p>}
              </div>
            ) : (
              <VenueSection ev={ev} s={section} onChange={refresh} />
            )}
          </div>
        )}
      </WidgetState>
    </Card>
  );
}

function VenueSection({ ev, s, onChange }: { ev: GalaEvent; s: Section; onChange: () => void }) {
  const { t } = useLocale();
  const x = t.gala.settings.venuePhotos;
  const { can } = useAuth();
  const errText = useContentError();
  const [confirmPublish, setConfirmPublish] = useState(false);
  const add = useMutation({ mutationFn: () => svc.addVenuePhoto(ev.id, s.id), onSuccess: onChange });
  const toggle = useMutation({ mutationFn: (publish: boolean) => svc.setVenueSectionStatus(ev.id, s.id, publish), onSuccess: () => { setConfirmPublish(false); onChange(); } });
  const published = s.status === "PUBLISHED";
  return (
    <>
      <p className="text-xs text-muted">
        {fill(x.status, { status: s.status })}
        {s.hasUnpublishedChanges && <> · <span className="text-warn">{x.pending}</span></>}
      </p>
      <Notice><p>{x.altHint}</p></Notice>
      {s.items.length === 0 ? <p className="text-sm text-muted">{x.empty}</p> : (
        <ul className="space-y-3">
          {[...s.items].sort((a, b) => a.sortOrder - b.sortOrder).map((it) => <PhotoRow key={it.id + it.titleEn + (it.mediaId ?? "")} ev={ev} item={it} onChange={onChange} />)}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        {can("events.manage") && <button type="button" className="btn-admin btn-ghost" disabled={add.isPending} onClick={() => add.mutate()}><Plus className="size-4" aria-hidden="true" /> {x.add}</button>}
        {can("events.publish") && (!published || s.hasUnpublishedChanges) && <button type="button" className="btn-admin btn-primary" onClick={() => setConfirmPublish(true)}><Globe className="size-4" aria-hidden="true" /> {x.publish}</button>}
        {can("events.publish") && published && <button type="button" className="btn-admin btn-ghost text-danger" disabled={toggle.isPending} onClick={() => toggle.mutate(false)}><Undo2 className="size-4" aria-hidden="true" /> {x.unpublish}</button>}
      </div>
      {(add.isError || (toggle.isError && !confirmPublish)) && <p className="text-xs text-danger" role="alert">{errText(add.error ?? toggle.error)}</p>}
      {confirmPublish && (
        <ConfirmDialog open title={x.publish} confirmLabel={x.publish} busy={toggle.isPending} error={toggle.isError ? errText(toggle.error) : null} onClose={() => { toggle.reset(); setConfirmPublish(false); }} onConfirm={() => toggle.mutate(true)}>
          <p>{x.publishBody}</p>
        </ConfirmDialog>
      )}
    </>
  );
}

function PhotoRow({ ev, item, onChange }: { ev: GalaEvent; item: SectionItem; onChange: () => void }) {
  const { t } = useLocale();
  const x = t.gala.settings.venuePhotos;
  const { can } = useAuth();
  const errText = useContentError();
  const canManage = can("events.manage");
  const init = { titleEn: item.titleEn ?? "", titleAr: item.titleAr ?? "", textEn: item.textEn ?? "", textAr: item.textAr ?? "", isVisible: item.isVisible, media: item.media as Media | null };
  const [v, setV] = useState(init);
  const [confirm, setConfirm] = useState(false);
  const dirty = v.titleEn !== init.titleEn || v.titleAr !== init.titleAr || v.textEn !== init.textEn || v.textAr !== init.textAr || v.isVisible !== init.isVisible || (v.media?.id ?? null) !== (init.media?.id ?? null);
  const save = useMutation({
    mutationFn: () => svc.updateVenuePhoto(ev.id, item.id, { titleEn: v.titleEn.trim(), titleAr: v.titleAr.trim() || null, textEn: v.textEn.trim() || null, textAr: v.textAr.trim() || null, isVisible: v.isVisible, mediaId: v.media?.id ?? null }),
    onSuccess: onChange,
  });
  const remove = useMutation({ mutationFn: () => svc.deleteVenuePhoto(ev.id, item.id), onSuccess: () => { setConfirm(false); onChange(); } });
  const complete = !!v.titleEn.trim() && !!v.media;
  return (
    <li className="rounded-lg border border-line/80 p-3" data-testid="venue-photo-row">
      <div className="space-y-3">
        <Bilingual label={x.title_} en={v.titleEn} ar={v.titleAr} onEn={(s) => setV({ ...v, titleEn: s })} onAr={(s) => setV({ ...v, titleAr: s })} disabled={!canManage} maxLength={200} requiredEn />
        <Bilingual label={x.place} en={v.textEn} ar={v.textAr} onEn={(s) => setV({ ...v, textEn: s })} onAr={(s) => setV({ ...v, textAr: s })} disabled={!canManage} maxLength={200} />
        <CoverField media={v.media} onChange={(m) => setV({ ...v, media: m })} disabled={!canManage || !can("media.read")} defaultCategory="GALLERY" />
        {v.titleEn.trim() && <p className="text-xs text-muted">{fill(x.preview, { caption: venueCaption(v.titleEn, v.textEn) })}</p>}
        {!complete && <p className="text-xs text-warn">{x.needsTitle}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Checkbox label={x.visible} checked={v.isVisible} onChange={(b) => setV({ ...v, isVisible: b })} disabled={!canManage} />
          {canManage && (
            <span className="flex gap-2">
              <button type="button" className="btn-admin btn-ghost !min-h-9 text-danger" onClick={() => setConfirm(true)}><Trash2 className="size-4" aria-hidden="true" /> {x.remove}</button>
              <button type="button" className="btn-admin btn-primary !min-h-9" disabled={!dirty || !v.titleEn.trim() || save.isPending} onClick={() => save.mutate()}>{x.save}</button>
            </span>
          )}
        </div>
        {save.isError && <p className="text-xs text-danger" role="alert">{errText(save.error)}</p>}
      </div>
      {confirm && (
        <ConfirmDialog open danger title={x.removeTitle} confirmLabel={x.remove} busy={remove.isPending} error={remove.isError ? errText(remove.error) : null} onClose={() => { remove.reset(); setConfirm(false); }} onConfirm={() => remove.mutate()}>
          <p>{x.removeBody}</p>
        </ConfirmDialog>
      )}
    </li>
  );
}
