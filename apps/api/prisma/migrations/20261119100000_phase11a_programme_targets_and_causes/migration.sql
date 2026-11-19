-- Phase 11A (additive only): approved programme fundraising goal; public presentation + publication fields for causes (Project).
-- No column is dropped or rewritten; all new columns are NULL or have a default. Targets are never derived from campaign targets.
-- AlterTable
ALTER TABLE `Programme` ADD COLUMN `targetAmount` DECIMAL(14, 2) NULL,
    ADD COLUMN `targetCurrency` CHAR(3) NULL;

-- AlterTable
ALTER TABLE `Project` ADD COLUMN `coverMediaId` VARCHAR(30) NULL,
    ADD COLUMN `descriptionAr` TEXT NULL,
    ADD COLUMN `descriptionEn` TEXT NULL,
    ADD COLUMN `publishedAt` DATETIME(3) NULL,
    ADD COLUMN `sortOrder` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `summaryAr` TEXT NULL,
    ADD COLUMN `summaryEn` TEXT NULL;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_coverMediaId_fkey` FOREIGN KEY (`coverMediaId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
