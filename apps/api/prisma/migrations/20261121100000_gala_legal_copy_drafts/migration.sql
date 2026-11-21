-- Nov 19 2026 client update (additive only): approval-gated Gala legal copy drafts. No existing table or row is changed.
-- CreateTable
CREATE TABLE `EventLegalCopy` (
    `id` VARCHAR(30) NOT NULL,
    `eventId` VARCHAR(30) NOT NULL,
    `kind` ENUM('TICKET_PURCHASE_DISCLOSURE', 'TICKET_RECEIPT', 'WEBSITE_DISCLOSURE') NOT NULL,
    `textEn` TEXT NULL,
    `textAr` TEXT NULL,
    `ticketPrice` DECIMAL(18, 2) NULL,
    `fairMarketValue` DECIMAL(18, 2) NULL,
    `deductibleAmount` DECIMAL(18, 2) NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'USD',
    `sourceNote` VARCHAR(255) NULL,
    `sdiApprovedAt` DATETIME(3) NULL,
    `sdiApprovedById` VARCHAR(30) NULL,
    `sdiApprovalNote` VARCHAR(500) NULL,
    `publishedAt` DATETIME(3) NULL,
    `publishedById` VARCHAR(30) NULL,
    `updatedById` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EventLegalCopy_eventId_kind_key`(`eventId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EventLegalCopy` ADD CONSTRAINT `EventLegalCopy_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

