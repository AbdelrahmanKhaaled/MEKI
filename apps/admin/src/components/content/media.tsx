"use client";

/**
 * Reusable media components: Uploader (progress, client pre-checks, duplicate detection), MediaPicker (browse + upload,
 * single cover or ordered multi-select gallery), CoverField and GalleryField used by the program / cause / campaign editors.
 * Selecting an existing asset only references its real media id — nothing is copied or re-uploaded.
 */
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, CheckCircle2, ImagePlus, Images, Trash2, Upload, X } from "lucide-react";
import { Modal } from "@/components/common/Modal";
import { useLocale } from "@/components/common/Providers";
import { EmptyState, WidgetState } from "@/components/common/States";
import { Pagination, SearchFilter, SelectFilter, Tabs } from "@/components/finance/ui";
import { ApiError } from "@/lib/api";
import { formatBytes, uploadError } from "@/lib/content";
import { MEDIA_CATEGORIES, PROVENANCES, type Media } from "@/lib/content-schemas";
import { fill } from "@/lib/i18n";
import { contentKeys, useMediaList } from "@/hooks/useContentData";
import { getMedia, uploadMedia } from "@/services/content";
import { ProvenanceBadge, Thumb, useContentError } from "./ui";

// ───────────── uploader ─────────────

interface Row {
  key: string;
  name: string;
  size: number;
  pct: number;
  state: "queued" | "uploading" | "done" | "duplicate" | "error";
  message?: string;
  media?: Media;
}

export function Uploader({ onUploaded, defaultCategory = "OTHER", compact = false }: { onUploaded?: (m: Media) => void; defaultCategory?: string; compact?: boolean }) {
  const { t } = useLocale();
  const x = t.content.media;
  const errText = useContentError();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [category, setCategory] = useState(defaultCategory);
  const [provenance, setProvenance] = useState("PROPOSED");
  const [over, setOver] = useState(false);
  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function handle(files: FileList | File[]) {
    const list = [...files];
    const fresh = list.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, name: f.name, size: f.size, pct: 0, state: "queued" as const }));
    setRows((rs) => [...fresh, ...rs]);
    // sequential: one 10 MB upload at a time keeps progress meaningful and the API's per-request limits simple
    for (const [i, f] of list.entries()) {
      const key = fresh[i].key;
      const pre = uploadError(f);
      if (pre) {
        update(key, { state: "error", message: t.content.errors[pre] });
        continue;
      }
      update(key, { state: "uploading" });
      try {
        const m = await uploadMedia(f, { category, provenance }, (p) => update(key, { pct: Math.round(p * 100) }));
        update(key, { state: "done", pct: 100, media: m });
        onUploaded?.(m);
      } catch (e) {
        if (e instanceof ApiError && e.code === "DUPLICATE_MEDIA") {
          const id = (e.details as { id?: string } | undefined)?.id;
          const existing = id ? await getMedia(id).catch(() => undefined) : undefined;
          update(key, { state: "duplicate", media: existing });
        } else update(key, { state: "error", message: errText(e) });
      }
    }
    await qc.invalidateQueries({ queryKey: contentKeys.all });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <SelectFilter label={x.category} allLabel={t.content.categories.OTHER} value={category === "OTHER" ? "" : category} onChange={(v) => setCategory(v || "OTHER")} options={MEDIA_CATEGORIES.filter((c) => c !== "OTHER").map((c) => ({ value: c, label: t.content.categories[c] }))} />
        <SelectFilter label={t.content.common.provenance} allLabel={t.content.provenance.PROPOSED} value={provenance === "PROPOSED" ? "" : provenance} onChange={(v) => setProvenance(v || "PROPOSED")} options={PROVENANCES.filter((p) => p !== "PROPOSED").map((p) => ({ value: p, label: t.content.provenance[p] }))} />
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) void handle(e.dataTransfer.files); }}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center text-sm transition-colors ${over ? "border-meki-green bg-[#e6f2ec]" : "border-line bg-bg/60"} ${compact ? "p-4" : ""}`}
      >
        <Upload className="size-7 text-meki-green-dark" aria-hidden="true" />
        <p className="text-body">
          {x.drop}{" "}
          <button type="button" className="font-bold text-meki-green-dark underline" onClick={() => input.current?.click()}>{x.browse}</button>
        </p>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" aria-label={x.upload} onChange={(e) => { if (e.target.files?.length) void handle(e.target.files); e.target.value = ""; }} />
      </div>
      {rows.length > 0 && (
        <ul className="space-y-2" aria-live="polite">
          {rows.map((r) => (
            <li key={r.key} className="rounded-xl border border-line p-3 text-sm" data-state={r.state}>
              <div className="flex items-center justify-between gap-2">
                <bdi className="min-w-0 truncate font-bold text-ink">{r.name}</bdi>
                <span className="num shrink-0 text-xs text-muted">{formatBytes(r.size)}</span>
              </div>
              {r.state === "uploading" && (
                <>
                  <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.pct} aria-label={fill(x.uploading, { name: r.name, pct: r.pct })} className="mt-2 h-2 overflow-hidden rounded-full bg-[#e6ede9]">
                    <div className="h-full rounded-full bg-gradient-to-r from-deep-green to-meki-green transition-[width]" style={{ width: `${r.pct}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted">{fill(x.uploading, { name: r.name, pct: r.pct })}</p>
                </>
              )}
              {r.state === "done" && <p className="mt-1 flex items-center gap-1 text-xs text-ok"><CheckCircle2 className="size-3.5" aria-hidden="true" /> {fill(x.uploaded, { name: r.name })}</p>}
              {r.state === "duplicate" && (
                <p className="mt-1 text-xs text-warn">
                  {fill(x.duplicate, { name: r.name })}{" "}
                  {r.media && onUploaded && <button type="button" className="font-bold underline" onClick={() => onUploaded(r.media!)}>{t.content.media.picker.confirm}</button>}
                </p>
              )}
              {r.state === "error" && <p className="mt-1 text-xs text-danger" role="alert">{r.message}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ───────────── picker ─────────────

export function MediaPicker({ open, mode, initial, onClose, onConfirm, defaultCategory, initialTab = "browse" }: { open: boolean; mode: "single" | "multi"; initial: Media[]; onClose: () => void; onConfirm: (m: Media[]) => void; defaultCategory?: string; initialTab?: "browse" | "upload" }) {
  const { t } = useLocale();
  const x = t.content.media;
  const [tab, setTab] = useState<"browse" | "upload">(initialTab);
  const [selected, setSelected] = useState<Media[]>(initial);
  const [q, setQ] = useState({ search: "", category: "", provenance: "", page: 1 });
  // image slots never list documents (24 Nov 2026: PDFs share the library)
  const list = useMediaList({ kind: "image", search: q.search || undefined, category: q.category || undefined, provenance: q.provenance || undefined, page: q.page, pageSize: 24, sort: "createdAt:desc" }, open);
  const isSel = (id: string) => selected.some((m) => m.id === id);
  const toggle = (m: Media) => setSelected((s) => (mode === "single" ? (isSel(m.id) ? [] : [m]) : isSel(m.id) ? s.filter((x2) => x2.id !== m.id) : [...s, m]));
  const add = (m: Media) => setSelected((s) => (mode === "single" ? [m] : isSel(m.id) ? s : [...s, m]));

  return (
    <Modal
      open={open}
      size="xl"
      title={mode === "single" ? x.picker.cover : x.picker.gallery}
      closeLabel={t.fin.common.cancel}
      onClose={onClose}
      footer={
        <>
          <span className="me-auto self-center text-sm text-body">{fill(x.picker.selected, { n: selected.length })}{mode === "multi" && selected.length > 1 ? ` · ${x.picker.order}` : ""}</span>
          <button type="button" className="btn-admin btn-ghost" onClick={onClose}>{t.fin.common.cancel}</button>
          <button type="button" className="btn-admin btn-primary" onClick={() => onConfirm(selected)} disabled={mode === "single" && selected.length === 0}>{x.picker.confirm}</button>
        </>
      }
    >
      <div className="space-y-4">
        <Tabs label={x.picker.title} active={tab} onChange={setTab} tabs={[{ key: "browse", label: x.picker.browseTab }, { key: "upload", label: x.picker.uploadTab }]} />
        {tab === "upload" ? (
          <Uploader compact defaultCategory={defaultCategory} onUploaded={(m) => { add(m); setTab("browse"); }} />
        ) : (
          <>
            <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
              <SearchFilter value={q.search} onChange={(v) => setQ((s) => ({ ...s, search: v, page: 1 }))} label={x.search} ltr={false} />
              <SelectFilter label={x.category} allLabel={t.content.common.all} value={q.category} onChange={(v) => setQ((s) => ({ ...s, category: v, page: 1 }))} options={MEDIA_CATEGORIES.map((c) => ({ value: c, label: t.content.categories[c] }))} />
              <SelectFilter label={t.content.common.provenance} allLabel={t.content.common.anyProvenance} value={q.provenance} onChange={(v) => setQ((s) => ({ ...s, provenance: v, page: 1 }))} options={PROVENANCES.map((p) => ({ value: p, label: t.content.provenance[p] }))} />
            </div>
            <WidgetState q={list} isEmpty={list.data?.items.length === 0} emptyText={x.emptyFiltered} minH="min-h-48">
              {list.data && (
                <>
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6" aria-label={x.picker.title}>
                    {list.data.items.map((m) => {
                      const on = isSel(m.id);
                      const order = selected.findIndex((s) => s.id === m.id);
                      return (
                        <li key={m.id}>
                          <button type="button" aria-pressed={on} onClick={() => toggle(m)} title={m.originalName ?? m.storageKey} className={`relative block w-full overflow-hidden rounded-xl border-2 text-start transition ${on ? "border-harvest-gold ring-2 ring-harvest-gold/40" : "border-transparent hover:border-meki-green"}`}>
                            <Thumb media={m} className="aspect-square w-full" />
                            {on && <span className="absolute end-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-harvest-gold text-xs font-bold text-deep-green-3">{mode === "multi" ? order + 1 : "✓"}</span>}
                            <span className="absolute start-1.5 bottom-1.5"><ProvenanceBadge value={m.provenance} /></span>
                          </button>
                          <p className="mt-1 truncate text-xs text-muted"><bdi>{m.originalName ?? m.code ?? m.storageKey}</bdi></p>
                        </li>
                      );
                    })}
                  </ul>
                  <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} onPage={(p) => setQ((s) => ({ ...s, page: p }))} />
                </>
              )}
            </WidgetState>
          </>
        )}
      </div>
    </Modal>
  );
}

// ───────────── editor fields ─────────────

export function CoverField({ media, onChange, disabled, defaultCategory }: { media: Media | null; onChange: (m: Media | null) => void; disabled?: boolean; defaultCategory?: string }) {
  const { t } = useLocale();
  const c = t.content.common;
  const [open, setOpen] = useState(false);
  return (
    <div>
      <p className="mb-2 text-sm font-bold text-ink">{c.cover}</p>
      <div className="flex flex-wrap items-center gap-4">
        <Thumb media={media} className="h-28 w-44" />
        <div className="flex flex-col gap-2">
          {media && <p className="max-w-56 truncate text-xs text-muted"><bdi>{media.originalName ?? media.code ?? media.storageKey}</bdi></p>}
          {media && <ProvenanceBadge value={media.provenance} />}
          {!disabled && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-admin btn-ghost" onClick={() => setOpen(true)}><ImagePlus className="size-4" aria-hidden="true" /> {c.chooseCover}</button>
              {media && <button type="button" className="btn-admin btn-ghost" onClick={() => onChange(null)}><X className="size-4" aria-hidden="true" /> {c.removeCover}</button>}
            </div>
          )}
          {!media && <p className="text-xs text-muted">{c.noCover}</p>}
        </div>
      </div>
      {open && <MediaPicker open mode="single" initial={media ? [media] : []} defaultCategory={defaultCategory} onClose={() => setOpen(false)} onConfirm={(m) => { onChange(m[0] ?? null); setOpen(false); }} />}
    </div>
  );
}

/** Ordered gallery, saved with its own PUT …/gallery (the API replaces the whole list). */
export function GalleryField({ items, onSave, busy, disabled, error, message, defaultCategory }: { items: Media[]; onSave: (ids: string[]) => void; busy: boolean; disabled?: boolean; error?: string | null; message?: string | null; defaultCategory?: string }) {
  const { t } = useLocale();
  const c = t.content.common;
  const [draft, setDraft] = useState<Media[] | null>(null);
  const [open, setOpen] = useState(false);
  const current = draft ?? items;
  const changed = draft !== null && draft.map((m) => m.id).join() !== items.map((m) => m.id).join();
  const move = (i: number, d: -1 | 1) => setDraft(() => { const a = [...current]; const j = i + d; [a[i], a[j]] = [a[j], a[i]]; return a; });
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-ink">{c.gallery}</p>
        {!disabled && (
          <div className="flex gap-2">
            <button type="button" className="btn-admin btn-ghost" onClick={() => setOpen(true)}><Images className="size-4" aria-hidden="true" /> {c.chooseGallery}</button>
            <button type="button" className="btn-admin btn-primary" disabled={!changed || busy} onClick={() => onSave(current.map((m) => m.id))}>{busy ? c.saving : c.saveGallery}</button>
          </div>
        )}
      </div>
      <p className="mb-3 text-xs text-muted">{c.galleryHint}</p>
      {current.length === 0 ? (
        <EmptyState text={c.galleryEmpty} icon={Images} minH="min-h-24" />
      ) : (
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {current.map((m, i) => (
            <li key={m.id} className="rounded-xl border border-line p-2">
              <Thumb media={m} className="aspect-[4/3] w-full" />
              <div className="mt-2 flex items-center justify-between gap-1">
                <span className="num text-xs font-bold text-muted">#{i + 1}</span>
                {!disabled && (
                  <span className="flex gap-1">
                    <button type="button" className="rounded p-1 hover:bg-bg disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`↑ ${i + 1}`}><ArrowUp className="size-4" aria-hidden="true" /></button>
                    <button type="button" className="rounded p-1 hover:bg-bg disabled:opacity-30" disabled={i === current.length - 1} onClick={() => move(i, 1)} aria-label={`↓ ${i + 1}`}><ArrowDown className="size-4" aria-hidden="true" /></button>
                    <button type="button" className="rounded p-1 text-danger hover:bg-bg" onClick={() => setDraft(current.filter((x) => x.id !== m.id))} aria-label={`${c.delete} ${i + 1}`}><Trash2 className="size-4" aria-hidden="true" /></button>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
      {!changed && message && <p className="mt-2 text-sm text-ok" role="status">{message}</p>}
      {open && <MediaPicker open mode="multi" initial={current} defaultCategory={defaultCategory} onClose={() => setOpen(false)} onConfirm={(m) => { setDraft(m); setOpen(false); }} />}
    </div>
  );
}
