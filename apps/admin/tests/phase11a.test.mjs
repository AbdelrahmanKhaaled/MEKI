// Phase 11A — programme goal + cause publication in the admin (docs/46). Run: pnpm --filter @meki/admin test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const src = (p) => readFileSync(join(import.meta.dirname, "../src", p), "utf8");

test("programme editor: the approved goal is validated client-side and always sent to the API as a pair", () => {
  const e = src("features/content/programs/ProgramEditorPage.tsx");
  assert.match(e, /targetAmount: string; targetCurrency: string;/);
  assert.match(e, /x\.goal\.pairError/);
  assert.match(e, /if \(form\.dirty\.includes\("targetAmount"\) \|\| form\.dirty\.includes\("targetCurrency"\)\) \{\s*body\.targetAmount = toApi\("targetAmount", v\);\s*body\.targetCurrency = toApi\("targetCurrency", v\);/);
  assert.match(e, /programme\.kind === "PROGRAMME" && \(/); // enabling functions take no donations → no goal field
});

test("cause editor: public summary/description/cover fields and publish/unpublish through the API (programmes.publish)", () => {
  const e = src("features/content/causes/CauseEditorPage.tsx");
  for (const f of ["summaryEn", "summaryAr", "descriptionEn", "descriptionAr", "cover"]) assert.match(e, new RegExp(`${f}: `), f);
  assert.match(e, /svc\.publishCause\(cause\.id\)/);
  assert.match(e, /svc\.unpublishCause\(cause\.id\)/);
  assert.match(e, /canPublish=\{can\("programmes\.publish"\)\}/);
  const svc = src("services/content.ts");
  assert.match(svc, /\/admin\/projects\/\$\{id\(cid\)\}\/publish/);
  assert.match(svc, /\/admin\/projects\/\$\{id\(cid\)\}\/unpublish/);
});

test("schemas accept the new fields as optional (older API payloads still parse)", () => {
  const s = src("lib/content-schemas.ts");
  assert.match(s, /targetAmount: z\.string\(\)\.nullable\(\)\.optional\(\),/);
  assert.match(s, /summaryEn: strN\.optional\(\),/);
  assert.match(s, /coverMedia: MediaSchema\.nullable\(\)\.optional\(\),/);
});
