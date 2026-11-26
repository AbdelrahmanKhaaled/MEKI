// Regression: the Gala event must be approvable + publishable from the admin (incident: agenda published but public API 404 because
// the event itself was still DRAFT and no admin screen could approve/publish it).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { galaAr, galaEn } from "../src/lib/i18n-gala.ts";

const root = join(import.meta.dirname, "../../..");
const read = (p) => readFileSync(join(root, p), "utf8");

test("publication card is mounted in Gala Settings and gated by events.read", () => {
  const page = read("apps/admin/src/features/gala/settings/GalaSettingsPage.tsx");
  assert.match(page, /import \{ GalaPublishCard \} from "\.\/GalaPublishCard"/);
  assert.match(page, /can\("events\.read"\) && detail\.data && <GalaPublishCard/);
});

test("approve / publish / unpublish call the event endpoints with the right permissions and a mandatory reference note", () => {
  const svc = read("apps/admin/src/services/gala.ts");
  assert.match(svc, /approveEvent[^\n]*\/approve`[^\n]*\{ note \}/);
  assert.match(svc, /publishEvent[^\n]*apiPostOutcome\(`\$\{e\(ev\)\}\/publish`/);
  assert.match(svc, /unpublishEvent[^\n]*apiPostOutcome\(`\$\{e\(ev\)\}\/unpublish`/);
  const card = read("apps/admin/src/features/gala/settings/GalaPublishCard.tsx");
  assert.match(card, /can\("events\.approve"\)/);
  assert.match(card, /can\("events\.publish"\)/);
  assert.match(card, /confirmDisabled=\{note\.trim\(\)\.length < 5\}/); // approval is never defaulted or auto-filled
  assert.match(card, /disabled=\{blockers\.length > 0\}/); // the server's blockers gate Publish
  assert.doesNotMatch(card, /useState\(["'`][^"'`]{5,}/); // no pre-filled approval text
});

test("the card never combines approval and publication into one action, and refreshes status + page data after each", () => {
  const card = read("apps/admin/src/features/gala/settings/GalaPublishCard.tsx");
  assert.equal((card.match(/svc\.approveEvent/g) ?? []).length, 1);
  assert.equal((card.match(/svc\.publishEvent/g) ?? []).length, 1);
  assert.match(card, /galaKeys\.event\(ev\.id\)/);
  assert.match(card, /galaKeys\.events/);
  assert.match(card, /page-sections/);
});

test("the agenda card warns when the event is not public (saving a section never publishes the event)", () => {
  const agenda = read("apps/admin/src/features/gala/settings/GalaAgendaCard.tsx");
  assert.match(agenda, /gala-agenda-not-public/);
  assert.match(agenda, /isEventPublic/);
});

test("publish i18n has full EN/AR parity", () => {
  const en = galaEn.settings.publish, ar = galaAr.settings.publish;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ar).sort());
  for (const k of Object.keys(en)) assert.ok(en[k].length > 0 && ar[k].length > 0, k);
  assert.match(en.approvedBy, /\{name\}/); assert.match(ar.approvedBy, /\{name\}/);
});

test("26 Nov 2026 policy: no approval gate — saves always publish, Publish is not gated by approval, approval stays optional/never automatic", () => {
  const agenda = read("apps/admin/src/features/gala/settings/GalaAgendaCard.tsx");
  assert.doesNotMatch(agenda, /livePublished/); // every save publishes, not only already-live sections
  assert.match(agenda, /const onChange = async \(\) => \{\s*if \(canPublish\) \{\s*try \{\s*await svc\.setSectionStatus\(ev\.id, section\.id, true\)/);
  assert.match(agenda, /gala-agenda-publish-event/); // one-click event publish right where the editor sees the warning
  const card = read("apps/admin/src/features/gala/settings/GalaPublishCard.tsx");
  assert.doesNotMatch(card, /approvedAt\s*&&\s*!!d\.publishedAt|!!d\.approvedAt && !!d\.publishedAt/); // "public" no longer needs approvedAt
  assert.match(card, /disabled=\{blockers\.length > 0\}/); // gated only by the server's real content blockers
  assert.equal((card.match(/svc\.approveEvent/g) ?? []).length, 1); // optional manual action only
  assert.match(card, /showApprove = !d\.approvedAt && !closed/);
});
