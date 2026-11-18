// Validates the Phase 6C response schemas against a RUNNING API on a *_test database (never production). READ-ONLY (GET only).
// Usage: API_URL=http://localhost:4100 CONTRACT_EMAIL=… CONTRACT_PASSWORD=… node tests/e2e/content-contract.mjs
import { z } from "zod";
import {
  CampaignSchema, CampaignTotalsSchema, DonationSettingsSchema, MediaDetailSchema, MediaSchema, ProgrammeSchema, ProjectDetailSchema, ProjectSchema, PublicDonationConfigSchema,
} from "../../src/lib/content-schemas.ts";

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
const check = (name, schema, data) => {
  const p = schema.safeParse(data);
  tally(p.success, `${name}${p.success ? "" : ` ${JSON.stringify(p.error.issues.slice(0, 3))}`}`);
  return p.success ? p.data : null;
};

const programmes = (await call("/admin/programmes?pageSize=100&sort=sortOrder:asc")).json;
const progs = check(`programmes[] (${programmes?.data?.length})`, z.array(ProgrammeSchema), programmes?.data) ?? [];
const official = progs.filter((p) => p.kind === "PROGRAMME");
tally(official.length >= 9, `nine official programmes present (${official.length} of kind PROGRAMME)`);
if (progs[0]) check("programme detail", ProgrammeSchema, (await call(`/admin/programmes/${progs[0].id}`)).json?.data);
const verified = (await call("/admin/programmes?provenance=VERIFIED_SOURCE&kind=PROGRAMME&pageSize=100")).json;
tally(verified?.meta?.total >= 9, `provenance filter (VERIFIED_SOURCE programmes: ${verified?.meta?.total})`);

const causes = check("projects[] (causes)", z.array(ProjectSchema), (await call("/admin/projects")).json?.data) ?? [];
tally(causes.every((c) => typeof c._count?.campaigns === "number"), "every cause carries a campaign count (Phase 6C additive)");
if (causes[0]) check("project detail (cause)", ProjectDetailSchema, (await call(`/admin/projects/${causes[0].id}`)).json?.data);

const campaigns = (await call("/admin/campaigns?pageSize=50&sort=updatedAt:desc")).json;
const camps = check(`campaigns[] (${campaigns?.data?.length} of ${campaigns?.meta?.total})`, z.array(CampaignSchema), campaigns?.data) ?? [];
if (camps[0]) {
  check("campaign detail", CampaignSchema, (await call(`/admin/campaigns/${camps[0].id}`)).json?.data);
  check("campaign totals (reports.read)", CampaignTotalsSchema, (await call(`/admin/reports/campaigns/${camps[0].id}`)).json?.data);
}
const withProject = camps.find((c) => c.projectId);
if (withProject) {
  const byProject = (await call(`/admin/campaigns?projectId=${withProject.projectId}`)).json?.data ?? [];
  tally(byProject.length > 0 && byProject.every((c) => c.projectId === withProject.projectId), "campaign projectId filter (Phase 6C additive)");
}
tally(camps.every((c) => !c.projectId || !c.project || causes.find((p) => p.id === c.projectId)?.programmeId == null || causes.find((p) => p.id === c.projectId)?.programmeId === c.programmeId), "existing data respects Programme → Cause → Campaign");

const media = (await call("/admin/media?pageSize=24")).json;
const items = check(`media[] (${media?.data?.length} of ${media?.meta?.total})`, z.array(MediaSchema), media?.data) ?? [];
if (items[0]) check("media detail + usage", MediaDetailSchema, (await call(`/admin/media/${items[0].id}`)).json?.data);
const demo = (await call("/admin/media?provenance=DEMO&pageSize=5")).json?.data ?? [];
tally(demo.every((m) => m.provenance === "DEMO"), "media provenance filter (Phase 6C additive)");

check("donation settings (paymentsEffective)", DonationSettingsSchema, (await call("/admin/settings/donation")).json?.data);
check("public donation config", PublicDonationConfigSchema, (await call("/public/donations/config")).json?.data);
console.log(`\n${ok} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
