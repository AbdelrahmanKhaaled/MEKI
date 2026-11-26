// Donation conversions (Google Ads + Meta + TikTok): real value/currency, one event per donation reference, nothing without a reference.
import assert from "node:assert/strict";
import test from "node:test";

function env({ storage = true } = {}) {
  const store = new Map();
  const scripts = [];
  globalThis.window = { fbqCalls: [], ttqCalls: [] };
  globalThis.document = { createElement: () => ({}), head: { appendChild: (s) => scripts.push(s) } };
  if (storage) globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  else globalThis.localStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  window.fbq = (...a) => window.fbqCalls.push(a);
  window.ttq = { track: (...a) => window.ttqCalls.push(a) };
  return { store, scripts };
}
const load = async () => import("../src/lib/donation-tracking.ts?" + Math.random()); // fresh module state per test
const conversions = () => window.dataLayer.map((a) => Array.from(a)).filter((a) => a[0] === "event" && a[1] === "conversion");

test("conversionValue accepts only a positive decimal amount and a 3-letter currency", async () => {
  const { conversionValue } = await load();
  assert.deepEqual(conversionValue("50.00", "usd"), { value: 50, currency: "USD" });
  assert.deepEqual(conversionValue(12.5, "EGP"), { value: 12.5, currency: "EGP" });
  for (const [a, c] of [["0", "USD"], ["-5", "USD"], ["abc", "USD"], ["50.123", "USD"], ["50", ""], ["50", "US"], [null, "USD"], ["50", null], ["1e3", "USD"]]) assert.equal(conversionValue(a, c), null, `${a}/${c}`);
});

test("a verified donation fires Google (real amount/currency/transaction_id), Meta Donate and TikTok CompletePayment — once each", async () => {
  env();
  const { trackConfirmedDonation } = await load();
  trackConfirmedDonation("DN-ABCDEFGHJKLM", { amount: "75.00", currency: "USD" });
  await new Promise((r) => setTimeout(r, 20));
  const c = conversions();
  assert.equal(c.length, 1);
  assert.deepEqual(c[0][2], { send_to: "AW-11325728548/Hbz7CN6amN0YEKTOw5gq", value: 75, currency: "USD", transaction_id: "DN-ABCDEFGHJKLM" });
  assert.deepEqual(window.fbqCalls, [["track", "Donate", { value: 75, currency: "USD" }, { eventID: "DN-ABCDEFGHJKLM" }]]);
  assert.deepEqual(window.ttqCalls, [["CompletePayment", { value: 75, currency: "USD" }, { event_id: "DN-ABCDEFGHJKLM" }]]);
});

test("duplicate callbacks (same reference) never fire again — in memory and across reloads (localStorage)", async () => {
  const { store } = env();
  let m = await load();
  m.trackConfirmedDonation("DN-AAAAAAAAAAAA", { amount: "10", currency: "USD" });
  m.trackConfirmedDonation("DN-AAAAAAAAAAAA", { amount: "10", currency: "USD" });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(conversions().length, 1);
  assert.equal(window.fbqCalls.length, 1);
  // "page reload": fresh module + fresh window, same localStorage
  const prev = store;
  env();
  for (const [k, v] of prev) localStorage.setItem(k, v);
  m = await load();
  m.trackConfirmedDonation("DN-AAAAAAAAAAAA", { amount: "10", currency: "USD" });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal((window.dataLayer ?? []).filter((a) => a[0] === "event").length, 0);
  assert.equal(window.fbqCalls.length + window.ttqCalls.length, 0);
});

test("a different donation fires its own conversion with its own transaction_id and amount", async () => {
  env();
  const { trackConfirmedDonation } = await load();
  trackConfirmedDonation("DN-111111111111", { amount: "10", currency: "USD" });
  trackConfirmedDonation("DN-222222222222", { amount: "250.50", currency: "USD" });
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(conversions().map((c) => [c[2].transaction_id, c[2].value]), [["DN-111111111111", 10], ["DN-222222222222", 250.5]]);
});

test("an unusable amount/currency sends NO value (never a made-up one) but still reports the verified donation once", async () => {
  env();
  const { trackConfirmedDonation } = await load();
  trackConfirmedDonation("DN-333333333333", { amount: "n/a", currency: "" });
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(conversions()[0][2], { send_to: "AW-11325728548/Hbz7CN6amN0YEKTOw5gq", transaction_id: "DN-333333333333" });
  assert.deepEqual(window.fbqCalls[0].slice(0, 3), ["track", "Donate", {}]);
});

test("no reference → nothing is sent", async () => {
  env();
  const { trackConfirmedDonation } = await load();
  trackConfirmedDonation("", { amount: "10", currency: "USD" });
  assert.equal(window.dataLayer, undefined);
});

test("blocked storage still sends once per page (in-memory guard)", async () => {
  env({ storage: false });
  const { trackConfirmedDonation } = await load();
  trackConfirmedDonation("DN-444444444444", { amount: "10", currency: "USD" });
  trackConfirmedDonation("DN-444444444444", { amount: "10", currency: "USD" });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(conversions().length, 1);
});

test("Meta/TikTok events wait for tracking.js instead of being lost", async () => {
  env();
  delete window.fbq; delete window.ttq;
  const { trackConfirmedDonation } = await load();
  trackConfirmedDonation("DN-555555555555", { amount: "20", currency: "USD" });
  await new Promise((r) => setTimeout(r, 300));
  window.fbq = (...a) => window.fbqCalls.push(a);
  window.ttq = { track: (...a) => window.ttqCalls.push(a) };
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(window.fbqCalls.length, 1);
  assert.equal(window.ttqCalls.length, 1);
});

test("call sites pass the verified donation's amount + currency and only after verification", async () => {
  const { readFileSync } = await import("node:fs");
  const dr = readFileSync(new URL("../src/components/DonationReturn.tsx", import.meta.url), "utf8");
  assert.match(dr, /d\.status === "COMPLETED" && d\.paymentStatus === "PAID"\) trackConfirmedDonation\(d\.reference, \{ amount: d\.amount, currency: d\.currency \}\)/);
  assert.match(dr, /d\.isTest === false/);
  const is = readFileSync(new URL("../src/components/giving/IntentStatus.tsx", import.meta.url), "utf8");
  assert.match(is, /data\.verifiedAt && \(data\.stage === "VERIFIED" \|\| data\.stage === "ALLOCATED"\)\) trackConfirmedDonation\(data\.reference, \{ amount: data\.intendedAmount, currency: data\.currency \}\)/);
  const px = readFileSync(new URL("../src/components/PublicTracking.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(px, /trackConfirmedDonation|"conversion"/); // page-level tracking never fires conversions
});
