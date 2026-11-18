"use client";

import { useState } from "react";
import { UploadCloud } from "lucide-react";
import { useLocale } from "@/components/common/Providers";
import { EmptyState, ErrorState, WidgetSkeleton } from "@/components/common/States";
import { SectionEditor, useSectionName } from "@/components/cms/SectionEditor";
import { ConfirmDialog, Notice, PageHeader } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { FinancePage } from "@/features/finance/FinancePage";
import { useCmsMutation, usePage } from "@/hooks/useCmsData";
import { ApiError } from "@/lib/api";
import { HOMEPAGE, isDirtySection, sectionDef } from "@/lib/cms";
import { fill } from "@/lib/i18n";
import * as svc from "@/services/cms";
import { PageSettingsCard } from "../PageSettingsCard";

/**
 * Homepage CMS: the "home" page's sections, edited with exactly the fields the public homepage reads (lib/cms HOMEPAGE).
 * Order is fixed by the website layout; sections are published one by one or all at once.
 */
export function HomepagePage() {
  const { t } = useLocale();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.website }, { label: t.cms.homepage.title }]} anyOf={["content.read"]}>
      <Homepage />
    </FinancePage>
  );
}

function Homepage() {
  const { t } = useLocale();
  const { can } = useAuth();
  const sectionName = useSectionName();
  const q = usePage("home");
  const x = t.cms.homepage;
  const c = t.cms.common;
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const publishAll = useCmsMutation(async (ids: string[]) => {
    let ok = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await svc.setSectionStatus(id, true);
        ok++;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) throw e;
        failed++;
      }
    }
    return { ok, failed };
  });
  if (q.isPending) return <WidgetSkeleton rows={8} minH="min-h-96" />;
  if (q.isError) return q.error instanceof ApiError && q.error.status === 404 ? <EmptyState text={x.notFound} minH="min-h-80" /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} minH="min-h-80" />;
  const page = q.data;
  const byKey = new Map(page.sections.map((s) => [s.key, s]));
  const ordered = HOMEPAGE.filter((d) => byKey.has(d.key));
  const unknown = page.sections.filter((s) => !sectionDef(s.key));
  const dirty = page.sections.filter((s) => isDirtySection(s) && sectionDef(s.key));
  return (
    <>
      <PageHeader
        title={x.title}
        subtitle={x.subtitle}
        right={
          <button type="button" className="btn-admin btn-primary" disabled={!can("content.publish") || dirty.length === 0} onClick={() => setConfirm(true)}>
            <UploadCloud className="size-4" aria-hidden="true" /> {c.publishAll}
          </button>
        }
      />
      <Notice>
        <p>{c.publicNote}</p>
        <p className="text-xs">{dirty.length ? fill(x.sectionsDirty, { n: dirty.length }) : x.allLive} {c.fixedOrder}</p>
      </Notice>
      {result && <p className="rounded-lg bg-ok/10 p-3 text-sm text-ok" role="status">{result}</p>}
      <div className="grid gap-4 xl:grid-cols-12">
        <nav aria-label={x.jump} className="hidden xl:col-span-3 xl:block">
          <ol className="card sticky top-20 space-y-1 p-3 text-sm">
            {ordered.map((d) => {
              const s = byKey.get(d.key)!;
              return (
                <li key={d.key}>
                  <a href={`#section-${d.key}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-bg">
                    <span className="truncate">{sectionName(d.key)}</span>
                    {isDirtySection(s) && <span className="size-2 shrink-0 rounded-full bg-warn" aria-label={c.unpublishedChanges} />}
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="min-w-0 space-y-4 xl:col-span-9">
          {ordered.map((d) => (
            <SectionEditor key={d.key} anchorId={`section-${d.key}`} section={byKey.get(d.key)!} def={d} canManage={can("content.manage")} canPublish={can("content.publish")} />
          ))}
          {unknown.length > 0 && <Notice>{c.unknownLabels}: <bdi dir="ltr">{unknown.map((s) => s.key).join(", ")}</bdi></Notice>}
          <PageSettingsCard page={page} />
        </div>
      </div>
      {confirm && (
        <ConfirmDialog
          open
          title={fill(c.publishAllTitle, { n: dirty.length })}
          confirmLabel={c.publishAll}
          busy={publishAll.isPending}
          error={publishAll.isError ? String((publishAll.error as Error).message) : null}
          onClose={() => { publishAll.reset(); setConfirm(false); }}
          onConfirm={() => publishAll.mutate(dirty.map((s) => s.id), { onSuccess: (r) => { setConfirm(false); setResult(fill(c.publishAllResult, r)); } })}
        >
          <p>{c.publishAllBody}</p>
          <ul className="list-disc ps-5 text-xs">{dirty.map((s) => <li key={s.id}>{sectionName(s.key)}</li>)}</ul>
        </ConfirmDialog>
      )}
    </>
  );
}
