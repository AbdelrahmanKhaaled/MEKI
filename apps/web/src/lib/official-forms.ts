/**
 * The OFFICIAL hosted Gala forms owned by SDI (MEKI's fiscal sponsor), exactly as supplied by the client.
 * Pure module (no React / no path aliases) so it runs under `node --test`.
 *
 * Release rule: the ticket/donation handoff is OFF unless its public build-time switch is exactly "true"
 * (NEXT_PUBLIC_GALA_TICKET_FORM_HANDOFF / NEXT_PUBLIC_GALA_DONATION_FORM_HANDOFF). Turning a switch on is a release decision
 * (SDI has opened the form for collection); it never marks anything as paid. Payment, tickets and receipts come from SDI's provider.
 * The MEKI reference-first flows (EB-/DN-) stay preferred whenever the API reports them open.
 */
export const OFFICIAL_GALA_FORMS = {
  ticket: "https://givebutter.com/c/SDI-Misr-El-Kheir",
  sponsor: "https://givebutter.com/c/misr-el-kheir-foundation-spring-of-dignity-gala-new-york-sponsors",
  donation: "https://www.zeffy.com/en-US/donation-form/misr-el-kheir-foundation-gala-new-york-donation",
} as const;

export type OfficialFormKind = keyof typeof OFFICIAL_GALA_FORMS;

export const OFFICIAL_FORM_HOSTS = ["givebutter.com", "www.givebutter.com", "www.zeffy.com"] as const;

/** True only for an https URL on an approved official form host with no credentials, query, fragment or port (defence against a bad edit). */
export function isOfficialFormUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (
      u.protocol === "https:" &&
      (OFFICIAL_FORM_HOSTS as readonly string[]).includes(u.hostname) &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      u.port === ""
    );
  } catch {
    return false;
  }
}

/** Backwards-compatible alias kept for existing callers/tests. */
export const isOfficialZeffyUrl = isOfficialFormUrl;

/** The official form URL when its release switch is exactly "true"; otherwise null (no link is rendered). */
export function officialFormUrl(kind: OfficialFormKind, releaseSwitch: string | undefined): string | null {
  if (releaseSwitch !== "true") return null;
  const url = OFFICIAL_GALA_FORMS[kind];
  return isOfficialFormUrl(url) ? url : null;
}

/** Literal process.env reads so Next.js inlines them at build time (dynamic keys are not inlined). */
export const ticketHandoffUrl = () => officialFormUrl("ticket", process.env.NEXT_PUBLIC_GALA_TICKET_FORM_HANDOFF);
export const donationHandoffUrl = () => officialFormUrl("donation", process.env.NEXT_PUBLIC_GALA_DONATION_FORM_HANDOFF);
export const sponsorFormUrl = () => (isOfficialFormUrl(OFFICIAL_GALA_FORMS.sponsor) ? OFFICIAL_GALA_FORMS.sponsor : null);
