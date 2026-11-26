"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Globe, Plus, Trash2, Undo2 } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { Bilingual, Checkbox, useContentError } from "@/components/content/ui";
import { ConfirmDialog } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { galaKeys, useEventDetail } from "@/hooks/useGalaData";
import { publishEvent } from "@/services/gala";
import { isEventPublic } from "./GalaPublishCard";
import { Notice } from "@/components/finance/ui";
import type { Section, SectionItem } from "@/lib/cms-schemas";
import type { GalaEvent } from "@/lib/gala-schemas";
import { fill } from "@/lib/i18n";
import * as svc from "@/services/gala-page";

export type AgendaItemState = {
  id: string;
  timeEn: string;
  timeAr: string;
  titleEn: string;
  titleAr: string;
  noteEn: string;
  noteAr: string;
  highlight: boolean;
};

export type ActState = {
  id: string;
  code: string;
  sortOrder: number;
  labelEn: string;
  labelAr: string;
  titleEn: string;
  titleAr: string;
  timeEn: string;
  timeAr: string;
  items: AgendaItemState[];
};

const DEFAULT_ACTS: {
  labelEn: string;
  labelAr: string;
  titleEn: string;
  titleAr: string;
  timeEn: string;
  timeAr: string;
  items: { timeEn: string; timeAr: string; titleEn: string; titleAr: string; noteEn?: string; noteAr?: string; highlight?: boolean }[];
}[] = [
  {
    labelEn: "Act I",
    labelAr: "الفصل الأول",
    titleEn: "The Spark",
    titleAr: "الشرارة",
    timeEn: "3:30 – 5:00 PM",
    timeAr: "3:30 – 5:00 مساءً",
    items: [
      { timeEn: "3:30 PM", timeAr: "3:30 م", titleEn: "Welcome reception", titleAr: "حفل الاستقبال" },
      { timeEn: "4:30 PM", timeAr: "4:30 م", titleEn: "Opening with our host, Raya Abirached", titleAr: "الافتتاح مع مقدّمة الأمسية رايا أبي راشد" },
      { timeEn: "4:45 PM", timeAr: "4:45 م", titleEn: "A Vision Beyond Borders", titleAr: "رؤية تتجاوز الحدود", noteEn: "Keynote Speaker", noteAr: "المتحدث الرئيسي" },
    ],
  },
  {
    labelEn: "Act II",
    labelAr: "الفصل الثاني",
    titleEn: "The Stories and the People",
    titleAr: "الحكايات والناس",
    timeEn: "5:00 – 6:15 PM",
    timeAr: "5:00 – 6:15 مساءً",
    items: [
      { timeEn: "5:00 PM", timeAr: "5:00 م", titleEn: "Every Light Has a Story", titleAr: "لكل نور حكاية", noteEn: "Film", noteAr: "فيلم", highlight: true },
      { timeEn: "5:10 PM", timeAr: "5:10 م", titleEn: "Voices That Illuminate", titleAr: "أصوات تُضيء", noteEn: "Guest of Honor Panel", noteAr: "جلسة ضيوف الشرف" },
      { timeEn: "6:00 PM", timeAr: "6:00 م", titleEn: "A Legacy of Giving", titleAr: "إرث من العطاء", noteEn: "Egypt's Timeless Tradition of Generosity", noteAr: "تقليد الكرم المصري العريق" },
    ],
  },
  {
    labelEn: "Act III",
    labelAr: "الفصل الثالث",
    titleEn: "The Power of Giving",
    titleAr: "قوة العطاء",
    timeEn: "6:15 – 7:00 PM",
    timeAr: "6:15 – 7:00 مساءً",
    items: [{ timeEn: "6:15 PM", timeAr: "6:15 م", titleEn: "The Moment to Make It Count", titleAr: "لحظة تصنع الفرق", noteEn: "Auction", noteAr: "المزاد" }],
  },
  {
    labelEn: "Act IV",
    labelAr: "الفصل الرابع",
    titleEn: "A Shared Celebration",
    titleAr: "احتفال مشترك",
    timeEn: "7:00 – 8:15 PM",
    timeAr: "7:00 – 8:15 مساءً",
    items: [
      { timeEn: "7:00 PM", timeAr: "7:00 م", titleEn: "A Celebration of Shared Light", titleAr: "احتفال بالنور المشترك", noteEn: "Entertainment", noteAr: "فقرة ترفيهية" },
      { timeEn: "7:30 PM", timeAr: "7:30 م", titleEn: "A Table of Shared Purpose", titleAr: "مائدة الهدف المشترك", noteEn: "Dinner", noteAr: "العشاء" },
      { timeEn: "8:15 PM", timeAr: "8:15 م", titleEn: "The Light Carries On", titleAr: "يستمر النور", noteEn: "Close of the evening", noteAr: "ختام الأمسية" },
    ],
  },
];

function parseAct(it: SectionItem): ActState {
  let en: { label?: string; time?: string; items?: { id?: string; time?: string; title?: string; note?: string; highlight?: boolean }[] } = {};
  let ar: { label?: string; time?: string; items?: { id?: string; time?: string; title?: string; note?: string; highlight?: boolean }[] } = {};
  try {
    if (it.textEn) en = JSON.parse(it.textEn);
  } catch {}
  try {
    if (it.textAr) ar = JSON.parse(it.textAr);
  } catch {}

  const enItems = Array.isArray(en.items) ? en.items : [];
  const arItems = Array.isArray(ar.items) ? ar.items : [];
  const maxLen = Math.max(enItems.length, arItems.length);
  const items: AgendaItemState[] = [];
  for (let i = 0; i < maxLen; i++) {
    const e = enItems[i] || {};
    const a = arItems[i] || {};
    items.push({
      id: e.id || a.id || `item-${i + 1}`,
      timeEn: e.time || "",
      timeAr: a.time || e.time || "",
      titleEn: e.title || "",
      titleAr: a.title || e.title || "",
      noteEn: e.note || "",
      noteAr: a.note || e.note || "",
      highlight: !!(e.highlight || a.highlight),
    });
  }

  return {
    id: it.id,
    code: it.code || `act-${it.sortOrder}`,
    sortOrder: it.sortOrder,
    labelEn: en.label || "",
    labelAr: ar.label || "",
    titleEn: it.titleEn || "",
    titleAr: it.titleAr || "",
    timeEn: en.time || "",
    timeAr: ar.time || en.time || "",
    items,
  };
}

function encodeAct(act: ActState) {
  const enData = {
    label: act.labelEn.trim(),
    time: act.timeEn.trim(),
    items: act.items.map((i) => ({
      id: i.id,
      time: i.timeEn.trim(),
      title: i.titleEn.trim(),
      ...(i.noteEn.trim() ? { note: i.noteEn.trim() } : {}),
      ...(i.highlight ? { highlight: true } : {}),
    })),
  };
  const arData = {
    label: act.labelAr.trim() || act.labelEn.trim(),
    time: act.timeAr.trim() || act.timeEn.trim(),
    items: act.items.map((i) => ({
      id: i.id,
      time: i.timeAr.trim() || i.timeEn.trim(),
      title: i.titleAr.trim() || i.titleEn.trim(),
      ...(i.noteAr.trim() || i.noteEn.trim() ? { note: i.noteAr.trim() || i.noteEn.trim() } : {}),
      ...(i.highlight ? { highlight: true } : {}),
    })),
  };
  return {
    titleEn: act.titleEn.trim(),
    titleAr: act.titleAr.trim() || null,
    textEn: JSON.stringify(enData),
    textAr: JSON.stringify(arData),
  };
}

export function GalaAgendaCard({ ev }: { ev: GalaEvent }) {
  const { t } = useLocale();
  const x = t.gala.settings.agenda;
  const key = ["gala", "page-sections", ev.id];
  const q = useQuery({ queryKey: key, queryFn: () => svc.getEventPage(ev.id) });
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
  };

  const detail = useEventDetail(ev.id, true);
  const { can } = useAuth();
  const errText = useContentError();
  const publishNow = useMutation({
    mutationFn: () => publishEvent(ev.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: galaKeys.event(ev.id) });
      void qc.invalidateQueries({ queryKey: galaKeys.events });
      void qc.invalidateQueries({ queryKey: key });
    },
  });
  const notPublic = !!detail.data && !isEventPublic(detail.data);
  const section = q.data?.sections.find((s) => s.key === "EVENT_AGENDA") ?? null;

  return (
    <Card labelledBy="gs-agenda">
      <CardHeader id="gs-agenda" title={x.title} subtitle={x.subtitle} />
      <WidgetState q={q} minH="min-h-32">
        {q.data && (
          <div className="space-y-6" data-testid="gala-agenda-admin">
            {notPublic && (
              <Notice tone="warn">
                <div className="space-y-2">
                  <p data-testid="gala-agenda-not-public">{t.gala.settings.publish.notPublic}</p>
                  {can("events.publish") && (detail.data?.publishBlockers ?? []).length === 0 && (
                    <button type="button" className="btn-admin btn-primary" disabled={publishNow.isPending} onClick={() => publishNow.mutate()} data-testid="gala-agenda-publish-event">
                      <Globe className="size-4" aria-hidden="true" /> {t.gala.settings.publish.publish}
                    </button>
                  )}
                  {publishNow.isError && <p className="text-xs text-danger" role="alert">{errText(publishNow.error)}</p>}
                </div>
              </Notice>
            )}
            {!section ? (
              <NoSection ev={ev} onCreated={refresh} />
            ) : (
              <AgendaEditor ev={ev} section={section} onChange={refresh} />
            )}
          </div>
        )}
      </WidgetState>
    </Card>
  );
}

function NoSection({ ev, onCreated }: { ev: GalaEvent; onCreated: () => void }) {
  const { t } = useLocale();
  const x = t.gala.settings.agenda;
  const { can } = useAuth();
  const errText = useContentError();
  const create = useMutation({
    mutationFn: () => svc.createSection(ev.id, "EVENT_AGENDA"),
    onSuccess: onCreated,
  });

  return (
    <div className="rounded-xl border border-dashed border-line p-6 text-center">
      <p className="mb-4 text-sm text-muted">{x.noActs}</p>
      {can("events.manage") && (
        <button
          type="button"
          className="btn-admin btn-primary"
          disabled={create.isPending}
          onClick={() => create.mutate()}
        >
          <Plus className="size-4" aria-hidden="true" /> {x.createSection}
        </button>
      )}
      {create.isError && <p className="mt-2 text-xs text-danger" role="alert">{errText(create.error)}</p>}
    </div>
  );
}

function AgendaEditor({ ev, section, onChange: refresh }: { ev: GalaEvent; section: Section; onChange: () => void }) {
  const { t } = useLocale();
  const x = t.gala.settings.agenda;
  const { can } = useAuth();
  const errText = useContentError();
  const canManage = can("events.manage");
  const canPublish = can("events.publish");
  // Save = publish (26 Nov 2026): the content is already client-approved, so EVERY save, delete and reorder is published straight away
  // (section snapshot + website refresh) for anyone with events.publish. No approval reference or extra step is involved.
  const onChange = async () => {
    if (canPublish) {
      try {
        await svc.setSectionStatus(ev.id, section.id, true);
      } catch {
        // Edit is saved; the Publish button remains available if auto-publish fails.
      }
    }
    refresh();
  };

  const [confirmPublish, setConfirmPublish] = useState(false);
  const [showSectionCopy, setShowSectionCopy] = useState(false);
  const [initBusy, setInitBusy] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const toggle = useMutation({
    mutationFn: (publish: boolean) => svc.setSectionStatus(ev.id, section.id, publish),
    onSuccess: () => {
      setConfirmPublish(false);
      refresh();
    },
  });

  const rawItems = [...(section.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const acts = rawItems.map(parseAct);

  const addAct = useMutation({
    mutationFn: () => {
      const nextNum = acts.length + 1;
      const code = `act-${Date.now()}`;
      return svc.addItem(ev.id, section.id, {
        code,
        titleEn: `Act ${nextNum}`,
        titleAr: `الفصل ${nextNum}`,
        textEn: JSON.stringify({ label: `Act ${nextNum}`, time: "", items: [] }),
        textAr: JSON.stringify({ label: `الفصل ${nextNum}`, time: "", items: [] }),
        sortOrder: (acts.length + 1) * 10,
        isVisible: true,
      });
    },
    onSuccess: onChange,
  });

  const reorderActs = useMutation({
    mutationFn: (ids: string[]) => svc.reorderItems(ev.id, section.id, ids),
    onSuccess: onChange,
  });

  const moveAct = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= acts.length) return;
    const newActs = [...acts];
    const [moved] = newActs.splice(index, 1);
    newActs.splice(targetIndex, 0, moved);
    reorderActs.mutate(newActs.map((a) => a.id));
  };

  const handleInitDefault = async () => {
    setInitBusy(true);
    setInitError(null);
    try {
      for (const [idx, def] of DEFAULT_ACTS.entries()) {
        const enData = {
          label: def.labelEn,
          time: def.timeEn,
          items: def.items.map((i, itIdx) => ({
            id: `item-${itIdx + 1}`,
            time: i.timeEn,
            title: i.titleEn,
            ...(i.noteEn ? { note: i.noteEn } : {}),
            ...(i.highlight ? { highlight: true } : {}),
          })),
        };
        const arData = {
          label: def.labelAr,
          time: def.timeAr,
          items: def.items.map((i, itIdx) => ({
            id: `item-${itIdx + 1}`,
            time: i.timeAr,
            title: i.titleAr,
            ...(i.noteAr ? { note: i.noteAr } : {}),
            ...(i.highlight ? { highlight: true } : {}),
          })),
        };
        await svc.addItem(ev.id, section.id, {
          code: `act-${idx + 1}`,
          titleEn: def.titleEn,
          titleAr: def.titleAr,
          textEn: JSON.stringify(enData),
          textAr: JSON.stringify(arData),
          sortOrder: (idx + 1) * 10,
          isVisible: true,
        });
      }
      onChange();
    } catch (e) {
      setInitError(errText(e));
    } finally {
      setInitBusy(false);
    }
  };

  const published = section.status === "PUBLISHED";

  return (
    <div className="space-y-6">
      {/* Header action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-bg/50 p-4">
        <div>
          <p className="text-sm font-bold text-ink">
            {fill(x.sectionInfo, { status: section.status })}
            {section.hasUnpublishedChanges && (
              <span className="ms-2 font-normal text-warn">· {x.pendingChanges}</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canPublish && (!published || section.hasUnpublishedChanges) && (
            <button
              type="button"
              className="btn-admin btn-primary"
              onClick={() => setConfirmPublish(true)}
            >
              <Globe className="size-4" aria-hidden="true" /> {x.publish}
            </button>
          )}
          {canPublish && published && (
            <button
              type="button"
              className="btn-admin btn-ghost text-danger"
              disabled={toggle.isPending}
              onClick={() => toggle.mutate(false)}
            >
              <Undo2 className="size-4" aria-hidden="true" /> {x.unpublish}
            </button>
          )}
        </div>
      </div>

      {/* Section Header Copy (Eyebrow, Title, Schedule line, Footer note) */}
      <div className="rounded-xl border border-line p-4">
        <button
          type="button"
          className="flex w-full items-center justify-between text-start text-sm font-bold text-ink"
          onClick={() => setShowSectionCopy((v) => !v)}
        >
          <span>{x.sectionDetails}</span>
          {showSectionCopy ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        {showSectionCopy && (
          <div className="mt-4 pt-4 border-t border-line">
            <SectionCopyEditor ev={ev} section={section} onChange={onChange} />
          </div>
        )}
      </div>

      {/* Acts list */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-ink">{x.acts}</h3>
          {canManage && (
            <button
              type="button"
              className="btn-admin btn-ghost"
              disabled={addAct.isPending}
              onClick={() => addAct.mutate()}
            >
              <Plus className="size-4" aria-hidden="true" /> {x.addAct}
            </button>
          )}
        </div>

        {acts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line p-8 text-center">
            <p className="mb-4 text-sm text-muted">{x.noActs}</p>
            {canManage && (
              <button
                type="button"
                className="btn-admin btn-primary"
                disabled={initBusy}
                onClick={handleInitDefault}
              >
                <Plus className="size-4" aria-hidden="true" /> {initBusy ? "…" : x.initDefault}
              </button>
            )}
            {initError && <p className="mt-2 text-xs text-danger" role="alert">{initError}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            {acts.map((act, index) => (
              <ActItemEditor
                key={act.id}
                ev={ev}
                act={act}
                index={index}
                total={acts.length}
                canManage={canManage}
                onMoveUp={() => moveAct(index, "up")}
                onMoveDown={() => moveAct(index, "down")}
                onChange={onChange}
              />
            ))}
          </div>
        )}
      </div>

      {confirmPublish && (
        <ConfirmDialog
          open
          title={x.publishConfirmTitle}
          confirmLabel={x.publish}
          busy={toggle.isPending}
          error={toggle.isError ? errText(toggle.error) : null}
          onClose={() => {
            toggle.reset();
            setConfirmPublish(false);
          }}
          onConfirm={() => toggle.mutate(true)}
        >
          <p>{x.publishConfirmBody}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function SectionCopyEditor({ ev, section, onChange }: { ev: GalaEvent; section: Section; onChange: () => void }) {
  const { t } = useLocale();
  const x = t.gala.settings.agenda;
  const { can } = useAuth();
  const errText = useContentError();
  const canManage = can("events.manage");

  const [eyebrowEn, setEyebrowEn] = useState(section.eyebrowEn ?? "");
  const [eyebrowAr, setEyebrowAr] = useState(section.eyebrowAr ?? "");
  const [titleEn, setTitleEn] = useState(section.titleEn ?? "");
  const [titleAr, setTitleAr] = useState(section.titleAr ?? "");
  const [subtitleEn, setSubtitleEn] = useState(section.subtitleEn ?? "");
  const [subtitleAr, setSubtitleAr] = useState(section.subtitleAr ?? "");
  const [bodyEn, setBodyEn] = useState(section.bodyEn ?? "");
  const [bodyAr, setBodyAr] = useState(section.bodyAr ?? "");
  const [savedMsg, setSavedMsg] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      svc.updateSection(ev.id, section.id, {
        eyebrowEn: eyebrowEn.trim() || null,
        eyebrowAr: eyebrowAr.trim() || null,
        titleEn: titleEn.trim() || null,
        titleAr: titleAr.trim() || null,
        subtitleEn: subtitleEn.trim() || null,
        subtitleAr: subtitleAr.trim() || null,
        bodyEn: bodyEn.trim() || null,
        bodyAr: bodyAr.trim() || null,
      }),
    onSuccess: () => {
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
      onChange();
    },
  });

  return (
    <div className="space-y-3">
      <Bilingual
        label={x.eyebrow}
        en={eyebrowEn}
        ar={eyebrowAr}
        onEn={setEyebrowEn}
        onAr={setEyebrowAr}
        disabled={!canManage}
        maxLength={200}
      />
      <Bilingual
        label={x.sectionTitle}
        en={titleEn}
        ar={titleAr}
        onEn={setTitleEn}
        onAr={setTitleAr}
        disabled={!canManage}
        maxLength={200}
      />
      <Bilingual
        label={x.hours}
        en={subtitleEn}
        ar={subtitleAr}
        onEn={setSubtitleEn}
        onAr={setSubtitleAr}
        disabled={!canManage}
        maxLength={300}
      />
      <Bilingual
        label={x.note}
        en={bodyEn}
        ar={bodyAr}
        onEn={setBodyEn}
        onAr={setBodyAr}
        multiline
        rows={2}
        disabled={!canManage}
        maxLength={500}
      />
      {canManage && (
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            className="btn-admin btn-primary !min-h-9"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {x.saveSection}
          </button>
          {savedMsg && <span className="text-xs text-ok">{x.saved}</span>}
        </div>
      )}
      {save.isError && <p className="text-xs text-danger" role="alert">{errText(save.error)}</p>}
    </div>
  );
}

function ActItemEditor({
  ev,
  act,
  index,
  total,
  canManage,
  onMoveUp,
  onMoveDown,
  onChange,
}: {
  ev: GalaEvent;
  act: ActState;
  index: number;
  total: number;
  canManage: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onChange: () => void;
}) {
  const { t } = useLocale();
  const x = t.gala.settings.agenda;
  const errText = useContentError();

  const [expanded, setExpanded] = useState(true);
  const [actState, setActState] = useState<ActState>(act);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  const saveAct = useMutation({
    mutationFn: () => svc.updateItem(ev.id, act.id, encodeAct(actState)),
    onSuccess: () => {
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
      onChange();
    },
  });

  const removeAct = useMutation({
    mutationFn: () => svc.deleteItem(ev.id, act.id),
    onSuccess: () => {
      setConfirmDelete(false);
      onChange();
    },
  });

  const updateItem = (itemIdx: number, updates: Partial<AgendaItemState>) => {
    setActState((prev) => {
      const nextItems = [...prev.items];
      nextItems[itemIdx] = { ...nextItems[itemIdx], ...updates };
      return { ...prev, items: nextItems };
    });
  };

  const addItemToAct = () => {
    setActState((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          id: `item-${Date.now()}`,
          timeEn: "",
          timeAr: "",
          titleEn: "",
          titleAr: "",
          noteEn: "",
          noteAr: "",
          highlight: false,
        },
      ],
    }));
  };

  const moveItem = (itemIdx: number, dir: "up" | "down") => {
    const targetIdx = dir === "up" ? itemIdx - 1 : itemIdx + 1;
    if (targetIdx < 0 || targetIdx >= actState.items.length) return;
    setActState((prev) => {
      const nextItems = [...prev.items];
      const [item] = nextItems.splice(itemIdx, 1);
      nextItems.splice(targetIdx, 0, item);
      return { ...prev, items: nextItems };
    });
  };

  const removeItem = (itemIdx: number) => {
    setActState((prev) => {
      const nextItems = [...prev.items];
      nextItems.splice(itemIdx, 1);
      return { ...prev, items: nextItems };
    });
  };

  return (
    <div className="rounded-xl border border-line bg-card p-4 space-y-4" data-testid="gala-agenda-act">
      {/* Act Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div className="flex items-center gap-2">
          {canManage && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn-admin btn-ghost !p-1.5"
                disabled={index === 0}
                onClick={onMoveUp}
                aria-label={x.moveUp}
              >
                <ArrowUp className="size-3.5" />
              </button>
              <button
                type="button"
                className="btn-admin btn-ghost !p-1.5"
                disabled={index === total - 1}
                onClick={onMoveDown}
                aria-label={x.moveDown}
              >
                <ArrowDown className="size-3.5" />
              </button>
            </div>
          )}
          <span className="font-serif text-base font-bold text-ink">
            {actState.labelEn || `Act ${index + 1}`} · {actState.titleEn || "—"}
          </span>
          {actState.timeEn && (
            <span className="text-xs text-muted">({actState.timeEn})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-admin btn-ghost !p-1.5"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
          {canManage && (
            <button
              type="button"
              className="btn-admin btn-ghost !p-1.5 text-danger"
              onClick={() => setConfirmDelete(true)}
              aria-label={x.removeAct}
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="space-y-4">
          {/* Act Details */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Bilingual
              label={x.actLabel}
              en={actState.labelEn}
              ar={actState.labelAr}
              onEn={(s) => setActState((prev) => ({ ...prev, labelEn: s }))}
              onAr={(s) => setActState((prev) => ({ ...prev, labelAr: s }))}
              disabled={!canManage}
              maxLength={60}
            />
            <Bilingual
              label={x.actTitle}
              en={actState.titleEn}
              ar={actState.titleAr}
              onEn={(s) => setActState((prev) => ({ ...prev, titleEn: s }))}
              onAr={(s) => setActState((prev) => ({ ...prev, titleAr: s }))}
              disabled={!canManage}
              maxLength={200}
            />
            <Bilingual
              label={x.actTime}
              en={actState.timeEn}
              ar={actState.timeAr}
              onEn={(s) => setActState((prev) => ({ ...prev, timeEn: s }))}
              onAr={(s) => setActState((prev) => ({ ...prev, timeAr: s }))}
              disabled={!canManage}
              maxLength={80}
            />
          </div>

          {/* Act Items list */}
          <div className="space-y-3 rounded-lg bg-bg/40 p-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted">{x.actItems}</h4>
              {canManage && (
                <button
                  type="button"
                  className="btn-admin btn-ghost !min-h-8 text-xs"
                  onClick={addItemToAct}
                >
                  <Plus className="size-3.5" aria-hidden="true" /> {x.addItem}
                </button>
              )}
            </div>

            {actState.items.length === 0 ? (
              <p className="text-xs text-muted">{x.noItems}</p>
            ) : (
              <div className="space-y-3">
                {actState.items.map((it, itemIdx) => (
                  <div
                    key={it.id}
                    className="flex flex-col gap-2 rounded-lg border border-line/70 bg-card p-3 sm:flex-row sm:items-start"
                  >
                    {canManage && (
                      <div className="flex sm:flex-col gap-1 pt-2 sm:pt-6">
                        <button
                          type="button"
                          className="btn-admin btn-ghost !p-1"
                          disabled={itemIdx === 0}
                          onClick={() => moveItem(itemIdx, "up")}
                          aria-label={x.moveUp}
                        >
                          <ArrowUp className="size-3" />
                        </button>
                        <button
                          type="button"
                          className="btn-admin btn-ghost !p-1"
                          disabled={itemIdx === actState.items.length - 1}
                          onClick={() => moveItem(itemIdx, "down")}
                          aria-label={x.moveDown}
                        >
                          <ArrowDown className="size-3" />
                        </button>
                      </div>
                    )}
                    <div className="flex-1 space-y-2">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Bilingual
                          label={x.itemTime}
                          en={it.timeEn}
                          ar={it.timeAr}
                          onEn={(s) => updateItem(itemIdx, { timeEn: s })}
                          onAr={(s) => updateItem(itemIdx, { timeAr: s })}
                          disabled={!canManage}
                          maxLength={50}
                        />
                        <Bilingual
                          label={x.itemTitle}
                          en={it.titleEn}
                          ar={it.titleAr}
                          onEn={(s) => updateItem(itemIdx, { titleEn: s })}
                          onAr={(s) => updateItem(itemIdx, { titleAr: s })}
                          disabled={!canManage}
                          maxLength={200}
                        />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Bilingual
                          label={x.itemNote}
                          en={it.noteEn}
                          ar={it.noteAr}
                          onEn={(s) => updateItem(itemIdx, { noteEn: s })}
                          onAr={(s) => updateItem(itemIdx, { noteAr: s })}
                          disabled={!canManage}
                          maxLength={200}
                        />
                        <div className="flex items-center gap-3 pt-6">
                          <Checkbox
                            label={x.itemHighlight}
                            checked={it.highlight}
                            onChange={(b) => updateItem(itemIdx, { highlight: b })}
                            disabled={!canManage}
                          />
                        </div>
                      </div>
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        className="btn-admin btn-ghost !p-1.5 self-end sm:self-start text-danger"
                        onClick={() => removeItem(itemIdx)}
                        aria-label={x.removeItem}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Act Save Bar */}
          {canManage && (
            <div className="flex items-center justify-between border-t border-line pt-3">
              <span className="text-xs text-ok">{savedMsg ? x.saved : ""}</span>
              <button
                type="button"
                className="btn-admin btn-primary !min-h-9"
                disabled={saveAct.isPending}
                onClick={() => saveAct.mutate()}
              >
                {x.saveAct}
              </button>
            </div>
          )}
          {saveAct.isError && <p className="text-xs text-danger" role="alert">{errText(saveAct.error)}</p>}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          open
          danger
          title={x.removeActTitle}
          confirmLabel={x.removeAct}
          busy={removeAct.isPending}
          error={removeAct.isError ? errText(removeAct.error) : null}
          onClose={() => {
            removeAct.reset();
            setConfirmDelete(false);
          }}
          onConfirm={() => removeAct.mutate()}
        >
          <p>{x.removeActBody}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
