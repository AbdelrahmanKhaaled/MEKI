// Validates the Phase 6B response schemas against a RUNNING API on a *_test database (never production). READ-ONLY (GET only).
// Usage: API_URL=http://localhost:4100 CONTRACT_EMAIL=… CONTRACT_PASSWORD=… node tests/e2e/finance-contract.mjs
// It asks for includeTest=true where the API supports it, so the test-provider rows of the test database exercise the shapes.
import { z } from "zod";
import {
  ConfirmedSummarySchema, CurrencySchema, DonationDetailSchema, DonationListRowSchema, DonorDetailSchema, DonorRowSchema, ProviderSchema, ReceiptDetailSchema, ReceiptRowSchema,
  RecurringDetailSchema, RecurringReportSchema, RecurringRowSchema, RefundDetailSchema, RefundReportSchema, RefundRowSchema, TransactionSchema, WebhookEventSchema, AuditEntrySchema, CampaignOptionSchema,
} from "../../src/lib/finance-schemas.ts";

const API = `${process.env.API_URL ?? "http://localhost:4100"}/api/v1`;
let cookie = "";
const call = async (path) => {
  const r = await fetch(API + path, { headers: { Cookie: cookie, Accept: "application/json" } });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const lr = await fetch(`${API}/admin/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: process.env.CONTRACT_EMAIL, password: process.env.CONTRACT_PASSWORD }) });
cookie = (lr.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
console.log("login", lr.status);
let ok = 0, fail = 0;
const tally = (pass, label) => {
  if (pass) ok++;
  else fail++;
  console.log(pass ? "OK  " : "FAIL", label);
};
const check = (name, schema, data, note = "") => {
  const p = schema.safeParse(data);
  tally(p.success, `${name} ${note} ${p.success ? "" : JSON.stringify(p.error.issues.slice(0, 3))}`);
};
const list = async (name, path, item, detail) => {
  const r = await call(path);
  if (r.status !== 200) { fail++; return console.log("FAIL", name, "HTTP", r.status); }
  check(`${name}[] (${r.json.data.length} of ${r.json.meta?.total})`, z.array(item), r.json.data);
  if (detail && r.json.data[0]) {
    const d = await call(detail(r.json.data[0]));
    if (d.status === 200) check(`${name} detail`, detail.schema, d.json.data);
    else tally(false, `${name} detail HTTP ${d.status}`);
  }
  return r.json.data;
};
const withSchema = (fn, schema) => Object.assign(fn, { schema });

await list("donations", "/admin/donations?includeTest=true&pageSize=20", DonationListRowSchema, withSchema((x) => `/admin/donations/${x.id}`, DonationDetailSchema));
const confirmed = (await call("/admin/donations?includeTest=true&paymentStatus=PAID&pageSize=1")).json?.data?.[0];
if (confirmed) check("donation detail (confirmed, with attempts/ledger/receipts)", DonationDetailSchema, (await call(`/admin/donations/${confirmed.id}`)).json?.data);
await list("donors", "/admin/donors?pageSize=20", DonorRowSchema, withSchema((x) => `/admin/donors/${x.id}`, DonorDetailSchema));
const refunds = await list("refunds", "/admin/refunds?pageSize=20", RefundRowSchema, withSchema((x) => `/admin/refunds/${x.id}`, RefundDetailSchema));
if (refunds?.[0]) tally(!!refunds[0].donation, "refunds[] carry the additive donation {reference,isTest} (fails if the API was not rebuilt)");
await list("transactions", "/admin/payments/transactions?includeTest=true&pageSize=20", TransactionSchema, withSchema((x) => `/admin/payments/transactions/${x.id}`, TransactionSchema));
await list("webhook events", "/admin/payments/webhook-events?pageSize=20", WebhookEventSchema);
check("providers", z.array(ProviderSchema), (await call("/admin/payments/providers")).json?.data);
check("currencies", z.array(CurrencySchema), (await call("/admin/payments/currencies")).json?.data);
await list("recurring", "/admin/recurring-donations?includeTest=true&pageSize=20", RecurringRowSchema, withSchema((x) => `/admin/recurring-donations/${x.id}`, RecurringDetailSchema));
const receipts = await list("receipts", "/admin/receipts?pageSize=20", ReceiptRowSchema, withSchema((x) => `/admin/receipts/${x.id}`, ReceiptDetailSchema));
if (receipts?.[0]) tally(!!receipts[0].donation && receipts[0].snapshot === undefined, "receipts[] carry the additive donation block and no snapshot");
if (receipts?.[0]) {
  const doc = await fetch(`${API}/admin/receipts/${receipts[0].id}/document?locale=ar&format=html`, { headers: { Cookie: cookie } });
  const okDoc = doc.status === 200 && /text\/html/.test(doc.headers.get("content-type") ?? "");
  tally(okDoc, `receipt document (HTML, same session) ${doc.status}`);
  const pdf = await fetch(`${API}/admin/receipts/${receipts[0].id}/document?format=pdf`, { headers: { Cookie: cookie } });
  tally(pdf.status === 501, `receipt PDF not configured → ${pdf.status}`);
}
check("report: refunds", RefundReportSchema, (await call("/admin/reports/refunds?includeTest=true")).json?.data);
check("report: recurring", RecurringReportSchema, (await call("/admin/reports/recurring?includeTest=true")).json?.data);
check("report: confirmed summary (USD)", ConfirmedSummarySchema, (await call("/admin/reports/donations/summary?currency=USD&includeTest=true")).json?.data);
check("campaign options", z.array(CampaignOptionSchema), (await call("/admin/campaigns?pageSize=100&sort=titleEn:asc")).json?.data);
check("entity audit (Refund)", z.array(AuditEntrySchema), (await call(`/admin/audit-logs?entityType=Refund${refunds?.[0] ? `&entityId=${refunds[0].id}` : ""}&pageSize=20`)).json?.data);
console.log(`\n${ok} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
