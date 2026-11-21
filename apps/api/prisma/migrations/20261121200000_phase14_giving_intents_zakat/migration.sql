-- Phase 14 (2026-11-21): hosted donation intents (DN- references), first-class Zakat/Sadaqah classification, Zakat eligibility
-- decisions (two administrators), donation reconciliation columns. ADDITIVE ONLY: nullable columns, one new table, one enum value
-- appended, indexes and an immutability trigger. No DROP, no data rewrite; legacy donations keep NULL in every new column.
-- AlterTable
ALTER TABLE `Donation` ADD COLUMN `allocationDecidedAt` DATETIME(3) NULL,
    ADD COLUMN `allocationDecidedById` VARCHAR(30) NULL,
    ADD COLUMN `allocationNote` VARCHAR(500) NULL,
    ADD COLUMN `allocationStatus` ENUM('PENDING_AUTHORIZATION', 'AUTHORIZED', 'REJECTED') NULL,
    ADD COLUMN `authorizedFund` VARCHAR(160) NULL,
    ADD COLUMN `charitableClassification` ENUM('ZAKAT', 'SADAQAH') NULL,
    ADD COLUMN `externalPaymentId` VARCHAR(64) NULL,
    ADD COLUMN `intentType` ENUM('GALA_TICKET', 'GALA_DONATION', 'PROGRAM_DONATION', 'GENERAL_DONATION') NULL,
    ADD COLUMN `payoutStatus` ENUM('NOT_REPORTED', 'REPORTED_SETTLED') NULL,
    ADD COLUMN `reconciledAt` DATETIME(3) NULL,
    ADD COLUMN `reconciledReportId` VARCHAR(30) NULL,
    ADD COLUMN `reconciledReportRow` INTEGER NULL,
    ADD COLUMN `reconciliationStatus` ENUM('AWAITING_REPORT', 'VERIFIED', 'NEEDS_REVIEW', 'REPORTED_UNPAID') NULL,
    ADD COLUMN `reportedAmount` DECIMAL(18, 2) NULL;

-- AlterTable
ALTER TABLE `DonationAllocation` ADD COLUMN `projectId` VARCHAR(30) NULL,
    MODIFY `designation` ENUM('GENERAL_FUND', 'CAMPAIGN', 'PROGRAMME', 'PROJECT') NOT NULL;

-- AlterTable
ALTER TABLE `ProviderReportRow` ADD COLUMN `designationRaw` VARCHAR(120) NULL,
    ADD COLUMN `donationId` VARCHAR(30) NULL,
    ADD COLUMN `donationReference` VARCHAR(20) NULL,
    ADD COLUMN `donationReferenceRaw` VARCHAR(80) NULL,
    ADD COLUMN `donationType` VARCHAR(10) NULL,
    ADD COLUMN `donationTypeRaw` VARCHAR(60) NULL;

-- AlterTable
ALTER TABLE `RecurringDonation` MODIFY `designation` ENUM('GENERAL_FUND', 'CAMPAIGN', 'PROGRAMME', 'PROJECT') NOT NULL;

-- CreateTable
CREATE TABLE `ZakatEligibilityDecision` (
    `id` VARCHAR(30) NOT NULL,
    `targetType` ENUM('PROGRAMME', 'PROJECT', 'CAMPAIGN') NOT NULL,
    `targetId` VARCHAR(30) NOT NULL,
    `eligible` BOOLEAN NOT NULL,
    `status` ENUM('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'REVOKED', 'SUPERSEDED') NOT NULL DEFAULT 'PENDING_APPROVAL',
    `authorityReference` VARCHAR(255) NULL,
    `sdiAcceptanceReference` VARCHAR(255) NULL,
    `requestNote` VARCHAR(500) NULL,
    `requestedById` VARCHAR(30) NOT NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `decidedById` VARCHAR(30) NULL,
    `decidedAt` DATETIME(3) NULL,
    `decisionNote` VARCHAR(500) NULL,

    INDEX `ZakatEligibilityDecision_targetType_targetId_status_idx`(`targetType`, `targetId`, `status`),
    INDEX `ZakatEligibilityDecision_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Donation_externalPaymentId_key` ON `Donation`(`externalPaymentId`);

-- CreateIndex
CREATE INDEX `Donation_intentType_reconciliationStatus_idx` ON `Donation`(`intentType`, `reconciliationStatus`);

-- CreateIndex
CREATE INDEX `DonationAllocation_projectId_idx` ON `DonationAllocation`(`projectId`);

-- CreateIndex
CREATE INDEX `ProviderReportRow_donationId_idx` ON `ProviderReportRow`(`donationId`);

-- AddForeignKey
ALTER TABLE `DonationAllocation` ADD CONSTRAINT `DonationAllocation_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Phase 14: the donor's intent type and Zakat/Sadaqah choice are immutable once recorded (never converted silently).
CREATE TRIGGER `Donation_intent_classification_immutable` BEFORE UPDATE ON `Donation` FOR EACH ROW
BEGIN
  IF (OLD.`charitableClassification` IS NOT NULL AND NOT (OLD.`charitableClassification` <=> NEW.`charitableClassification`))
     OR (OLD.`intentType` IS NOT NULL AND NOT (OLD.`intentType` <=> NEW.`intentType`)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Donation intent type and Zakat/Sadaqah classification are immutable';
  END IF;
END;
