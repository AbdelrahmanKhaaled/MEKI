const ads = "AW-11325728548";
const ADS_LABEL = "Hbz7CN6amN0YEKTOw5gq";
const sent = new Set<string>();
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    ttq?: { track: (event: string, params?: Record<string, unknown>, options?: Record<string, unknown>) => void };
    mekiPagePixels?: (path: string) => void;
  }
}

let configured = false;
export function initializeAds() {
  if (configured) return;
  configured = true;
  window.dataLayer ??= [];
  window.gtag ??= function () {
    // Google consumes the arguments object from its standard command queue.
    window.dataLayer!.push(arguments); // eslint-disable-line prefer-rest-params
  };
  window.gtag("js", new Date());
  window.gtag("config", ads);
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=" + ads;
  document.head.appendChild(script);
}

/** The donation's REAL value and currency, or null when the server did not supply a usable pair (then no value is reported, never a guess). */
export function conversionValue(amount: string | number | null | undefined, currency: string | null | undefined): { value: number; currency: string } | null {
  const value = typeof amount === "number" ? amount : typeof amount === "string" && /^\d+(\.\d{1,2})?$/.test(amount.trim()) ? Number(amount.trim()) : NaN;
  const cur = typeof currency === "string" ? currency.trim().toUpperCase() : "";
  return Number.isFinite(value) && value > 0 && /^[A-Z]{3}$/.test(cur) ? { value, currency: cur } : null;
}

/**
 * Called ONLY with data from an authenticated, verified donation status response (the callers check confirmed/PAID/non-test or
 * VERIFIED/ALLOCATED first). One call → one conversion on each platform, once per donation reference, even across refreshes:
 *   Google Ads  event "conversion" (AW-…/label) with the real amount + currency and transaction_id = the donation reference
 *   Meta        standard event "Donate" (value, currency) with eventID = the reference (lets Meta deduplicate with any server event)
 *   TikTok      standard event "CompletePayment" (value, currency) with event_id = the reference (TikTok has no "Donate" event)
 * Nothing is sent for failed, pending, cancelled, unverified or test donations because those callers never reach this function.
 */
export function trackConfirmedDonation(reference: string, donation?: { amount?: string | number | null; currency?: string | null }) {
  if (!reference || sent.has(reference)) return;
  const key = "meki:ads:donation:" + reference;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {
    // Google's transaction_id also deduplicates when browser storage is unavailable.
  }
  sent.add(reference);
  initializeAds();
  const v = conversionValue(donation?.amount, donation?.currency);
  const money = v ? { value: v.value, currency: v.currency } : {};
  window.gtag!("event", "conversion", { send_to: ads + "/" + ADS_LABEL, ...money, transaction_id: reference });
  // tracking.js (Meta/TikTok base code) loads after interaction: wait briefly for it instead of losing the (already de-duplicated) event.
  const fire = (tries: number) => {
    if (window.fbq && window.ttq?.track) {
      window.fbq("track", "Donate", money, { eventID: reference });
      window.ttq.track("CompletePayment", money, { event_id: reference });
    } else if (tries > 0) {
      setTimeout(() => fire(tries - 1), 250);
    }
  };
  fire(40); // up to ~10 s
}
