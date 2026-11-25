-- MEKI client edits (2026-11-23, "MEKI-US Website Edits for the IT Team"): approved program copy layout.
-- ADDITIVE ONLY: 4 nullable columns on `Programme`. No DROP, no data rewrite, no default backfill; existing rows keep every value.
-- Content is written afterwards through the audited admin API (deploy/staging/apply-nov23-client-edits.mjs), never by this migration.

-- AlterTable
ALTER TABLE `Programme` ADD COLUMN `summaryEn` TEXT NULL,
    ADD COLUMN `summaryAr` TEXT NULL,
    ADD COLUMN `outcomesEn` JSON NULL,
    ADD COLUMN `outcomesAr` JSON NULL;
