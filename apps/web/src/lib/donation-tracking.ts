const ads = "AW-11325728548";
const sent = new Set<string>();
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
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

// Only called with the reference from an authenticated, verified donation status response.
export function trackConfirmedDonation(reference: string) {
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
  window.gtag!("event", "conversion", {
    send_to: ads + "/Hbz7CN6amN0YEKTOw5gq",
    value: 1,
    currency: "EGP",
    transaction_id: reference,
  });
}
