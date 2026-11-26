// Verification tests for Gala Agenda Dashboard Management
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { galaAr, galaEn } from "../src/lib/i18n-gala.ts";

const root = join(import.meta.dirname, "../../..");
const read = (p) => readFileSync(join(root, p), "utf8");

test("Gala Agenda: Dashboard card exists and is mounted in GalaSettingsPage", () => {
  const pageSrc = read("apps/admin/src/features/gala/settings/GalaSettingsPage.tsx");
  assert.match(pageSrc, /import \{ GalaAgendaCard \} from "\.\/GalaAgendaCard"/);
  assert.match(pageSrc, /can\("events\.read"\) && <GalaAgendaCard ev=\{ev\} \/>/);

  const cardSrc = read("apps/admin/src/features/gala/settings/GalaAgendaCard.tsx");
  assert.match(cardSrc, /data-testid="gala-agenda-admin"/);
  assert.match(cardSrc, /data-testid="gala-agenda-act"/);
});

test("Gala Agenda: Reuses existing Events/CMS API and handles Acts & Items management", () => {
  const cardSrc = read("apps/admin/src/features/gala/settings/GalaAgendaCard.tsx");

  // Reuses existing gala-page / events API functions
  assert.match(cardSrc, /svc\.getEventPage/);
  assert.match(cardSrc, /svc\.createSection/);
  assert.match(cardSrc, /svc\.updateSection/);
  assert.match(cardSrc, /svc\.addItem/);
  assert.match(cardSrc, /svc\.updateItem/);
  assert.match(cardSrc, /svc\.deleteItem/);
  assert.match(cardSrc, /svc\.reorderItems/);
  assert.match(cardSrc, /svc\.setSectionStatus/);

  // Supports adding acts and initializing with default acts
  assert.match(cardSrc, /addAct/);
  assert.match(cardSrc, /handleInitDefault/);

  // Supports reordering acts and items
  assert.match(cardSrc, /moveAct/);
  assert.match(cardSrc, /moveItem/);

  // Supports adding items to an act and removing items
  assert.match(cardSrc, /addItemToAct/);
  assert.match(cardSrc, /removeItem/);
});

test("Gala Agenda: i18n parity for all agenda operations in English and Arabic", () => {
  const en = galaEn.settings.agenda;
  const ar = galaAr.settings.agenda;

  assert.deepEqual(Object.keys(en).sort(), Object.keys(ar).sort());
  for (const key of Object.keys(en)) {
    assert.ok(typeof en[key] === "string" && en[key].length > 0, `en.${key} is populated`);
    assert.ok(typeof ar[key] === "string" && ar[key].length > 0, `ar.${key} is populated`);
  }
});

test("Gala Agenda: Seed data initializes EVENT_AGENDA skeleton items with 4 acts", () => {
  const seedSrc = read("apps/api/prisma/seed/gala-night.ts");
  assert.match(seedSrc, /EVENT_AGENDA: \[/);
  assert.match(seedSrc, /code: 'act-1'/);
  assert.match(seedSrc, /code: 'act-2'/);
  assert.match(seedSrc, /code: 'act-3'/);
  assert.match(seedSrc, /code: 'act-4'/);
});
