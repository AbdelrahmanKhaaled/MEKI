/**
 * The donor access token returned once by POST /public/donations is kept ONLY in this tab's sessionStorage
 * (never in URLs, cookies, logs or localStorage). The provider return URL carries just the public reference.
 * It disappears when the tab closes; the return page then shows a generic message.
 */
const KEY = (reference: string) => `meki:donation:${reference}`;
const REF = /^DN-[0-9A-Z]{12}$/;

export function rememberDonation(reference: string, token: string) {
  try {
    if (REF.test(reference)) sessionStorage.setItem(KEY(reference), token);
  } catch {
    /* storage unavailable (private mode): the return page falls back to the generic message */
  }
}

export function recallDonationToken(reference: string): string | null {
  try {
    return REF.test(reference) ? sessionStorage.getItem(KEY(reference)) : null;
  } catch {
    return null;
  }
}

export const isDonationReference = (v: string | null | undefined): v is string => !!v && REF.test(v);
