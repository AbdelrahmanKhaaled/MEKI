-- Phase 12 (additive only): Zeffy-owned ticket issuer flag + SDI report import/reconciliation tables. No column dropped or rewritten;
-- every existing booking keeps ticketIssuer = MEKI (its current behaviour).
-- AlterTable
ALTER TABLE `EventBooking` ADD COLUMN `reportedTicketCount` INTEGER NULL,
    ADD COLUMN `ticketIssuer` ENUM('MEKI', 'ZEFFY') NOT NULL DEFAULT 'MEKI';

-- CreateTable
CREATE TABLE `ProviderReportImport` (
    `id` VARCHAR(30) NOT NULL,
    `source` VARCHAR(20) NOT NULL DEFAULT 'SDI',
    `kind` ENUM('RECONCILIATION', 'ATTENDEES') NOT NULL,
    `status` ENUM('UPLOADED', 'PREVIEWED', 'APPLIED', 'REJECTED') NOT NULL DEFAULT 'UPLOADED',
    `fileName` VARCHAR(255) NOT NULL,
    `fileSha256` CHAR(64) NOT NULL,
    `fileSize` INTEGER NOT NULL,
    `fileType` VARCHAR(10) NOT NULL,
    `storageKey` VARCHAR(255) NOT NULL,
    `headers` JSON NOT NULL,
    `mapping` JSON NULL,
    `mappingProfileId` VARCHAR(30) NULL,
    `isSynthetic` BOOLEAN NOT NULL DEFAULT false,
    `periodFrom` DATETIME(3) NULL,
    `periodTo` DATETIME(3) NULL,
    `rowCount` INTEGER NOT NULL DEFAULT 0,
    `acceptedCount` INTEGER NOT NULL DEFAULT 0,
    `rejectedCount` INTEGER NOT NULL DEFAULT 0,
    `summary` JSON NULL,
    `supersedesId` VARCHAR(30) NULL,
    `uploadedById` VARCHAR(30) NOT NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `previewedAt` DATETIME(3) NULL,
    `approvedById` VARCHAR(30) NULL,
    `appliedAt` DATETIME(3) NULL,
    `rejectedById` VARCHAR(30) NULL,
    `rejectedAt` DATETIME(3) NULL,
    `rejectReason` VARCHAR(500) NULL,
    `notes` TEXT NULL,

    INDEX `ProviderReportImport_kind_status_idx`(`kind`, `status`),
    INDEX `ProviderReportImport_uploadedAt_idx`(`uploadedAt`),
    UNIQUE INDEX `ProviderReportImport_source_kind_fileSha256_key`(`source`, `kind`, `fileSha256`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProviderReportRow` (
    `id` VARCHAR(30) NOT NULL,
    `importId` VARCHAR(30) NOT NULL,
    `rowNumber` INTEGER NOT NULL,
    `sourceOrderId` VARCHAR(64) NULL,
    `bookingReferenceRaw` VARCHAR(80) NULL,
    `bookingReference` VARCHAR(20) NULL,
    `ticketType` VARCHAR(120) NULL,
    `lineKind` VARCHAR(12) NOT NULL,
    `quantity` INTEGER NULL,
    `amount` DECIMAL(18, 2) NULL,
    `refundedAmount` DECIMAL(18, 2) NULL,
    `currency` CHAR(3) NULL,
    `statusRaw` VARCHAR(60) NULL,
    `status` VARCHAR(20) NULL,
    `occurredAt` DATETIME(3) NULL,
    `matchStatus` ENUM('MATCHED', 'UNMATCHED', 'AMBIGUOUS', 'INVALID_REFERENCE', 'AMOUNT_MISMATCH', 'DUPLICATE_ROW', 'STALE', 'ALREADY_APPLIED', 'REQUIRES_REVIEW', 'INVALID', 'INFO') NOT NULL,
    `matchNote` VARCHAR(300) NULL,
    `bookingId` VARCHAR(30) NULL,
    `applied` BOOLEAN NOT NULL DEFAULT false,
    `appliedAt` DATETIME(3) NULL,
    `errors` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProviderReportRow_sourceOrderId_idx`(`sourceOrderId`),
    INDEX `ProviderReportRow_bookingId_idx`(`bookingId`),
    INDEX `ProviderReportRow_importId_matchStatus_idx`(`importId`, `matchStatus`),
    UNIQUE INDEX `ProviderReportRow_importId_rowNumber_key`(`importId`, `rowNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SdiAttendee` (
    `id` VARCHAR(30) NOT NULL,
    `importId` VARCHAR(30) NOT NULL,
    `rowNumber` INTEGER NOT NULL,
    `sourceOrderId` VARCHAR(64) NULL,
    `bookingReference` VARCHAR(20) NULL,
    `guestName` VARCHAR(200) NOT NULL,
    `ticketType` VARCHAR(120) NULL,
    `tableLabel` VARCHAR(40) NULL,
    `answers` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SdiAttendee_bookingReference_idx`(`bookingReference`),
    UNIQUE INDEX `SdiAttendee_importId_rowNumber_key`(`importId`, `rowNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProviderReportMapping` (
    `id` VARCHAR(30) NOT NULL,
    `source` VARCHAR(20) NOT NULL DEFAULT 'SDI',
    `kind` ENUM('RECONCILIATION', 'ATTENDEES') NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `mapping` JSON NOT NULL,
    `verifiedAgainstSample` BOOLEAN NOT NULL DEFAULT false,
    `verifiedById` VARCHAR(30) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `verificationNote` VARCHAR(500) NULL,
    `createdById` VARCHAR(30) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProviderReportMapping_source_kind_name_key`(`source`, `kind`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProviderReportRow` ADD CONSTRAINT `ProviderReportRow_importId_fkey` FOREIGN KEY (`importId`) REFERENCES `ProviderReportImport`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SdiAttendee` ADD CONSTRAINT `SdiAttendee_importId_fkey` FOREIGN KEY (`importId`) REFERENCES `ProviderReportImport`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
