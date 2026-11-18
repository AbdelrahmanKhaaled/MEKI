"use client";

/**
 * Site settings (Phase 6D): one record (GET/PATCH /admin/settings/site). Only changed fields are sent; the form is reset to
 * the record the server returns. Values are never invented: empty fields stay empty until MEKI supplies them.
 */
import Link from "next/link";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { ErrorState, WidgetSkeleton } from "@/components/common/States";
import { CoverField } from "@/components/content/media";
import { Bilingual, SaveBar, Select, TextInput, useContentError } from "@/components/content/ui";
import { DateText, Notice, PageHeader, Tabs } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { FinancePage, useHref } from "@/features/finance/FinancePage";
import { useCmsMutation, useSite } from "@/hooks/useCmsData";
import { useForm } from "@/hooks/useForm";
import { HTTPS_URL, siteErrors } from "@/lib/cms";
import { SOCIAL_NETWORKS, type SiteSettings } from "@/lib/cms-schemas";
import type { Media } from "@/lib/content-schemas";
import * as svc from "@/services/cms";

type Tab = "general" | "contact" | "social" | "seo" | "branding";
const TABS: Tab[] = ["general", "contact", "social", "seo", "branding"];
const TEXT = [
  "orgNameEn", "orgNameAr", "legalNameEn", "legalNameAr", "taglineEn", "taglineAr", "legacyLineEn", "legacyLineAr", "logoPrimaryUrl", "logoInverseUrl", "logoIconUrl",
  "contactEmail", "contactPhone", "addressEn", "addressAr", "defaultLocale", "footerTextEn", "footerTextAr", "footerNoteEn", "footerNoteAr", "copyrightEn", "copyrightAr",
  "seoTitleEn", "seoTitleAr", "seoDescriptionEn", "seoDescriptionAr",
] as const;
type TextKey = (typeof TEXT)[number];
type Form = Record<TextKey, string> & { socialLinks: { network: string; url: string }[]; og: Media | null };

const toForm = (s: SiteSettings): Form => {
  const f = { socialLinks: s.socialLinks ?? [], og: s.ogImage as Media | null } as Form;
  for (const k of TEXT) f[k] = (s[k] as string | null) ?? "";
  return f;
};

export function SiteSettingsPage() {
  const { t } = useLocale();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.website }, { label: t.cms.settings.title }]} anyOf={["settings.read"]}>
      <Loader />
    </FinancePage>
  );
}

function Loader() {
  const q = useSite();
  if (q.isPending) return <WidgetSkeleton rows={6} minH="min-h-80" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} minH="min-h-80" />;
  return <Editor site={q.data} />;
}

function Editor({ site }: { site: SiteSettings }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const href = useHref();
  const errText = useContentError();
  const x = t.cms.settings;
  const e = t.cms.errors;
  const readOnly = !can("settings.manage");
  const form = useForm<Form>(toForm(site));
  const v = form.values;
  const [tab, setTab] = useState<Tab>("general");
  const [message, setMessage] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState(site.updatedAt);
  const raw = siteErrors(v);
  const errors = {
    orgNameEn: raw.orgNameEn && e.required, contactEmail: raw.contactEmail && x.emailError, contactPhone: raw.contactPhone && x.phoneError,
    logoPrimaryUrl: raw.logoPrimaryUrl && x.logoError, logoInverseUrl: raw.logoInverseUrl && x.logoError, logoIconUrl: raw.logoIconUrl && x.logoError, socialLinks: raw.socialLinks && x.socialError,
  };
  const invalid = Object.values(raw).some(Boolean);
  const save = useCmsMutation(() => {
    const b: Record<string, unknown> = {};
    for (const k of form.dirty) {
      if (k === "og") b.ogImageId = v.og?.id ?? null;
      else if (k === "socialLinks") b.socialLinks = v.socialLinks.map((l) => ({ network: l.network, url: l.url.trim() }));
      else if (k === "contactEmail" || k === "contactPhone") b[k] = v[k].trim() || null;
      else if ((k === "logoPrimaryUrl" || k === "logoInverseUrl" || k === "logoIconUrl") && !v[k].trim()) continue; // the API keeps the stored brand file
      else b[k] = v[k].trim();
    }
    return svc.updateSite(b);
  });
  const setLink = (i: number, patch: Partial<{ network: string; url: string }>) => form.set("socialLinks", v.socialLinks.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const panel = (k: Tab, children: React.ReactNode) => (
    <div role="tabpanel" id={`panel-${k}`} aria-labelledby={`tab-${k}`} hidden={tab !== k}>
      <Card labelledBy={`ss-${k}`}>
        <CardHeader id={`ss-${k}`} title={x.tabs[k]} />
        <div className="space-y-5">{children}</div>
      </Card>
    </div>
  );
  const dirtyIn = (k: Tab) => form.dirty.some((d) => TAB_OF[d] === k);

  return (
    <>
      <PageHeader title={x.title} subtitle={x.subtitle} />
      {readOnly && <Notice>{x.readOnly}</Notice>}
      <Notice><p>{x.usedOnSite}</p></Notice>
      <Tabs label={x.title} active={tab} onChange={setTab} tabs={TABS.map((k) => ({ key: k, label: dirtyIn(k) ? `${x.tabs[k]} •` : x.tabs[k] }))} />

      {panel("general", <>
        <Bilingual label={x.orgName} en={v.orgNameEn} ar={v.orgNameAr} onEn={(s) => form.set("orgNameEn", s)} onAr={(s) => form.set("orgNameAr", s)} requiredEn errorEn={errors.orgNameEn || null} disabled={readOnly} maxLength={160} />
        <Bilingual label={x.legalName} en={v.legalNameEn} ar={v.legalNameAr} onEn={(s) => form.set("legalNameEn", s)} onAr={(s) => form.set("legalNameAr", s)} disabled={readOnly} maxLength={255} />
        <Notice tone="gold"><p>{x.approvedWording}</p></Notice>
        <Bilingual label={x.tagline} en={v.taglineEn} ar={v.taglineAr} onEn={(s) => form.set("taglineEn", s)} onAr={(s) => form.set("taglineAr", s)} disabled={readOnly} maxLength={255} />
        <Bilingual label={x.legacyLine} en={v.legacyLineEn} ar={v.legacyLineAr} onEn={(s) => form.set("legacyLineEn", s)} onAr={(s) => form.set("legacyLineAr", s)} disabled={readOnly} maxLength={255} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label={x.defaultLocale} value={v.defaultLocale} onChange={(s) => form.set("defaultLocale", s)} disabled={readOnly} options={site.supportedLocales.map((l) => ({ value: l, label: l === "ar" ? "العربية (ar)" : l === "en" ? "English (en)" : l }))} />
          <TextInput label={x.supportedLocales} value={site.supportedLocales.join(", ")} onChange={() => undefined} disabled dir="ltr" />
        </div>
        <Bilingual label={x.footerText} en={v.footerTextEn} ar={v.footerTextAr} onEn={(s) => form.set("footerTextEn", s)} onAr={(s) => form.set("footerTextAr", s)} multiline rows={3} disabled={readOnly} maxLength={5000} />
        <Bilingual label={x.footerNote} en={v.footerNoteEn} ar={v.footerNoteAr} onEn={(s) => form.set("footerNoteEn", s)} onAr={(s) => form.set("footerNoteAr", s)} disabled={readOnly} maxLength={500} />
        <Bilingual label={x.copyright} en={v.copyrightEn} ar={v.copyrightAr} onEn={(s) => form.set("copyrightEn", s)} onAr={(s) => form.set("copyrightAr", s)} disabled={readOnly} maxLength={255} />
        <p className="text-sm text-muted">{x.missionNote} <Link href={href("/homepage")} className="font-bold text-meki-green-dark underline">{t.cms.homepage.title}</Link></p>
      </>)}

      {panel("contact", <>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label={x.email} type="email" value={v.contactEmail} onChange={(s) => form.set("contactEmail", s)} error={errors.contactEmail || null} disabled={readOnly} dir="ltr" maxLength={191} />
          <TextInput label={x.phone} value={v.contactPhone} onChange={(s) => form.set("contactPhone", s)} error={errors.contactPhone || null} hint={x.phoneHint} disabled={readOnly} dir="ltr" maxLength={40} />
        </div>
        <Bilingual label={x.address} en={v.addressEn} ar={v.addressAr} onEn={(s) => form.set("addressEn", s)} onAr={(s) => form.set("addressAr", s)} multiline rows={3} disabled={readOnly} maxLength={2000} />
        <p className="text-xs text-muted">{x.addressHint}</p>
      </>)}

      {panel("social", <>
        {v.socialLinks.length === 0 && <p className="text-sm text-muted">{x.noSocial}</p>}
        <ol className="space-y-3" data-testid="social-links">
          {v.socialLinks.map((l, i) => (
            <li key={i} className="grid items-end gap-3 rounded-xl border border-line p-3 sm:grid-cols-[12rem_1fr_auto]">
              <Select label={x.network} value={l.network} onChange={(s) => setLink(i, { network: s })} disabled={readOnly} options={SOCIAL_NETWORKS.map((n) => ({ value: n, label: n }))} />
              <TextInput label={x.url} value={l.url} onChange={(s) => setLink(i, { url: s })} error={HTTPS_URL.test(l.url.trim()) ? null : x.socialError} disabled={readOnly} dir="ltr" maxLength={500} placeholder="https://" />
              {!readOnly && <button type="button" className="btn-admin btn-ghost text-danger" onClick={() => form.set("socialLinks", v.socialLinks.filter((_, j) => j !== i))}><Trash2 className="size-4" aria-hidden="true" /> {x.removeSocial}</button>}
            </li>
          ))}
        </ol>
        {!readOnly && v.socialLinks.length < 12 && <button type="button" className="btn-admin btn-ghost" onClick={() => form.set("socialLinks", [...v.socialLinks, { network: "facebook", url: "" }])}><Plus className="size-4" aria-hidden="true" /> {x.addSocial}</button>}
      </>)}

      {panel("seo", <>
        <Bilingual label={x.seoTitle} en={v.seoTitleEn} ar={v.seoTitleAr} onEn={(s) => form.set("seoTitleEn", s)} onAr={(s) => form.set("seoTitleAr", s)} disabled={readOnly} maxLength={255} />
        <Bilingual label={x.seoDescription} en={v.seoDescriptionEn} ar={v.seoDescriptionAr} onEn={(s) => form.set("seoDescriptionEn", s)} onAr={(s) => form.set("seoDescriptionAr", s)} multiline rows={3} disabled={readOnly} maxLength={1000} />
        <div>
          <p className="mb-2 text-sm font-bold text-ink">{x.ogImage}</p>
          <CoverField media={v.og} onChange={(m) => form.set("og", m)} disabled={readOnly || !can("media.read")} />
        </div>
      </>)}

      {panel("branding", <>
        <Notice tone="gold"><p>{x.logoHint}</p></Notice>
        <TextInput label={x.logoPrimary} value={v.logoPrimaryUrl} onChange={(s) => form.set("logoPrimaryUrl", s)} error={errors.logoPrimaryUrl || null} disabled={readOnly} dir="ltr" maxLength={500} />
        <TextInput label={x.logoInverse} value={v.logoInverseUrl} onChange={(s) => form.set("logoInverseUrl", s)} error={errors.logoInverseUrl || null} disabled={readOnly} dir="ltr" maxLength={500} />
        <TextInput label={x.logoIcon} value={v.logoIconUrl} onChange={(s) => form.set("logoIconUrl", s)} error={errors.logoIconUrl || null} disabled={readOnly} dir="ltr" maxLength={500} />
      </>)}

      <Notice><p>{x.notSupported}</p></Notice>
      <p className="text-xs text-muted">{x.updated}:<DateText value={updatedAt} /></p>

      {!readOnly && (
        <SaveBar
          dirty={form.dirty.length}
          busy={save.isPending}
          onDiscard={form.discard}
          disabled={invalid}
          message={message}
          error={save.isError ? errText(save.error) : invalid && form.dirty.length ? x.fixErrors : null}
          onSave={() => { setMessage(null); save.mutate(undefined, { onSuccess: (s) => { form.reset(toForm(s)); setUpdatedAt(s.updatedAt); setMessage(x.saved); } }); }}
        />
      )}
    </>
  );
}

const TAB_OF: Record<string, Tab> = {
  orgNameEn: "general", orgNameAr: "general", legalNameEn: "general", legalNameAr: "general", taglineEn: "general", taglineAr: "general", legacyLineEn: "general", legacyLineAr: "general",
  defaultLocale: "general", footerTextEn: "general", footerTextAr: "general", footerNoteEn: "general", footerNoteAr: "general", copyrightEn: "general", copyrightAr: "general",
  contactEmail: "contact", contactPhone: "contact", addressEn: "contact", addressAr: "contact", socialLinks: "social",
  seoTitleEn: "seo", seoTitleAr: "seo", seoDescriptionEn: "seo", seoDescriptionAr: "seo", og: "seo", logoPrimaryUrl: "branding", logoInverseUrl: "branding", logoIconUrl: "branding",
};
