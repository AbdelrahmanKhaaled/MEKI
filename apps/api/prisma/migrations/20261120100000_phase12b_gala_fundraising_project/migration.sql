-- Phase 12B (additive only): single approved Gala Project per SDI agreement. No existing table or row is changed.
-- CreateTable
CREATE TABLE `EventFundraisingConfig` (
    `id` VARCHAR(30) NOT NULL,
    `eventId` VARCHAR(30) NOT NULL,
    `projectId` VARCHAR(30) NULL,
    `projectPlanReference` VARCHAR(255) NULL,
    `projectPlanApprovedAt` DATETIME(3) NULL,
    `projectPlanApprovedById` VARCHAR(30) NULL,
    `projectPlanApprovalNote` VARCHAR(500) NULL,
    `fundraisingAuthorizedAt` DATETIME(3) NULL,
    `fundraisingAuthorizedById` VARCHAR(30) NULL,
    `donationsCloseAt` DATETIME(3) NULL,
    `donationRefundNoticeApprovedAt` DATETIME(3) NULL,
    `donationRefundNoticeApprovedById` VARCHAR(30) NULL,
    `ticketRefundPolicyEn` TEXT NULL,
    `ticketRefundPolicyAr` TEXT NULL,
    `ticketRefundPolicyApprovedAt` DATETIME(3) NULL,
    `ticketRefundPolicyApprovedById` VARCHAR(30) NULL,
    `updatedById` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EventFundraisingConfig_eventId_key`(`eventId`),
    INDEX `EventFundraisingConfig_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EventFundraisingConfig` ADD CONSTRAINT `EventFundraisingConfig_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventFundraisingConfig` ADD CONSTRAINT `EventFundraisingConfig_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

