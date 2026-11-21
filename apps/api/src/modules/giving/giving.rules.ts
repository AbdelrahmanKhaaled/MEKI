/**
 * Phase 14 — pure giving rules (no database, no I/O) so every gate is unit-testable.
 *
 * Three payment-intent flows, each with its OWN gate:
 *   GALA_TICKET     → EventBooking (EB-…, Phase 12 — unchanged)
 *   GALA_DONATION   → Donation (DN-…) on SDI's Gala donation form, only for the approved Gala project
 *   PROGRAM_DONATION / GENERAL_DONATION → Donation (DN-…) on SDI forms that are NOT authorized under the current agreement
 * Zakat is a separate gate on top of the flow gate. A donor's selection, a redirect or a return page is never payment evidence.
 */

export const DONATION_INTENT_TYPES = ['GALA_DONATION', 'PROGRAM_DONATION', 'GENERAL_DONATION'] as const;
export type DonationIntentType = (typeof DONATION_INTENT_TYPES)[number];
export const CLASSIFICATIONS = ['ZAKAT', 'SADAQAH'] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

/** Why a channel / option is not available. Stable codes for the website and admin (never free text). */
export type GateReason =
  | 'REFERENCE_QUESTION_NOT_CONFIRMED' // SDI has not confirmed the "MEKI Donation Reference" question on the form + export
  | 'NOT_AUTHORIZED_BY_SDI' // the fundraising scope is outside the written SDI agreement (*_GIVING_AUTHORIZED=false)
  | 'FORM_NOT_ENABLED' // no SDI-approved form URL / switch
  | 'DESIGNATION_NOT_CONFIRMED' // SDI has not confirmed how a programme designation is captured and reported
  | 'NO_FORM_FOR_PROGRAMME' // SDI supplied no form for this programme
  | 'GALA_GIVING_NOT_AUTHORIZED' // Gala project / public fundraising / closing date not approved, or campaign closed
  | 'ZAKAT_NOT_ENABLED' // ZAKAT_GIVING_ENABLED=false
  | 'DONATION_TYPE_NOT_CONFIRMED' // SDI has not confirmed the Donation Type question + export
  | 'NOT_ZAKAT_ELIGIBLE' // no approved Zakat-eligibility decision for the target (the default)
  | 'NO_ZAKAT_TARGET' // general (undesignated) giving has no approved Zakat fund
  | 'GALA_ONLY_MODE_OFF'; // GIVING_GALA_ONLY_MODE=false

/** Version of the Gala-only destination disclosure the donor accepts (stored with the gift; bump when the wording changes). */
export const GALA_ONLY_DISCLOSURE_VERSION = 'gala-only-2026-11-22';

/**
 * Phase 14B — Gala-only launch mode: a program / general "Give" may be fulfilled as a Gala donation ONLY when the mode is on AND
 * the Gala donation-intent gate is open — and only with the donor's explicit acceptance (enforced at intent creation).
 */
export function galaOnlyGate(modeOn: boolean, gala: Gate): { active: boolean; reason: GateReason | null } {
  if (!modeOn) return { active: false, reason: 'GALA_ONLY_MODE_OFF' };
  if (!gala.available) return { active: false, reason: gala.reason };
  return { active: true, reason: null };
}

export type GivingFlags = {
  referenceConfirmed: boolean;
  typeConfirmed: boolean;
  zakatEnabled: boolean;
  generalAuthorized: boolean;
  sdiGeneralEnabled: boolean;
  generalFormUrl: string | null;
  programmeAuthorized: boolean;
  sdiProgrammeEnabled: boolean;
  designationConfirmed: boolean;
  programmeFormUrls: Record<string, string>;
};

export type Gate = { available: boolean; reason: GateReason | null; formUrl: string | null };
const closed = (reason: GateReason): Gate => ({ available: false, reason, formUrl: null });

/** General (undesignated, non-Gala) giving. Never routed to the Gala-only form. */
export function generalGate(f: GivingFlags): Gate {
  if (!f.generalAuthorized) return closed('NOT_AUTHORIZED_BY_SDI');
  if (!f.sdiGeneralEnabled || !f.generalFormUrl) return closed('FORM_NOT_ENABLED');
  if (!f.referenceConfirmed) return closed('REFERENCE_QUESTION_NOT_CONFIRMED');
  return { available: true, reason: null, formUrl: f.generalFormUrl };
}

/** Programme-restricted giving: needs the agreement, SDI's designation confirmation and SDI's OWN form for that programme. */
export function programmeGate(f: GivingFlags, slug: string): Gate {
  if (!f.programmeAuthorized) return closed('NOT_AUTHORIZED_BY_SDI');
  if (!f.sdiProgrammeEnabled) return closed('FORM_NOT_ENABLED');
  if (!f.designationConfirmed) return closed('DESIGNATION_NOT_CONFIRMED');
  const url = f.programmeFormUrls[slug];
  if (!url) return closed('NO_FORM_FOR_PROGRAMME');
  if (!f.referenceConfirmed) return closed('REFERENCE_QUESTION_NOT_CONFIRMED');
  return { available: true, reason: null, formUrl: url };
}

/** Gala donation intent: the Phase 12B Gala giving state (approved project + open campaign + SDI switch) AND the reference question. */
export function galaGate(f: Pick<GivingFlags, 'referenceConfirmed'>, gala: { givingAvailable: boolean; formUrl: string | null }): Gate {
  if (!gala.givingAvailable || !gala.formUrl) return closed('GALA_GIVING_NOT_AUTHORIZED');
  if (!f.referenceConfirmed) return closed('REFERENCE_QUESTION_NOT_CONFIRMED');
  return { available: true, reason: null, formUrl: gala.formUrl };
}

/**
 * Whether ZAKAT may be selected for a target. `eligible` is the EFFECTIVE approved decision for the programme / project /
 * campaign (false by default). SADAQAH is always selectable on an available channel.
 */
export function zakatGate(f: Pick<GivingFlags, 'zakatEnabled' | 'typeConfirmed'>, target: { eligible: boolean } | null): { allowed: boolean; reason: GateReason | null } {
  if (!f.zakatEnabled) return { allowed: false, reason: 'ZAKAT_NOT_ENABLED' };
  if (!f.typeConfirmed) return { allowed: false, reason: 'DONATION_TYPE_NOT_CONFIRMED' };
  if (!target) return { allowed: false, reason: 'NO_ZAKAT_TARGET' };
  if (!target.eligible) return { allowed: false, reason: 'NOT_ZAKAT_ELIGIBLE' };
  return { allowed: true, reason: null };
}

/** Effective Zakat eligibility from a target's decision history: the latest APPROVED decision, with both references present. */
export function effectiveZakat(decisions: { status: string; eligible: boolean; decidedAt: Date | null; authorityReference: string | null; sdiAcceptanceReference: string | null }[]): boolean {
  const approved = decisions.filter((d) => d.status === 'APPROVED' && d.decidedAt).sort((a, b) => b.decidedAt!.getTime() - a.decidedAt!.getTime())[0];
  return !!approved && approved.eligible && !!approved.authorityReference?.trim() && !!approved.sdiAcceptanceReference?.trim();
}

// ───────────── references ─────────────

export const DONATION_REF = /^DN-[0-9A-Z]{12}$/;

/** Normalises a donation reference as typed by a donor on SDI's form ("dn 7k3q…", "DN7K3Q…", en dash…). Null when not a DN reference. */
export function normaliseDonationReference(v: string): string | null {
  const s = v.trim().toUpperCase().replace(/[‐-―−]/g, '-').replace(/\s+/g, '');
  const withDash = /^DN[0-9A-Z]{12}$/.test(s) ? `DN-${s.slice(2)}` : s;
  return DONATION_REF.test(withDash) ? withDash : null;
}

/** Default Donation Type answer mapping (the importer reviews and can change it; unknown values always go to review). */
export const DEFAULT_DONATION_TYPE_MAP: Record<string, Classification> = { zakat: 'ZAKAT', zakah: 'ZAKAT', 'زكاة': 'ZAKAT', sadaqah: 'SADAQAH', sadaqa: 'SADAQAH', sadaka: 'SADAQAH', 'صدقة': 'SADAQAH' };

/** Label SDI's form shows for each classification (what the donor selects on Zeffy). */
export const CLASSIFICATION_ANSWER: Record<Classification, string> = { ZAKAT: 'Zakat', SADAQAH: 'Sadaqah' };

/**
 * Designation key used to compare the designation SDI reports with the donor's intention:
 *   GENERAL · GALA_PROJECT · programme:<slug>
 */
export function intendedDesignationKey(intentType: DonationIntentType, programmeSlug: string | null): string {
  if (intentType === 'GALA_DONATION') return 'GALA_PROJECT';
  if (intentType === 'PROGRAM_DONATION') return `programme:${programmeSlug ?? ''}`;
  return 'GENERAL';
}

/** Report type (SDI form) that may carry each intent type. A programme gift reported on the Gala form is a review item. */
export const REPORT_TYPE_FOR_INTENT: Record<DonationIntentType, 'GALA_DONATIONS' | 'PROGRAMME_DONATIONS' | 'GENERAL_DONATIONS'> = {
  GALA_DONATION: 'GALA_DONATIONS',
  PROGRAM_DONATION: 'PROGRAMME_DONATIONS',
  GENERAL_DONATION: 'GENERAL_DONATIONS',
};

/**
 * The four states the website must keep apart:
 *   INTENDED  — the donor's choice recorded on MEKI (nothing paid)
 *   PENDING_EXTERNAL — awaiting SDI's report (includes abandoned checkouts and returns from Zeffy)
 *   VERIFIED  — an approved SDI report shows a matching completed payment
 *   ALLOCATED — a verified gift whose fund allocation an administrator authorized
 */
export function donorStage(d: { reconciliationStatus: string | null; paymentStatus: string; allocationStatus: string | null }): 'PENDING_EXTERNAL' | 'NEEDS_REVIEW' | 'NOT_COMPLETED' | 'VERIFIED' | 'ALLOCATED' {
  if (d.reconciliationStatus === 'VERIFIED' && d.paymentStatus === 'PAID') return d.allocationStatus === 'AUTHORIZED' ? 'ALLOCATED' : 'VERIFIED';
  if (d.reconciliationStatus === 'NEEDS_REVIEW') return 'NEEDS_REVIEW';
  if (d.reconciliationStatus === 'REPORTED_UNPAID') return 'NOT_COMPLETED';
  return 'PENDING_EXTERNAL';
}
