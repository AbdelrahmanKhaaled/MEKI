-- MEKI client edits (2026-11-25, "MEKI Website Content (Programs) SHORTENED"): "Areas of work" carry a title AND a description,
-- and one programme page title differs from its card name ("Emergency Response & Gaza Relief").
-- ADDITIVE ONLY: 4 nullable columns on `Programme`. No DROP, no data rewrite, no default backfill; existing rows keep every value.
-- Content is written afterwards through the audited admin API (deploy/staging/nov25/programmes.mjs), never by this migration.

-- AlterTable
ALTER TABLE `Programme` ADD COLUMN `focusAreaDetailsEn` JSON NULL,
    ADD COLUMN `focusAreaDetailsAr` JSON NULL,
    ADD COLUMN `pageTitleEn` VARCHAR(255) NULL,
    ADD COLUMN `pageTitleAr` VARCHAR(255) NULL;
