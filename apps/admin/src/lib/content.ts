/**
 * Phase 6C pure content logic (no React — runs under `node --test`). Every gate MIRRORS a rule enforced by the API
 * (programmes.service.ts, campaign.rules.ts, campaigns.service.ts, media.service.ts); the API stays authoritative and its
 * refusal is always shown. Reasons are i18n keys (t.content.gate.*).
 */
import { toUnits } from "./metrics.ts";

export interface Gate {
  allowed: boolean;
  reasons: string[];
}
const gate = (reasons: (string | false | null | undefined)[]): Gate => {
  const r = reasons.filter((x): x is string => !!x);
  return { allowed: r.length === 0, reasons: r };
};
const blank = (v: string | null | undefined) => !v || v.trim() === "";

// ───────────── provenance ─────────────

export type Provenance = "VERIFIED_SOURCE" | "PROPOSED" | "DEMO";
/** DEMO is never publishable or approvable in this admin (the API allows it only on staging with ALLOW_DEMO_PUBLISH). */
export const isDemo = (p: string) => p === "DEMO";

// ───────────── programmes (programmes.service.ts) ─────────────

export function programmePublishGate(p: { status: string; provenance: string; nameEn: string; shortDescEn: string | null; slug: string }, can: boolean): Gate {
  return gate([
    !can && "permission",
    p.status === "PUBLISHED" && "alreadyPublished",
    isDemo(p.provenance) && "demo",
    blank(p.nameEn) && "missingNameEn",
    blank(p.shortDescEn) && "missingShortDescEn",
    blank(p.slug) && "missingSlug",
  ]);
}

/** Unpublish is refused while PUBLISHED or PAUSED campaigns are linked (PROGRAMME_HAS_LIVE_CAMPAIGNS). */
export function programmeUnpublishGate(p: { status: string }, liveCampaigns: number | null, can: boolean): Gate {
  return gate([!can && "permission", p.status !== "PUBLISHED" && "notPublished", liveCampaigns === null ? "unknownLive" : liveCampaigns > 0 && "liveCampaigns"]);
}

/** Soft delete: not while published, never with (non-deleted) campaigns (PROGRAMME_IN_USE). */
export function programmeDeleteGate(p: { status: string; _count: { campaigns: number } }, can: boolean): Gate {
  return gate([!can && "permission", p.status === "PUBLISHED" && "unpublishFirst", p._count.campaigns > 0 && "hasCampaigns"]);
}

// ───────────── campaigns (campaign.rules.ts + campaigns.service.ts) ─────────────

export type CampaignAction = "submit" | "publish" | "pause" | "resume" | "complete" | "unpublish" | "archive";
export const CAMPAIGN_TRANSITIONS: Record<CampaignAction, { from: string[]; to: string }> = {
  submit: { from: ["DRAFT"], to: "IN_REVIEW" },
  publish: { from: ["DRAFT", "IN_REVIEW"], to: "PUBLISHED" },
  pause: { from: ["PUBLISHED"], to: "PAUSED" },
  resume: { from: ["PAUSED"], to: "PUBLISHED" },
  complete: { from: ["PUBLISHED", "PAUSED"], to: "COMPLETED" },
  unpublish: { from: ["IN_REVIEW", "PUBLISHED", "PAUSED"], to: "DRAFT" },
  archive: { from: ["DRAFT", "IN_REVIEW", "PAUSED", "COMPLETED"], to: "ARCHIVED" },
};
/** Permission each action needs (campaigns.module.ts). */
export const ACTION_PERMISSION: Record<CampaignAction, string> = {
  submit: "campaigns.manage",
  publish: "campaigns.publish",
  pause: "campaigns.publish",
  resume: "campaigns.publish",
  complete: "campaigns.publish",
  unpublish: "campaigns.publish",
  archive: "campaigns.publish",
};
export const availableActions = (status: string) => (Object.keys(CAMPAIGN_TRANSITIONS) as CampaignAction[]).filter((a) => CAMPAIGN_TRANSITIONS[a].from.includes(status));

export interface CampaignFacts {
  status: string;
  provenance: string;
  approvedAt: string | null;
  titleEn: string | null;
  summaryEn: string | null;
  programmeId: string | null;
  programme: { status: string } | null;
  startsAt: string | null;
  endsAt: string | null;
}

/** The publishing checklist: each item is a backend publish condition (campaignPublishBlockers) with its current state. */
export function publishChecklist(c: CampaignFacts, now = Date.now()) {
  const starts = c.startsAt ? Date.parse(c.startsAt) : null;
  const ends = c.endsAt ? Date.parse(c.endsAt) : null;
  return [
    { key: "approved", ok: !!c.approvedAt },
    { key: "notDemo", ok: !isDemo(c.provenance) },
    { key: "titleEn", ok: !blank(c.titleEn) },
    { key: "summaryEn", ok: !blank(c.summaryEn) },
    { key: "programme", ok: !!c.programmeId },
    { key: "programmePublished", ok: !!c.programmeId && c.programme?.status === "PUBLISHED" },
    { key: "dateOrder", ok: !(starts !== null && ends !== null && ends <= starts) },
    { key: "notEnded", ok: !(ends !== null && ends <= now) },
  ];
}

export function campaignActionGate(action: CampaignAction, c: CampaignFacts, can: (p: string) => boolean, now = Date.now()): Gate {
  const reasons: (string | false)[] = [!can(ACTION_PERMISSION[action]) && "permission", !CAMPAIGN_TRANSITIONS[action].from.includes(c.status) && "wrongState"];
  if (CAMPAIGN_TRANSITIONS[action].to === "PUBLISHED") for (const i of publishChecklist(c, now)) if (!i.ok) reasons.push(`check.${i.key}`);
  return gate(reasons);
}

/** approve: campaigns.approve, never DEMO, not ARCHIVED/COMPLETED. Re-approving overwrites the reference. */
export const approveGate = (c: { provenance: string; status: string }, can: boolean) =>
  gate([!can && "permission", isDemo(c.provenance) && "demo", ["ARCHIVED", "COMPLETED"].includes(c.status) && "closed"]);

/** revoke approval: only when approved and not live (PUBLISHED/PAUSED). */
export const revokeGate = (c: { approvedAt: string | null; status: string }, can: boolean) =>
  gate([!can && "permission", !c.approvedAt && "notApproved", ["PUBLISHED", "PAUSED"].includes(c.status) && "unpublishFirst"]);

/**
 * Open donations: campaigns.publish, PUBLISHED, and platform payments effective (`null` = unknown → blocked).
 * Close donations is always allowed with the permission (it never moves money).
 */
export function donationsGate(open: boolean, c: { status: string; donationsOpen: boolean }, paymentsEffective: boolean | null, can: boolean): Gate {
  if (!open) return gate([!can && "permission", !c.donationsOpen && "alreadyClosed"]);
  return gate([!can && "permission", c.donationsOpen && "alreadyOpen", c.status !== "PUBLISHED" && "notPublished", paymentsEffective === null ? "paymentsUnknown" : !paymentsEffective && "paymentsDisabled"]);
}

export const campaignDeleteGate = (c: { status: string }, can: boolean) => gate([!can && "permission", ["PUBLISHED", "PAUSED"].includes(c.status) && "unpublishFirst"]);
export const campaignEditGate = (c: { status: string }, can: boolean) => gate([!can && "permission", c.status === "ARCHIVED" && "archived"]);

/** Target/currency/provenance changes: blocked while live; on an approved campaign they reset the approval (API rule). */
export function financialChangeEffect(c: { status: string; approvedAt: string | null }, changed: { targetAmount?: boolean; currency?: boolean; provenance?: boolean }): "none" | "blockedLive" | "resetsApproval" {
  const any = !!(changed.targetAmount || changed.currency || changed.provenance);
  if (!any || !c.approvedAt) return "none";
  return ["PUBLISHED", "PAUSED"].includes(c.status) ? "blockedLive" : "resetsApproval";
}

// ───────────── hierarchy: Programme → Cause (Project) → Campaign ─────────────

export const causesOf = <T extends { programmeId: string | null }>(projects: T[], programmeId: string | null | undefined) => (programmeId ? projects.filter((p) => p.programmeId === programmeId) : []);

/** Mirrors PROJECT_PROGRAMME_MISMATCH: a Cause that belongs to a programme forces the campaign into that programme. */
export const hierarchyMismatch = (programmeId: string | null, project: { programmeId: string | null } | null | undefined) => !!project?.programmeId && project.programmeId !== programmeId;

/** Mirrors PROJECT_HAS_CAMPAIGNS: a Cause with campaigns cannot change programme. */
export const causeProgrammeLocked = (campaignCount: number) => campaignCount > 0;

// ───────────── money (exact decimals) ─────────────

const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;
/** Campaign amounts are Decimal(14,2): positive, ≤ 2 decimals. Returns an i18n error key or null. */
export function amountError(s: string, opts: { required?: boolean } = {}): string | null {
  const v = s.trim();
  if (!v) return opts.required ? "required" : null;
  if (!AMOUNT.test(v)) return "amountFormat";
  return toUnits(v) > 0n ? null : "amountPositive";
}
/**
 * The campaign DTO takes amounts as JSON numbers with ≤ 2 decimals. A validated string with ≤ 14 significant digits converts
 * exactly (doubles hold 15); it is never computed with — only transported.
 */
export const amountToApi = (s: string): number | null => (s.trim() ? Number(s.trim()) : null);
/** "1234.50" / 1234.5 → "1234.5" style input value without float formatting artefacts. */
export const amountToInput = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));
export function minMaxError(min: string, max: string): string | null {
  if (!min.trim() || !max.trim() || amountError(min) || amountError(max)) return null;
  return toUnits(min.trim()) > toUnits(max.trim()) ? "minAboveMax" : null;
}
/** "25, 50, 100" → [25, 50, 100] (sorted, unique, ≤ 8, each valid) or an error key. */
export function parseSuggested(s: string): { values: number[] } | { error: string } {
  const parts = s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
  if (parts.length > 8) return { error: "tooManyAmounts" };
  for (const p of parts) if (amountError(p)) return { error: "amountFormat" };
  const uniq = [...new Set(parts.map((p) => toUnits(p)))];
  if (uniq.length !== parts.length) return { error: "duplicateAmounts" };
  return { values: parts.map(Number).sort((a, b) => a - b) };
}

// ───────────── dates (datetime-local ↔ ISO, UTC) ─────────────

/** ISO → value for <input type="date"> (UTC day). */
export const isoToDay = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");
/** <input type="date"> value → ISO at UTC midnight, or null. */
export const dayToIso = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00.000Z` : null);
export const dateOrderError = (start: string, end: string) => (start && end && end <= start ? "endBeforeStart" : null);

// ───────────── codes / slugs (DTO patterns) ─────────────

export const codeError = (code: string, prefixMax: 40 | 60) => (new RegExp(`^[A-Z0-9-]{2,${prefixMax}}$`).test(code) ? null : "codeFormat");
export const slugError = (slug: string) => (!slug || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? null : "slugFormat");

// ───────────── forms ─────────────

/** Only fields whose value changed are sent (PATCH semantics; also avoids resetting approval by resending the target). */
export function diff<T extends Record<string, unknown>>(initial: T, current: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(current) as (keyof T)[]) if (JSON.stringify(initial[k]) !== JSON.stringify(current[k])) out[k] = current[k];
  return out;
}
/** Empty string → null for optional text columns the API accepts as nullable; otherwise trimmed text or undefined. */
export const textOrUndef = (s: string) => (s.trim() === "" ? undefined : s.trim());

// ───────────── media (media.service.ts) ─────────────

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** Client-side pre-check only (the API re-validates by magic bytes and re-encodes). */
export function uploadError(file: { type: string; size: number }): string | null {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) return "fileType";
  if (file.size > MAX_UPLOAD_BYTES) return "fileSize";
  if (file.size === 0) return "fileEmpty";
  return null;
}
/**
 * Preview source: uploaded (LOCAL) files go through the admin's same-origin /media/uploads proxy so media.read users can preview
 * assets that are not publicly servable yet; curated website images (WEB_STATIC) use their public URL.
 */
export const previewSrc = (m: { storageDriver: string; storageKey: string; url: string }) => (m.storageDriver === "LOCAL" ? `/media/${m.storageKey.replace(/^\/+/, "")}` : m.url);
export const mediaDeleteGate = (m: { storageDriver: string; usage: { total: number } }, can: boolean) =>
  gate([!can && "permission", m.usage.total > 0 && "mediaInUse", m.storageDriver === "WEB_STATIC" && "curated"]);

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
