-- AlterTable
ALTER TABLE `PageSection` MODIFY `key` ENUM('HERO', 'QUICK_DONATE', 'TRUST', 'ABOUT', 'VISION_MISSION', 'HOW_WE_WORK', 'IMPACT', 'PROGRAMMES', 'ENABLING', 'CAMPAIGNS', 'WHY', 'PROCESS', 'GALLERY', 'FAQ', 'FINAL_CTA', 'FOOTER', 'EVENT_HERO', 'EVENT_ABOUT', 'EVENT_HIGHLIGHTS', 'EVENT_AGENDA', 'EVENT_SPEAKERS', 'EVENT_VENUE', 'EVENT_SPONSORSHIP', 'EVENT_CAMPAIGNS', 'EVENT_FAQ', 'EVENT_REGISTRATION', 'EVENT_CONTACT') NOT NULL;

-- CreateTable
CREATE TABLE `Event` (
    `id` VARCHAR(30) NOT NULL,
    `code` VARCHAR(60) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `titleEn` VARCHAR(255) NOT NULL,
    `titleAr` VARCHAR(255) NULL,
    `shortDescEn` TEXT NULL,
    `shortDescAr` TEXT NULL,
    `descriptionEn` TEXT NULL,
    `descriptionAr` TEXT NULL,
    `highlightsEn` JSON NULL,
    `highlightsAr` JSON NULL,
    `startsAt` DATETIME(3) NULL,
    `endsAt` DATETIME(3) NULL,
    `timezone` VARCHAR(64) NULL,
    `scheduleNoteEn` VARCHAR(255) NULL,
    `scheduleNoteAr` VARCHAR(255) NULL,
    `venueNameEn` VARCHAR(255) NULL,
    `venueNameAr` VARCHAR(255) NULL,
    `addressEn` TEXT NULL,
    `addressAr` TEXT NULL,
    `city` VARCHAR(120) NULL,
    `countryCode` CHAR(2) NULL,
    `mapUrl` VARCHAR(500) NULL,
    `registrationMode` ENUM('NONE', 'EXTERNAL_LINK') NOT NULL DEFAULT 'NONE',
    `externalRegistrationUrl` VARCHAR(500) NULL,
    `ctaPrimaryLabelEn` VARCHAR(120) NULL,
    `ctaPrimaryLabelAr` VARCHAR(120) NULL,
    `ctaPrimaryHref` VARCHAR(500) NULL,
    `ctaSecondaryLabelEn` VARCHAR(120) NULL,
    `ctaSecondaryLabelAr` VARCHAR(120) NULL,
    `ctaSecondaryHref` VARCHAR(500) NULL,
    `heroMediaId` VARCHAR(30) NULL,
    `coverMediaId` VARCHAR(30) NULL,
    `pageId` VARCHAR(30) NOT NULL,
    `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    `visibility` ENUM('PUBLIC', 'UNLISTED') NOT NULL DEFAULT 'PUBLIC',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'CANCELLED', 'COMPLETED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `provenance` ENUM('VERIFIED_SOURCE', 'PROPOSED', 'DEMO') NOT NULL DEFAULT 'PROPOSED',
    `sourceRef` VARCHAR(255) NULL,
    `internalNotes` TEXT NULL,
    `approvedById` VARCHAR(30) NULL,
    `approvedAt` DATETIME(3) NULL,
    `approvalNote` TEXT NULL,
    `seoTitleEn` VARCHAR(255) NULL,
    `seoTitleAr` VARCHAR(255) NULL,
    `seoDescriptionEn` TEXT NULL,
    `seoDescriptionAr` TEXT NULL,
    `publishedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(30) NULL,
    `updatedById` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Event_code_key`(`code`),
    UNIQUE INDEX `Event_slug_key`(`slug`),
    UNIQUE INDEX `Event_pageId_key`(`pageId`),
    INDEX `Event_status_visibility_sortOrder_idx`(`status`, `visibility`, `sortOrder`),
    INDEX `Event_startsAt_idx`(`startsAt`),
    INDEX `Event_isFeatured_idx`(`isFeatured`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventMedia` (
    `eventId` VARCHAR(30) NOT NULL,
    `mediaId` VARCHAR(30) NOT NULL,
    `role` ENUM('GALLERY', 'SUPPORTING') NOT NULL DEFAULT 'GALLERY',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `EventMedia_mediaId_idx`(`mediaId`),
    PRIMARY KEY (`eventId`, `mediaId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventCampaign` (
    `eventId` VARCHAR(30) NOT NULL,
    `campaignId` VARCHAR(30) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EventCampaign_campaignId_idx`(`campaignId`),
    PRIMARY KEY (`eventId`, `campaignId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_heroMediaId_fkey` FOREIGN KEY (`heroMediaId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_coverMediaId_fkey` FOREIGN KEY (`coverMediaId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_pageId_fkey` FOREIGN KEY (`pageId`) REFERENCES `Page`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `AdminUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventMedia` ADD CONSTRAINT `EventMedia_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventMedia` ADD CONSTRAINT `EventMedia_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `MediaAsset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventCampaign` ADD CONSTRAINT `EventCampaign_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventCampaign` ADD CONSTRAINT `EventCampaign_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

