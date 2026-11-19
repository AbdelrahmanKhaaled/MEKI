// Phase 8A — SDI / Zeffy admin screen: permissions, EN/AR copy, contract and static guards. Run: pnpm --filter @meki/admin test
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test, { describe } from "node:test";
import { ar, en } from "../src/lib/i18n.ts";
import { visibleNav } from "../src/lib/navigation.ts";
import { MATCH_STATUSES, ProviderPaymentSchema, ZeffyStatusSchema } from "../src/lib/zeffy-schemas.ts";

const here = import.meta.dirname;
const read = (p) => readFileSync(join(here, "../src", p), "utf8");

describe("SDI / Zeffy admin screen", () => {
  test("visible with payments.read only (finance, administrators); not for content or door staff", () => {
    const keys = (...permissions) => visibleNav({ permissions, isSuperAdmin: false }).flatMap((g) => g.items.map((i) => i.key));
    assert.ok(keys("payments.read").includes("sdiZeffy"));
    assert.ok(!keys("content.read", "events.read").includes("sdiZeffy"));
    assert.ok(!keys("gala.checkin.validate").includes("sdiZeffy"));
    assert.ok(existsSync(join(here, "../src/app/[locale]/(dashboard)/payments/zeffy/page.tsx")));
  });
  test("every string exists in Arabic with the same placeholders; every correlation state is labelled", () => {
    const flat = (o, p = []) => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, [...p, k]) : [[...p, k]]));
    const get = (o, path) => path.reduce((a, k) => a?.[k], o);
    for (const k of flat(en.zeffy)) {
      const a = get(ar.zeffy, k);
      assert.ok(typeof a === "string" && a.trim(), k.join("."));
      const ph = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      assert.equal(ph(a), ph(get(en.zeffy, k)), k.join("."));
    }
    for (const m of MATCH_STATUSES) assert.ok(en.zeffy.match[m] && ar.zeffy.match[m], m);
  });
  test("status schema carries booleans only — a configuration value can never be rendered", () => {
    const ok = ZeffyStatusSchema.safeParse({ provider: "zeffy", configured: { apiKey: true, webhookSecret: false, galaTicketCampaign: false, donationCampaigns: 0, forms: { donation: false, galaTicket: false, galaGiving: false } }, reconciliationEnabled: false, autoConfirm: false, hostedCheckout: { available: false, reason: "r" }, api: { state: "not_configured" }, webhook: { lastVerifiedAt: null, lastEventType: null, failedEvents: 0 }, lastReconciliation: null, queue: {} });
    assert.ok(ok.success);
    assert.equal(ZeffyStatusSchema.safeParse({ ...ok.data, configured: { ...ok.data.configured, apiKey: "zk_live_secret" } }).success, false);
    assert.equal(ProviderPaymentSchema.safeParse({}).success, false);
  });
  test("no manual 'mark paid' path, no provider write calls, no card fields, no browser storage", () => {
    const files = ["features/finance/zeffy/ZeffyPage.tsx", "services/zeffy.ts", "lib/zeffy-schemas.ts"].map(read).join("\n");
    assert.doesNotMatch(files, /mark.?paid|markPaid|confirmBooking|card.?number|cvc|localStorage|sessionStorage|\bfetch\(/i);
    assert.doesNotMatch(read("services/zeffy.ts"), /api\.zeffy\.com|POST \/api\/v1\/payments/); // the admin talks to MEKI only
    assert.match(read("features/finance/zeffy/ZeffyPage.tsx"), /ConfirmDialog/);
  });
});
