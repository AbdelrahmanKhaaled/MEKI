"use client";

/**
 * Menus (Phase 6D). The website reads its header menu (nav-*) and footer giving links (giving-*) from the homepage FOOTER
 * section (apps/web resolveMenu). This page edits those items one by one and publishes the FOOTER section. Other items
 * and fields of that section are never touched. Gala Night and Give stay fixed website entries.
 */
import { useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Plus, Trash2, Upload } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { EmptyState, ErrorState, WidgetSkeleton } from "@/components/common/States";
import { Bilingual, Checkbox, ContentGateNotice, Select, TextInput, useContentError } from "@/components/content/ui";
import { ConfirmDialog, Notice, PageHeader } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { FinancePage } from "@/features/finance/FinancePage";
import { useCmsMutation, usePage } from "@/hooks/useCmsData";
import { useForm } from "@/hooks/useForm";
import { ApiError } from "@/lib/api";
import { DEFAULT_MENUS, isDirtySection, itemsFor, menuEntryError, menuEntryWarning, menuState, nextCode, sectionPublishGate, SITE_PAGES, type ListRule } from "@/lib/cms";
import type { Section, SectionItem } from "@/lib/cms-schemas";
import { fill } from "@/lib/i18n";
import * as svc from "@/services/cms";

const RULES: (ListRule & { title: "header" | "giving" })[] = [
  { name: "headerMenu", prefix: "nav-", fields: ["title"], title: "header" },
  { name: "givingMenu", prefix: "giving-", fields: ["title"], title: "giving" },
];
const EXTERNAL = "__external";

export function MenusPage() {
  const { t } = useLocale();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.website }, { label: t.cms.menus.title }]} anyOf={["content.read"]}>
      <Menus />
    </FinancePage>
  );
}

function Menus() {
  const { t } = useLocale();
  const { can } = useAuth();
  const errText = useContentError();
  const x = t.cms.menus;
  const q = usePage("home");
  const [confirm, setConfirm] = useState(false);
  const footer = q.data?.sections.find((s) => s.key === "FOOTER");
  const toggle = useCmsMutation(() => svc.setSectionStatus(footer!.id, true));
  if (q.isPending) return <WidgetSkeleton rows={6} minH="min-h-80" />;
  if (q.isError) return q.error instanceof ApiError && q.error.status === 404 ? <EmptyState text={x.noFooter} minH="min-h-80" /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} minH="min-h-80" />;
  if (!footer) return <EmptyState text={x.noFooter} minH="min-h-80" />;
  const canManage = can("content.manage");
  const pub = sectionPublishGate(footer, can("content.publish"));
  const dirty = isDirtySection(footer);
  return (
    <>
      <PageHeader
        title={x.title}
        subtitle={x.subtitle}
        right={
          <button type="button" className="btn-admin btn-primary" disabled={!pub.allowed || !dirty} onClick={() => setConfirm(true)}>
            <Upload className="size-4" aria-hidden="true" /> {x.publish}
          </button>
        }
      />
      <Notice><p>{x.publishNote} {dirty ? <strong className="text-warn" data-testid="menus-dirty">{t.cms.common.unpublishedChanges}</strong> : <span className="text-ok">{t.cms.common.upToDate}</span>}</p></Notice>
      <ContentGateNotice gate={pub} title={t.cms.gate.title} />
      <Notice tone="gold"><p>{x.fixed}</p><p className="mt-1">{x.builtIn}</p><p className="mt-1">{x.noNesting}</p></Notice>
      {RULES.map((rule) => <MenuList key={rule.name} section={footer} rule={rule} canManage={canManage} />)}
      {confirm && (
        <ConfirmDialog open title={x.publishTitle} confirmLabel={x.publish} busy={toggle.isPending} error={toggle.isError ? errText(toggle.error) : null} onClose={() => { toggle.reset(); setConfirm(false); }} onConfirm={() => toggle.mutate(undefined, { onSuccess: () => setConfirm(false) })}>
          <p>{x.publishBody}</p>
        </ConfirmDialog>
      )}
    </>
  );
}

function MenuList({ section, rule, canManage }: { section: Section; rule: (typeof RULES)[number]; canManage: boolean }) {
  const { t } = useLocale();
  const errText = useContentError();
  const x = t.cms.menus;
  const items = itemsFor(rule, section.items);
  const state = menuState(items);
  const add = useCmsMutation(() => svc.createItem(section.id, { code: nextCode(rule.prefix!, section.items), titleEn: "", isVisible: false, provenance: section.provenance === "DEMO" ? "DEMO" : "PROPOSED" }));
  const reorder = useCmsMutation((ids: string[]) => svc.reorderItems(section.id, ids));
  // Aligns the stored entries with the website's real navigation (entry i → page i; leftovers are hidden, never deleted).
  const reset = useCmsMutation(async () => {
    const defaults = DEFAULT_MENUS[rule.prefix as "nav-" | "giving-"];
    const used: { code: string | null }[] = section.items.map((i) => ({ code: i.code }));
    for (const [i, d] of defaults.entries()) {
      const body = { titleEn: d.en, titleAr: d.ar, href: d.href, isVisible: true };
      if (items[i]) await svc.updateItem(items[i].id, body);
      else {
        const created = await svc.createItem(section.id, { code: nextCode(rule.prefix!, used), ...body, provenance: section.provenance === "DEMO" ? "DEMO" : "PROPOSED" });
        used.push({ code: created.code });
      }
    }
    for (const extra of items.slice(defaults.length)) await svc.updateItem(extra.id, { isVisible: false });
    // keep this menu's order = the website's order
    return null;
  });
  /** The API reorders the whole section: only this menu's positions change, other items keep theirs. */
  const move = (i: number, d: -1 | 1) => {
    const all = [...section.items].sort((a, b) => a.sortOrder - b.sortOrder);
    const mine = [...items];
    [mine[i], mine[i + d]] = [mine[i + d], mine[i]];
    let k = 0;
    reorder.mutate(all.map((it) => (items.some((m) => m.id === it.id) ? mine[k++].id : it.id)));
  };
  return (
    <Card labelledBy={`mn-${rule.name}`}>
      <CardHeader id={`mn-${rule.name}`} title={x[rule.title]} right={canManage ? <button type="button" className="btn-admin btn-ghost" disabled={add.isPending} onClick={() => add.mutate(undefined)}><Plus className="size-4" aria-hidden="true" /> {x.add}</button> : undefined} />
      <p className={`mb-3 flex items-center gap-2 rounded-lg p-2 text-sm ${state.used ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`} data-testid={`menu-state-${rule.name}`}>
        {state.used ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <AlertTriangle className="size-4" aria-hidden="true" />}
        {state.used ? x.used : fill(x.notUsed, { n: state.invalid })}
      </p>
      {!state.used && canManage && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-line p-3 text-sm">
          <button type="button" className="btn-admin btn-ghost" disabled={reset.isPending} onClick={() => reset.mutate(undefined)} data-testid={`menu-reset-${rule.name}`}>{x.resetToSite}</button>
          <span className="text-muted">{x.resetHint}</span>
        </div>
      )}
      {(add.isError || reorder.isError || reset.isError) && <p className="mb-2 text-sm text-danger" role="alert">{errText(add.error ?? reorder.error ?? reset.error)}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-muted">{x.empty}</p>
      ) : (
        <ol className="space-y-3">
          {items.map((it, i) => <Entry key={`${it.id}:${it.href}:${it.titleEn}:${it.isVisible}`} item={it} n={i + 1} canManage={canManage} first={i === 0} last={i === items.length - 1} moving={reorder.isPending} onMove={(d) => move(i, d)} />)}
        </ol>
      )}
    </Card>
  );
}

const toForm = (it: Pick<SectionItem, "titleEn" | "titleAr" | "href" | "isVisible">) => ({ titleEn: it.titleEn ?? "", titleAr: it.titleAr ?? "", href: it.href ?? "", isVisible: it.isVisible });

function Entry({ item, n, canManage, first, last, moving, onMove }: { item: SectionItem; n: number; canManage: boolean; first: boolean; last: boolean; moving: boolean; onMove: (d: -1 | 1) => void }) {
  const { t } = useLocale();
  const errText = useContentError();
  const x = t.cms.menus;
  const form = useForm(toForm(item));
  const v = form.values;
  const [confirm, setConfirm] = useState(false);
  const [external, setExternal] = useState(() => !!item.href && !SITE_PAGES.some((p) => p.path === item.href));
  const error = menuEntryError(v);
  const warning = menuEntryWarning(v);
  const save = useCmsMutation(() => {
    const b: Record<string, unknown> = {};
    for (const k of form.dirty) b[k] = k === "isVisible" ? v.isVisible : v[k].trim();
    return svc.updateItem(item.id, b);
  });
  const remove = useCmsMutation(() => svc.deleteItem(item.id));
  // an invalid href is refused by the API (and ignored by the website): block saving it; a hidden draft entry may stay incomplete
  const hrefBad = form.dirty.includes("href") && (!v.href.trim() || (error !== null && error !== "menuLabel"));
  const selectValue = external ? EXTERNAL : SITE_PAGES.find((p) => p.path === v.href)?.path ?? "";
  return (
    <li className={`rounded-xl border p-3 ${error && v.isVisible ? "border-warn" : "border-line"} ${!v.isVisible ? "bg-bg/60" : ""}`} data-code={item.code ?? ""}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-muted">{fill(x.entry, { n })} · <bdi dir="ltr">{item.code}</bdi></span>
        {canManage && (
          <span className="flex items-center gap-1">
            <button type="button" className="rounded p-1 hover:bg-bg disabled:opacity-30" disabled={first || moving} onClick={() => onMove(-1)} aria-label={t.cms.common.moveUp}><ArrowUp className="size-4" aria-hidden="true" /></button>
            <button type="button" className="rounded p-1 hover:bg-bg disabled:opacity-30" disabled={last || moving} onClick={() => onMove(1)} aria-label={t.cms.common.moveDown}><ArrowDown className="size-4" aria-hidden="true" /></button>
            <button type="button" className="rounded p-1 text-danger hover:bg-bg" onClick={() => setConfirm(true)} aria-label={x.remove}><Trash2 className="size-4" aria-hidden="true" /></button>
          </span>
        )}
      </div>
      <div className="space-y-3">
        <Bilingual label={x.label} en={v.titleEn} ar={v.titleAr} onEn={(s) => form.set("titleEn", s)} onAr={(s) => form.set("titleAr", s)} disabled={!canManage} maxLength={500} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label={x.target}
            value={selectValue}
            emptyLabel="—"
            disabled={!canManage}
            onChange={(s) => { if (s === EXTERNAL) { setExternal(true); if (SITE_PAGES.some((p) => p.path === v.href)) form.set("href", ""); } else { setExternal(false); form.set("href", s); } }}
            options={[...SITE_PAGES.map((p) => ({ value: p.path, label: `${x.pages[p.key] ?? p.key} (${p.path})` })), { value: EXTERNAL, label: x.external }]}
          />
          {external && <TextInput label={x.external} value={v.href} onChange={(s) => form.set("href", s)} disabled={!canManage} dir="ltr" maxLength={500} placeholder={x.externalUrl} />}
        </div>
        <Checkbox label={x.visible} checked={v.isVisible} onChange={(b) => form.set("isVisible", b)} disabled={!canManage} />
        {error && <p className={`text-xs ${v.isVisible ? "text-warn" : "text-muted"}`} data-testid="menu-entry-error">{t.cms.errors[error]}{!v.isVisible && ` ${x.hiddenEntry}`}</p>}
        {warning && <p className="text-xs text-muted">{t.cms.errors[warning]}</p>}
        {canManage && form.dirty.length > 0 && (
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-admin btn-ghost !min-h-9" onClick={() => { form.discard(); setExternal(!!item.href && !SITE_PAGES.some((p) => p.path === item.href)); }}>{t.content.common.discard}</button>
            <button type="button" className="btn-admin btn-primary !min-h-9" disabled={save.isPending || hrefBad} onClick={() => save.mutate(undefined, { onSuccess: (r) => form.reset(toForm(r)) })}>{save.isPending ? t.content.common.saving : t.cms.common.saveItem}</button>
          </div>
        )}
        {save.isError && <p className="text-xs text-danger" role="alert">{errText(save.error)}</p>}
        {save.isSuccess && !form.dirty.length && <p className="text-xs text-ok" role="status">{x.saved}</p>}
      </div>
      {confirm && (
        <ConfirmDialog open danger title={x.removeTitle} confirmLabel={x.remove} busy={remove.isPending} error={remove.isError ? errText(remove.error) : null} onClose={() => { remove.reset(); setConfirm(false); }} onConfirm={() => remove.mutate(undefined, { onSuccess: () => setConfirm(false) })}>
          <p>{x.removeBody}</p>
        </ConfirmDialog>
      )}
    </li>
  );
}
