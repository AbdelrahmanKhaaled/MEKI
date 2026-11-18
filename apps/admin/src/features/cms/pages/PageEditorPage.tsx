"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { EmptyState, ErrorState, WidgetSkeleton } from "@/components/common/States";
import { SectionEditor, useSectionName } from "@/components/cms/SectionEditor";
import { Bilingual, ContentGateNotice, ProvenanceNotice, SaveBar, Select, TextInput, useContentError } from "@/components/content/ui";
import { ConfirmDialog, Notice, PageHeader, Ref } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { FinancePage, useBackHref, useHref } from "@/features/finance/FinancePage";
import { useCmsMutation, usePage, usePages } from "@/hooks/useCmsData";
import { useForm } from "@/hooks/useForm";
import { freeKeys, sectionDeleteGate, type SectionDef } from "@/lib/cms";
import { SECTION_KEYS, type PageDetail } from "@/lib/cms-schemas";
import { PROVENANCES } from "@/lib/content-schemas";
import { slugError } from "@/lib/content";
import { fill } from "@/lib/i18n";
import * as svc from "@/services/cms";
import { PageSettingsCard } from "../PageSettingsCard";

/** Content blocks of a site page: each block is a CMS section (title + text); the legal pages render them in order. */
const BLOCK_DEF: SectionDef = { key: "BLOCK", fields: ["title", "body"], labels: [], lists: [], hideable: true };
/** Slugs the public website already renders from published CMS pages (apps/web LegalPage). */
const KNOWN_SLUGS = ["privacy", "terms", "cookies"];

export function PageEditorPage({ id }: { id?: string }) {
  const { t } = useLocale();
  const href = useHref();
  const x = t.cms.pages;
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.website }, { label: x.title, href: href("/pages") }, { label: id ? t.content.common.edit : x.newTitle }]} anyOf={id ? ["content.read"] : ["content.manage"]}>
      {id ? <Existing slug={id} /> : <NewPage />}
    </FinancePage>
  );
}

function NewPage() {
  const { t } = useLocale();
  const router = useRouter();
  const href = useHref();
  const backHref = useBackHref("/pages");
  const errText = useContentError();
  const x = t.cms.pages;
  const pages = usePages();
  const form = useForm({ slug: "", titleEn: "", titleAr: "", provenance: "PROPOSED" });
  const v = form.values;
  const [touched, setTouched] = useState(false);
  const taken = new Set((pages.data ?? []).map((p) => p.slug));
  const errors = {
    slug: !v.slug ? t.cms.errors.required : slugError(v.slug) ? t.cms.errors.slugFormat : taken.has(v.slug) ? t.cms.errors.PAGE_SLUG_TAKEN : null,
    titleEn: v.titleEn.trim().length < 2 ? t.cms.errors.required : null,
  };
  const create = useCmsMutation(() => svc.createPage({ slug: v.slug, titleEn: v.titleEn.trim(), ...(v.titleAr.trim() ? { titleAr: v.titleAr.trim() } : {}), provenance: v.provenance }));
  return (
    <>
      <PageHeader back={{ href: backHref, label: x.title }} title={x.newTitle} />
      <ProvenanceNotice value={v.provenance} />
      <Card labelledBy="np-t">
        <CardHeader id="np-t" title={x.newTitle} />
        <div className="space-y-5">
          <TextInput label={x.slug} value={v.slug} onChange={(s) => form.set("slug", s.toLowerCase())} hint={x.slugHint} error={touched ? errors.slug : null} required dir="ltr" maxLength={80} placeholder="privacy" />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted">{x.knownSlugs}:</span>
            {KNOWN_SLUGS.map((s) => (
              <button key={s} type="button" disabled={taken.has(s)} onClick={() => form.set("slug", s)} className="rounded-full border border-line px-2.5 py-1 font-bold text-meki-green-dark disabled:opacity-40"><bdi dir="ltr">/{s}</bdi></button>
            ))}
          </div>
          <Bilingual label={t.content.campaigns.fields.title} en={v.titleEn} ar={v.titleAr} onEn={(s) => form.set("titleEn", s)} onAr={(s) => form.set("titleAr", s)} requiredEn errorEn={touched ? errors.titleEn : null} maxLength={255} />
          <Select label={t.content.common.provenance} value={v.provenance} onChange={(s) => form.set("provenance", s)} options={PROVENANCES.map((p) => ({ value: p, label: t.content.provenance[p] }))} />
        </div>
      </Card>
      <SaveBar
        dirty={form.dirty.length || 1}
        busy={create.isPending}
        onDiscard={form.discard}
        onSave={() => { setTouched(true); if (errors.slug || errors.titleEn) return; create.mutate(undefined, { onSuccess: (p) => router.replace(href(`/pages/${p.slug}`)) }); }}
        error={create.isError ? errText(create.error) : null}
      />
    </>
  );
}

function Existing({ slug }: { slug: string }) {
  const href = useHref();
  const router = useRouter();
  const isHome = slug === "home";
  const q = usePage(slug, !isHome);
  // the homepage has its own editor (fixed website layout)
  useEffect(() => {
    if (isHome) router.replace(href("/homepage"));
  }, [isHome, router, href]);
  if (isHome || q.isPending) return <WidgetSkeleton rows={6} minH="min-h-80" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} minH="min-h-80" />;
  return <Editor page={q.data} key={q.data.id} />;
}

function Editor({ page }: { page: PageDetail }) {
  const { locale, t } = useLocale();
  const { can } = useAuth();
  const backHref = useBackHref("/pages");
  const errText = useContentError();
  const sectionName = useSectionName();
  const x = t.cms.pages;
  const canManage = can("content.manage");
  const [newKey, setNewKey] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const sections = [...page.sections].sort((a, b) => a.sortOrder - b.sortOrder);
  const free = freeKeys(SECTION_KEYS, sections.map((s) => s.key));
  const add = useCmsMutation((key: string) => svc.createSection(page.slug, { key, titleEn: "", isVisible: true, provenance: page.provenance === "DEMO" ? "DEMO" : "PROPOSED" }));
  const reorder = useCmsMutation((ids: string[]) => svc.reorderSections(page.slug, ids));
  const remove = useCmsMutation((id: string) => svc.deleteSection(id));
  const move = (i: number, d: -1 | 1) => {
    const ids = sections.map((s) => s.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    reorder.mutate(ids);
  };
  const target = sections.find((s) => s.id === removing);
  return (
    <>
      <PageHeader back={{ href: backHref, label: x.title }} title={<bdi>{locale === "ar" && page.titleAr ? page.titleAr : page.titleEn}</bdi>} subtitle={`${x.publicLink}: /${locale}/${page.slug}`} />
      <ProvenanceNotice value={page.provenance} />
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="min-w-0 space-y-4 xl:col-span-8">
          <Card labelledBy="bl-t">
            <CardHeader id="bl-t" title={x.blocks} subtitle={x.blocksHint} />
            {canManage && (
              <div className="flex flex-wrap items-end gap-2">
                {free.length ? (
                  <>
                    <div className="min-w-48"><Select label={x.blockType} value={newKey} emptyLabel="—" onChange={setNewKey} options={free.map((k) => ({ value: k, label: `${sectionName(k)} (${k})` }))} /></div>
                    <button type="button" className="btn-admin btn-primary" disabled={!newKey || add.isPending} onClick={() => add.mutate(newKey, { onSuccess: () => setNewKey("") })}><Plus className="size-4" aria-hidden="true" /> {x.addBlock}</button>
                  </>
                ) : (
                  <p className="text-sm text-muted">{x.noFreeKeys}</p>
                )}
              </div>
            )}
            {(add.isError || reorder.isError) && <p className="mt-2 text-sm text-danger" role="alert">{errText(add.error ?? reorder.error)}</p>}
          </Card>
          {sections.length === 0 && <EmptyState text={x.empty} minH="min-h-24" />}
          {sections.map((s, i) => {
            const g = sectionDeleteGate(s, canManage);
            return (
              <div key={s.id} className="space-y-2">
                {canManage && (
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <span className="me-auto text-xs font-bold text-muted">{x.reorder} {i + 1} · <Ref>{s.key}</Ref></span>
                    <button type="button" className="rounded p-1.5 hover:bg-white disabled:opacity-30" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)} aria-label={t.cms.common.moveUp}><ArrowUp className="size-4" aria-hidden="true" /></button>
                    <button type="button" className="rounded p-1.5 hover:bg-white disabled:opacity-30" disabled={i === sections.length - 1 || reorder.isPending} onClick={() => move(i, 1)} aria-label={t.cms.common.moveDown}><ArrowDown className="size-4" aria-hidden="true" /></button>
                    <button type="button" className="inline-flex items-center gap-1 rounded px-2 py-1.5 text-xs font-bold text-danger hover:bg-white disabled:opacity-40" disabled={!g.allowed} onClick={() => setRemoving(s.id)} title={g.allowed ? undefined : t.cms.gate.unpublishFirst}><Trash2 className="size-4" aria-hidden="true" /> {x.removeBlock}</button>
                  </div>
                )}
                {!g.allowed && canManage && s.status === "PUBLISHED" && <ContentGateNotice gate={g} title={x.removeBlock} />}
                <SectionEditor section={s} def={{ ...BLOCK_DEF, key: s.key }} canManage={canManage} canPublish={can("content.publish")} />
                {s.items.length > 0 && <Notice>{fill(t.cms.common.itemsKept, { n: s.items.length })}</Notice>}
              </div>
            );
          })}
        </div>
        <div className="min-w-0 space-y-4 xl:col-span-4">
          <PageSettingsCard page={page} />
        </div>
      </div>
      {target && (
        <ConfirmDialog open danger title={fill(x.removeTitle, { name: target.titleEn || sectionName(target.key) })} confirmLabel={x.removeBlock} busy={remove.isPending} error={remove.isError ? errText(remove.error) : null} onClose={() => { remove.reset(); setRemoving(null); }} onConfirm={() => remove.mutate(target.id, { onSuccess: () => setRemoving(null) })}>
          <p>{x.removeBody}</p>
        </ConfirmDialog>
      )}
    </>
  );
}

