-- CreateTable
CREATE TABLE `AdminUser` (
    `id` VARCHAR(30) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    `failedLoginCount` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `passwordChangedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AdminUser_email_key`(`email`),
    INDEX `AdminUser_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Role` (
    `id` VARCHAR(30) NOT NULL,
    `key` VARCHAR(60) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(500) NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Role_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Permission` (
    `id` VARCHAR(30) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `group` VARCHAR(40) NOT NULL,
    `description` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Permission_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RolePermission` (
    `roleId` VARCHAR(30) NOT NULL,
    `permissionId` VARCHAR(30) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RolePermission_permissionId_idx`(`permissionId`),
    PRIMARY KEY (`roleId`, `permissionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserRole` (
    `userId` VARCHAR(30) NOT NULL,
    `roleId` VARCHAR(30) NOT NULL,
    `assignedById` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserRole_roleId_idx`(`roleId`),
    PRIMARY KEY (`userId`, `roleId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminSession` (
    `id` VARCHAR(30) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `csrfTokenHash` CHAR(64) NOT NULL,
    `userId` VARCHAR(30) NOT NULL,
    `ip` VARCHAR(64) NULL,
    `userAgent` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `idleExpiresAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,

    UNIQUE INDEX `AdminSession_tokenHash_key`(`tokenHash`),
    INDEX `AdminSession_userId_idx`(`userId`),
    INDEX `AdminSession_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordResetToken` (
    `id` VARCHAR(30) NOT NULL,
    `userId` VARCHAR(30) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PasswordResetToken_tokenHash_key`(`tokenHash`),
    INDEX `PasswordResetToken_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SiteSetting` (
    `id` VARCHAR(30) NOT NULL DEFAULT 'default',
    `orgNameEn` VARCHAR(160) NOT NULL,
    `orgNameAr` VARCHAR(160) NULL,
    `legalNameEn` VARCHAR(255) NULL,
    `legalNameAr` VARCHAR(255) NULL,
    `taglineEn` VARCHAR(255) NULL,
    `taglineAr` VARCHAR(255) NULL,
    `legacyLineEn` VARCHAR(255) NULL,
    `legacyLineAr` VARCHAR(255) NULL,
    `logoPrimaryUrl` VARCHAR(500) NULL,
    `logoInverseUrl` VARCHAR(500) NULL,
    `logoIconUrl` VARCHAR(500) NULL,
    `contactEmail` VARCHAR(191) NULL,
    `contactPhone` VARCHAR(40) NULL,
    `addressEn` TEXT NULL,
    `addressAr` TEXT NULL,
    `socialLinks` JSON NULL,
    `defaultLocale` VARCHAR(5) NOT NULL DEFAULT 'en',
    `supportedLocales` JSON NOT NULL,
    `footerTextEn` TEXT NULL,
    `footerTextAr` TEXT NULL,
    `footerNoteEn` VARCHAR(500) NULL,
    `footerNoteAr` VARCHAR(500) NULL,
    `copyrightEn` VARCHAR(255) NULL,
    `copyrightAr` VARCHAR(255) NULL,
    `seoTitleEn` VARCHAR(255) NULL,
    `seoTitleAr` VARCHAR(255) NULL,
    `seoDescriptionEn` TEXT NULL,
    `seoDescriptionAr` TEXT NULL,
    `ogImageId` VARCHAR(30) NULL,
    `updatedById` VARCHAR(30) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DonationSetting` (
    `id` VARCHAR(30) NOT NULL DEFAULT 'default',
    `defaultCurrency` CHAR(3) NOT NULL DEFAULT 'USD',
    `displayCurrencies` JSON NOT NULL,
    `suggestedAmounts` JSON NOT NULL,
    `allowCustomAmount` BOOLEAN NOT NULL DEFAULT true,
    `minAmount` DECIMAL(14, 2) NULL,
    `maxAmount` DECIMAL(14, 2) NULL,
    `allowOneTime` BOOLEAN NOT NULL DEFAULT true,
    `allowRecurring` BOOLEAN NOT NULL DEFAULT false,
    `paymentsEnabled` BOOLEAN NOT NULL DEFAULT false,
    `paymentProvider` VARCHAR(60) NULL,
    `previewNoticeEn` TEXT NULL,
    `previewNoticeAr` TEXT NULL,
    `provenance` ENUM('VERIFIED_SOURCE', 'PROPOSED', 'DEMO') NOT NULL DEFAULT 'PROPOSED',
    `updatedById` VARCHAR(30) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Page` (
    `id` VARCHAR(30) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `titleEn` VARCHAR(255) NOT NULL,
    `titleAr` VARCHAR(255) NULL,
    `seoTitleEn` VARCHAR(255) NULL,
    `seoTitleAr` VARCHAR(255) NULL,
    `seoDescriptionEn` TEXT NULL,
    `seoDescriptionAr` TEXT NULL,
    `ogImageId` VARCHAR(30) NULL,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `provenance` ENUM('VERIFIED_SOURCE', 'PROPOSED', 'DEMO') NOT NULL DEFAULT 'PROPOSED',
    `publishedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(30) NULL,
    `updatedById` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Page_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PageSection` (
    `id` VARCHAR(30) NOT NULL,
    `pageId` VARCHAR(30) NOT NULL,
    `key` ENUM('HERO', 'QUICK_DONATE', 'TRUST', 'ABOUT', 'VISION_MISSION', 'HOW_WE_WORK', 'IMPACT', 'PROGRAMMES', 'ENABLING', 'CAMPAIGNS', 'WHY', 'PROCESS', 'GALLERY', 'FAQ', 'FINAL_CTA', 'FOOTER') NOT NULL,
    `anchor` VARCHAR(60) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isVisible` BOOLEAN NOT NULL DEFAULT true,
    `eyebrowEn` VARCHAR(255) NULL,
    `eyebrowAr` VARCHAR(255) NULL,
    `titleEn` VARCHAR(500) NULL,
    `titleAr` VARCHAR(500) NULL,
    `subtitleEn` VARCHAR(500) NULL,
    `subtitleAr` VARCHAR(500) NULL,
    `bodyEn` TEXT NULL,
    `bodyAr` TEXT NULL,
    `ctaPrimaryLabelEn` VARCHAR(120) NULL,
    `ctaPrimaryLabelAr` VARCHAR(120) NULL,
    `ctaPrimaryHref` VARCHAR(500) NULL,
    `ctaSecondaryLabelEn` VARCHAR(120) NULL,
    `ctaSecondaryLabelAr` VARCHAR(120) NULL,
    `ctaSecondaryHref` VARCHAR(500) NULL,
    `mediaId` VARCHAR(30) NULL,
    `labelsEn` JSON NULL,
    `labelsAr` JSON NULL,
    `provenance` ENUM('VERIFIED_SOURCE', 'PROPOSED', 'DEMO') NOT NULL DEFAULT 'PROPOSED',
    `sourceRef` VARCHAR(255) NULL,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `publishedData` JSON NULL,
    `publishedAt` DATETIME(3) NULL,
    `hasUnpublishedChanges` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(30) NULL,
    `updatedById` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PageSection_pageId_sortOrder_idx`(`pageId`, `sortOrder`),
    UNIQUE INDEX `PageSection_pageId_key_key`(`pageId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SectionItem` (
    `id` VARCHAR(30) NOT NULL,
    `sectionId` VARCHAR(30) NOT NULL,
    `code` VARCHAR(80) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isVisible` BOOLEAN NOT NULL DEFAULT true,
    `titleEn` VARCHAR(500) NULL,
    `titleAr` VARCHAR(500) NULL,
    `textEn` TEXT NULL,
    `textAr` TEXT NULL,
    `icon` VARCHAR(40) NULL,
    `href` VARCHAR(500) NULL,
    `mediaId` VARCHAR(30) NULL,
    `provenance` ENUM('VERIFIED_SOURCE', 'PROPOSED', 'DEMO') NOT NULL DEFAULT 'PROPOSED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SectionItem_sectionId_sortOrder_idx`(`sectionId`, `sortOrder`),
    UNIQUE INDEX `SectionItem_sectionId_code_key`(`sectionId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Programme` (
    `id` VARCHAR(30) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `kind` ENUM('PROGRAMME', 'ENABLING_FUNCTION') NOT NULL DEFAULT 'PROGRAMME',
    `number` INTEGER NULL,
    `nameEn` VARCHAR(255) NOT NULL,
    `nameAr` VARCHAR(255) NULL,
    `altNameEn` VARCHAR(255) NULL,
    `altNameAr` VARCHAR(255) NULL,
    `shortDescEn` TEXT NULL,
    `shortDescAr` TEXT NULL,
    `mandateEn` TEXT NULL,
    `mandateAr` TEXT NULL,
    `descriptionEn` TEXT NULL,
    `descriptionAr` TEXT NULL,
    `focusAreasEn` JSON NULL,
    `focusAreasAr` JSON NULL,
    `icon` VARCHAR(40) NULL,
    `coverMediaId` VARCHAR(30) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `provenance` ENUM('VERIFIED_SOURCE', 'PROPOSED', 'DEMO') NOT NULL DEFAULT 'PROPOSED',
    `sourceRef` VARCHAR(255) NULL,
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

    UNIQUE INDEX `Programme_code_key`(`code`),
    UNIQUE INDEX `Programme_slug_key`(`slug`),
    INDEX `Programme_status_sortOrder_idx`(`status`, `sortOrder`),
    INDEX `Programme_kind_idx`(`kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProgrammeMedia` (
    `programmeId` VARCHAR(30) NOT NULL,
    `mediaId` VARCHAR(30) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `ProgrammeMedia_mediaId_idx`(`mediaId`),
    PRIMARY KEY (`programmeId`, `mediaId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Project` (
    `id` VARCHAR(30) NOT NULL,
    `code` VARCHAR(60) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `programmeId` VARCHAR(30) NULL,
    `nameEn` VARCHAR(255) NOT NULL,
    `nameAr` VARCHAR(255) NULL,
    `locationEn` VARCHAR(255) NULL,
    `locationAr` VARCHAR(255) NULL,
    `sourceFolder` VARCHAR(255) NULL,
    `provenance` ENUM('VERIFIED_SOURCE', 'PROPOSED', 'DEMO') NOT NULL DEFAULT 'PROPOSED',
    `sourceRef` VARCHAR(255) NULL,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `createdById` VARCHAR(30) NULL,
    `updatedById` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Project_code_key`(`code`),
    UNIQUE INDEX `Project_slug_key`(`slug`),
    INDEX `Project_programmeId_idx`(`programmeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Campaign` (
    `id` VARCHAR(30) NOT NULL,
    `code` VARCHAR(60) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `programmeId` VARCHAR(30) NULL,
    `projectId` VARCHAR(30) NULL,
    `titleEn` VARCHAR(255) NOT NULL,
    `titleAr` VARCHAR(255) NULL,
    `summaryEn` TEXT NULL,
    `summaryAr` TEXT NULL,
    `descriptionEn` TEXT NULL,
    `descriptionAr` TEXT NULL,
    `locationEn` VARCHAR(255) NULL,
    `locationAr` VARCHAR(255) NULL,
    `coverMediaId` VARCHAR(30) NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'USD',
    `suggestedAmounts` JSON NULL,
    `allowCustomAmount` BOOLEAN NOT NULL DEFAULT true,
    `minCustomAmount` DECIMAL(14, 2) NULL,
    `maxCustomAmount` DECIMAL(14, 2) NULL,
    `targetAmount` DECIMAL(14, 2) NULL,
    `startsAt` DATETIME(3) NULL,
    `endsAt` DATETIME(3) NULL,
    `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'PAUSED', 'COMPLETED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `provenance` ENUM('VERIFIED_SOURCE', 'PROPOSED', 'DEMO') NOT NULL DEFAULT 'PROPOSED',
    `sourceRef` VARCHAR(255) NULL,
    `approvedById` VARCHAR(30) NULL,
    `approvedAt` DATETIME(3) NULL,
    `approvalNote` TEXT NULL,
    `donationsOpen` BOOLEAN NOT NULL DEFAULT false,
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

    UNIQUE INDEX `Campaign_code_key`(`code`),
    UNIQUE INDEX `Campaign_slug_key`(`slug`),
    INDEX `Campaign_status_sortOrder_idx`(`status`, `sortOrder`),
    INDEX `Campaign_programmeId_idx`(`programmeId`),
    INDEX `Campaign_isFeatured_idx`(`isFeatured`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CampaignMedia` (
    `campaignId` VARCHAR(30) NOT NULL,
    `mediaId` VARCHAR(30) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `CampaignMedia_mediaId_idx`(`mediaId`),
    PRIMARY KEY (`campaignId`, `mediaId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MediaAsset` (
    `id` VARCHAR(30) NOT NULL,
    `code` VARCHAR(80) NULL,
    `storageDriver` ENUM('LOCAL', 'S3', 'WEB_STATIC') NOT NULL,
    `storageKey` VARCHAR(500) NOT NULL,
    `originalName` VARCHAR(255) NULL,
    `mimeType` VARCHAR(60) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `checksum` CHAR(64) NULL,
    `category` ENUM('BRAND', 'HERO', 'PROGRAMME', 'CAMPAIGN', 'GALLERY', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `altEn` VARCHAR(300) NULL,
    `altAr` VARCHAR(300) NULL,
    `captionEn` TEXT NULL,
    `captionAr` TEXT NULL,
    `credit` VARCHAR(255) NULL,
    `sourceFolder` VARCHAR(255) NULL,
    `consentStatus` ENUM('UNKNOWN', 'CONFIRMED', 'NOT_GRANTED') NOT NULL DEFAULT 'UNKNOWN',
    `provenance` ENUM('VERIFIED_SOURCE', 'PROPOSED', 'DEMO') NOT NULL DEFAULT 'PROPOSED',
    `uploadedById` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `MediaAsset_code_key`(`code`),
    UNIQUE INDEX `MediaAsset_storageKey_key`(`storageKey`),
    INDEX `MediaAsset_category_idx`(`category`),
    INDEX `MediaAsset_checksum_idx`(`checksum`),
    INDEX `MediaAsset_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ImpactStatistic` (
    `id` VARCHAR(30) NOT NULL,
    `code` VARCHAR(60) NOT NULL,
    `labelEn` VARCHAR(255) NOT NULL,
    `labelAr` VARCHAR(255) NULL,
    `descriptionEn` TEXT NULL,
    `descriptionAr` TEXT NULL,
    `value` DECIMAL(18, 2) NOT NULL,
    `unit` VARCHAR(40) NULL,
    `prefix` VARCHAR(10) NULL,
    `suffix` VARCHAR(10) NULL,
    `displayFormat` ENUM('NUMBER', 'COMPACT', 'CURRENCY', 'PERCENT') NOT NULL DEFAULT 'NUMBER',
    `programmeId` VARCHAR(30) NULL,
    `sourceRef` VARCHAR(255) NULL,
    `attributionEn` VARCHAR(255) NULL,
    `attributionAr` VARCHAR(255) NULL,
    `reportingPeriodEn` VARCHAR(120) NULL,
    `reportingPeriodAr` VARCHAR(120) NULL,
    `verificationStatus` ENUM('UNVERIFIED', 'VERIFIED', 'REJECTED') NOT NULL DEFAULT 'UNVERIFIED',
    `verifiedById` VARCHAR(30) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `provenance` ENUM('VERIFIED_SOURCE', 'PROPOSED', 'DEMO') NOT NULL DEFAULT 'PROPOSED',
    `publishedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(30) NULL,
    `updatedById` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `ImpactStatistic_code_key`(`code`),
    INDEX `ImpactStatistic_status_verificationStatus_sortOrder_idx`(`status`, `verificationStatus`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Faq` (
    `id` VARCHAR(30) NOT NULL,
    `code` VARCHAR(60) NULL,
    `questionEn` VARCHAR(500) NOT NULL,
    `questionAr` VARCHAR(500) NULL,
    `answerEn` TEXT NOT NULL,
    `answerAr` TEXT NULL,
    `category` VARCHAR(60) NOT NULL DEFAULT 'general',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `provenance` ENUM('VERIFIED_SOURCE', 'PROPOSED', 'DEMO') NOT NULL DEFAULT 'PROPOSED',
    `publishedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(30) NULL,
    `updatedById` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Faq_code_key`(`code`),
    INDEX `Faq_status_category_sortOrder_idx`(`status`, `category`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(30) NOT NULL,
    `actorId` VARCHAR(30) NULL,
    `actorEmail` VARCHAR(191) NULL,
    `action` VARCHAR(80) NOT NULL,
    `entityType` VARCHAR(60) NOT NULL,
    `entityId` VARCHAR(60) NULL,
    `metadata` JSON NULL,
    `ip` VARCHAR(64) NULL,
    `userAgent` VARCHAR(255) NULL,
    `requestId` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `AuditLog_actorId_idx`(`actorId`),
    INDEX `AuditLog_action_idx`(`action`),
    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `Permission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `AdminUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdminSession` ADD CONSTRAINT `AdminSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `AdminUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `AdminUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteSetting` ADD CONSTRAINT `SiteSetting_ogImageId_fkey` FOREIGN KEY (`ogImageId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Page` ADD CONSTRAINT `Page_ogImageId_fkey` FOREIGN KEY (`ogImageId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PageSection` ADD CONSTRAINT `PageSection_pageId_fkey` FOREIGN KEY (`pageId`) REFERENCES `Page`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PageSection` ADD CONSTRAINT `PageSection_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SectionItem` ADD CONSTRAINT `SectionItem_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `PageSection`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SectionItem` ADD CONSTRAINT `SectionItem_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Programme` ADD CONSTRAINT `Programme_coverMediaId_fkey` FOREIGN KEY (`coverMediaId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgrammeMedia` ADD CONSTRAINT `ProgrammeMedia_programmeId_fkey` FOREIGN KEY (`programmeId`) REFERENCES `Programme`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgrammeMedia` ADD CONSTRAINT `ProgrammeMedia_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `MediaAsset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_programmeId_fkey` FOREIGN KEY (`programmeId`) REFERENCES `Programme`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Campaign` ADD CONSTRAINT `Campaign_programmeId_fkey` FOREIGN KEY (`programmeId`) REFERENCES `Programme`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Campaign` ADD CONSTRAINT `Campaign_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Campaign` ADD CONSTRAINT `Campaign_coverMediaId_fkey` FOREIGN KEY (`coverMediaId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Campaign` ADD CONSTRAINT `Campaign_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `AdminUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CampaignMedia` ADD CONSTRAINT `CampaignMedia_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CampaignMedia` ADD CONSTRAINT `CampaignMedia_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `MediaAsset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaAsset` ADD CONSTRAINT `MediaAsset_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `AdminUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ImpactStatistic` ADD CONSTRAINT `ImpactStatistic_programmeId_fkey` FOREIGN KEY (`programmeId`) REFERENCES `Programme`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- Append-only audit log: block UPDATE and DELETE at the database level.
-- (Requires TRIGGER privilege; with binary logging on, log_bin_trust_function_creators=1 or SUPER.)
CREATE TRIGGER `AuditLog_block_update` BEFORE UPDATE ON `AuditLog` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditLog is append-only';

CREATE TRIGGER `AuditLog_block_delete` BEFORE DELETE ON `AuditLog` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditLog is append-only';
