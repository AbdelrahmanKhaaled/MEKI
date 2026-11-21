-- Phase 14B (2026-11-22): temporary Gala-only launch mode. Records the donor's SOURCE interest (programme / general) separately
-- from the ACTUAL destination (the approved Gala project, in DonationAllocation), with the donor's explicit acceptance.
-- ADDITIVE ONLY: 4 nullable columns, 1 index, 1 foreign key and a NEW trigger. The Phase 14 trigger
-- `Donation_intent_classification_immutable` is NOT modified. No DROP, no data rewrite.

-- AlterTable
ALTER TABLE `Donation` ADD COLUMN `destinationDisclosureAcceptedAt` DATETIME(3) NULL,
    ADD COLUMN `destinationDisclosureVersion` VARCHAR(40) NULL,
    ADD COLUMN `interestKind` VARCHAR(12) NULL,
    ADD COLUMN `interestProgrammeId` VARCHAR(30) NULL;

-- CreateIndex
CREATE INDEX `Donation_interestProgrammeId_idx` ON `Donation`(`interestProgrammeId`);

-- AddForeignKey
ALTER TABLE `Donation` ADD CONSTRAINT `Donation_interestProgrammeId_fkey` FOREIGN KEY (`interestProgrammeId`) REFERENCES `Programme`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Phase 14B: once recorded, the source interest and the donor's acceptance of the Gala destination cannot change.
CREATE TRIGGER `Donation_interest_disclosure_immutable` BEFORE UPDATE ON `Donation` FOR EACH ROW
BEGIN
  IF (OLD.`interestKind` IS NOT NULL AND NOT (OLD.`interestKind` <=> NEW.`interestKind`))
     OR (OLD.`interestProgrammeId` IS NOT NULL AND NOT (OLD.`interestProgrammeId` <=> NEW.`interestProgrammeId`))
     OR (OLD.`destinationDisclosureAcceptedAt` IS NOT NULL AND NOT (OLD.`destinationDisclosureAcceptedAt` <=> NEW.`destinationDisclosureAcceptedAt`))
     OR (OLD.`destinationDisclosureVersion` IS NOT NULL AND NOT (OLD.`destinationDisclosureVersion` <=> NEW.`destinationDisclosureVersion`)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Donation source interest and destination disclosure are immutable';
  END IF;
END;
