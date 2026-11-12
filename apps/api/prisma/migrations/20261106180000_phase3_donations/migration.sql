-- AlterTable
ALTER TABLE `DonationSetting` ADD COLUMN `receiptFooterAr` TEXT NULL,
    ADD COLUMN `receiptFooterEn` TEXT NULL,
    ADD COLUMN `receiptIssuerNameAr` VARCHAR(255) NULL,
    ADD COLUMN `receiptIssuerNameEn` VARCHAR(255) NULL,
    ADD COLUMN `receiptTaxId` VARCHAR(80) NULL,
    ADD COLUMN `receiptTaxIdLabel` VARCHAR(80) NULL;

-- CreateTable
CREATE TABLE `Currency` (
    `code` CHAR(3) NOT NULL,
    `nameEn` VARCHAR(80) NOT NULL,
    `nameAr` VARCHAR(80) NULL,
    `symbol` VARCHAR(8) NULL,
    `minorUnits` INTEGER NOT NULL DEFAULT 2,
    `isEnabled` BOOLEAN NOT NULL DEFAULT false,
    `suggestedAmounts` JSON NULL,
    `minAmount` DECIMAL(18, 3) NULL,
    `maxAmount` DECIMAL(18, 3) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `provenance` ENUM('VERIFIED_SOURCE', 'PROPOSED', 'DEMO') NOT NULL DEFAULT 'PROPOSED',
    `updatedById` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentProvider` (
    `code` VARCHAR(40) NOT NULL,
    `displayName` VARCHAR(120) NOT NULL,
    `isEnabled` BOOLEAN NOT NULL DEFAULT false,
    `isTestProvider` BOOLEAN NOT NULL DEFAULT false,
    `supportsRecurring` BOOLEAN NOT NULL DEFAULT false,
    `supportsRefunds` BOOLEAN NOT NULL DEFAULT false,
    `supportsPartialRefund` BOOLEAN NOT NULL DEFAULT false,
    `supportedCurrencies` JSON NULL,
    `updatedById` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Donor` (
    `id` VARCHAR(30) NOT NULL,
    `firstName` VARCHAR(120) NOT NULL,
    `lastName` VARCHAR(120) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(40) NULL,
    `countryCode` CHAR(2) NULL,
    `addressLine1` VARCHAR(255) NULL,
    `addressLine2` VARCHAR(255) NULL,
    `city` VARCHAR(120) NULL,
    `region` VARCHAR(120) NULL,
    `postalCode` VARCHAR(20) NULL,
    `preferredLocale` VARCHAR(5) NOT NULL DEFAULT 'en',
    `donorType` ENUM('INDIVIDUAL', 'ORGANIZATION') NOT NULL DEFAULT 'INDIVIDUAL',
    `organizationName` VARCHAR(255) NULL,
    `marketingConsent` BOOLEAN NOT NULL DEFAULT false,
    `marketingConsentAt` DATETIME(3) NULL,
    `privacyConsentAt` DATETIME(3) NOT NULL,
    `privacyPolicyVersion` VARCHAR(40) NULL,
    `anonymizedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Donor_email_idx`(`email`),
    INDEX `Donor_lastName_firstName_idx`(`lastName`, `firstName`),
    INDEX `Donor_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Donation` (
    `id` VARCHAR(30) NOT NULL,
    `reference` VARCHAR(24) NOT NULL,
    `accessTokenHash` CHAR(64) NOT NULL,
    `idempotencyKey` VARCHAR(80) NULL,
    `donorId` VARCHAR(30) NOT NULL,
    `amount` DECIMAL(18, 3) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `frequency` ENUM('ONE_TIME', 'MONTHLY') NOT NULL DEFAULT 'ONE_TIME',
    `status` ENUM('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `paymentStatus` ENUM('UNPAID', 'AUTHORIZED', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED') NOT NULL DEFAULT 'UNPAID',
    `refundedAmount` DECIMAL(18, 3) NOT NULL DEFAULT 0,
    `isAnonymous` BOOLEAN NOT NULL DEFAULT false,
    `donorMessage` VARCHAR(500) NULL,
    `provider` VARCHAR(40) NULL,
    `isTest` BOOLEAN NOT NULL DEFAULT false,
    `locale` VARCHAR(5) NOT NULL DEFAULT 'en',
    `source` VARCHAR(60) NULL,
    `utmSource` VARCHAR(120) NULL,
    `utmMedium` VARCHAR(120) NULL,
    `utmCampaign` VARCHAR(120) NULL,
    `sourceEventId` VARCHAR(30) NULL,
    `recurringDonationId` VARCHAR(30) NULL,
    `confirmedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Donation_reference_key`(`reference`),
    UNIQUE INDEX `Donation_idempotencyKey_key`(`idempotencyKey`),
    INDEX `Donation_status_paymentStatus_idx`(`status`, `paymentStatus`),
    INDEX `Donation_currency_idx`(`currency`),
    INDEX `Donation_donorId_idx`(`donorId`),
    INDEX `Donation_createdAt_idx`(`createdAt`),
    INDEX `Donation_recurringDonationId_idx`(`recurringDonationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DonationAllocation` (
    `id` VARCHAR(30) NOT NULL,
    `donationId` VARCHAR(30) NOT NULL,
    `designation` ENUM('GENERAL_FUND', 'CAMPAIGN', 'PROGRAMME') NOT NULL,
    `campaignId` VARCHAR(30) NULL,
    `programmeId` VARCHAR(30) NULL,
    `amount` DECIMAL(18, 3) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DonationAllocation_donationId_idx`(`donationId`),
    INDEX `DonationAllocation_campaignId_idx`(`campaignId`),
    INDEX `DonationAllocation_programmeId_idx`(`programmeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RecurringDonation` (
    `id` VARCHAR(30) NOT NULL,
    `reference` VARCHAR(24) NOT NULL,
    `donorId` VARCHAR(30) NOT NULL,
    `designation` ENUM('GENERAL_FUND', 'CAMPAIGN', 'PROGRAMME') NOT NULL,
    `campaignId` VARCHAR(30) NULL,
    `programmeId` VARCHAR(30) NULL,
    `amount` DECIMAL(18, 3) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `interval` ENUM('MONTHLY') NOT NULL DEFAULT 'MONTHLY',
    `intervalCount` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('PENDING_ACTIVATION', 'ACTIVE', 'PAUSED', 'PAST_DUE', 'CANCELLED', 'FAILED') NOT NULL DEFAULT 'PENDING_ACTIVATION',
    `provider` VARCHAR(40) NOT NULL,
    `providerAgreementRef` VARCHAR(191) NULL,
    `isTest` BOOLEAN NOT NULL DEFAULT false,
    `startDate` DATETIME(3) NULL,
    `nextBillingDate` DATETIME(3) NULL,
    `lastChargedAt` DATETIME(3) NULL,
    `failedAttemptCount` INTEGER NOT NULL DEFAULT 0,
    `maxRetryAttempts` INTEGER NOT NULL DEFAULT 3,
    `pausedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `cancelReason` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RecurringDonation_reference_key`(`reference`),
    INDEX `RecurringDonation_status_nextBillingDate_idx`(`status`, `nextBillingDate`),
    INDEX `RecurringDonation_donorId_idx`(`donorId`),
    UNIQUE INDEX `RecurringDonation_provider_providerAgreementRef_key`(`provider`, `providerAgreementRef`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentAttempt` (
    `id` VARCHAR(30) NOT NULL,
    `reference` VARCHAR(32) NOT NULL,
    `donationId` VARCHAR(30) NOT NULL,
    `provider` VARCHAR(40) NOT NULL,
    `providerSessionRef` VARCHAR(191) NULL,
    `providerPaymentRef` VARCHAR(191) NULL,
    `amount` DECIMAL(18, 3) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `status` ENUM('CREATED', 'REQUIRES_ACTION', 'AUTHORIZED', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'CREATED',
    `checkoutUrl` VARCHAR(1000) NULL,
    `failureCode` VARCHAR(80) NULL,
    `failureReason` VARCHAR(500) NULL,
    `isTest` BOOLEAN NOT NULL DEFAULT false,
    `initiatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PaymentAttempt_reference_key`(`reference`),
    INDEX `PaymentAttempt_donationId_status_idx`(`donationId`, `status`),
    UNIQUE INDEX `PaymentAttempt_provider_providerSessionRef_key`(`provider`, `providerSessionRef`),
    UNIQUE INDEX `PaymentAttempt_provider_providerPaymentRef_key`(`provider`, `providerPaymentRef`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentTransaction` (
    `id` VARCHAR(30) NOT NULL,
    `donationId` VARCHAR(30) NOT NULL,
    `paymentAttemptId` VARCHAR(30) NULL,
    `refundId` VARCHAR(30) NULL,
    `webhookEventId` VARCHAR(30) NULL,
    `provider` VARCHAR(40) NOT NULL,
    `providerTransactionRef` VARCHAR(191) NOT NULL,
    `type` ENUM('AUTHORIZATION', 'CAPTURE', 'FAILURE', 'CANCELLATION', 'REFUND') NOT NULL,
    `status` ENUM('SUCCEEDED', 'FAILED') NOT NULL,
    `amount` DECIMAL(18, 3) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `settlementAmount` DECIMAL(18, 3) NULL,
    `settlementCurrency` CHAR(3) NULL,
    `exchangeRate` DECIMAL(18, 8) NULL,
    `feeAmount` DECIMAL(18, 3) NULL,
    `failureCode` VARCHAR(80) NULL,
    `isTest` BOOLEAN NOT NULL DEFAULT false,
    `occurredAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PaymentTransaction_donationId_idx`(`donationId`),
    INDEX `PaymentTransaction_type_status_idx`(`type`, `status`),
    INDEX `PaymentTransaction_currency_idx`(`currency`),
    INDEX `PaymentTransaction_occurredAt_idx`(`occurredAt`),
    UNIQUE INDEX `PaymentTransaction_provider_providerTransactionRef_type_key`(`provider`, `providerTransactionRef`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentWebhookEvent` (
    `id` VARCHAR(30) NOT NULL,
    `provider` VARCHAR(40) NOT NULL,
    `providerEventId` VARCHAR(191) NOT NULL,
    `eventType` VARCHAR(80) NOT NULL,
    `signatureVerified` BOOLEAN NOT NULL,
    `payloadHash` CHAR(64) NOT NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED') NOT NULL DEFAULT 'RECEIVED',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastError` VARCHAR(1000) NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processedAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PaymentWebhookEvent_status_receivedAt_idx`(`status`, `receivedAt`),
    UNIQUE INDEX `PaymentWebhookEvent_provider_providerEventId_key`(`provider`, `providerEventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Refund` (
    `id` VARCHAR(30) NOT NULL,
    `reference` VARCHAR(24) NOT NULL,
    `donationId` VARCHAR(30) NOT NULL,
    `amount` DECIMAL(18, 3) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `reason` VARCHAR(1000) NOT NULL,
    `status` ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSING', 'SUCCEEDED', 'FAILED') NOT NULL DEFAULT 'REQUESTED',
    `requestedById` VARCHAR(30) NOT NULL,
    `decidedById` VARCHAR(30) NULL,
    `decisionNote` VARCHAR(1000) NULL,
    `executedById` VARCHAR(30) NULL,
    `provider` VARCHAR(40) NULL,
    `providerRefundRef` VARCHAR(191) NULL,
    `failureReason` VARCHAR(500) NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `decidedAt` DATETIME(3) NULL,
    `executedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Refund_reference_key`(`reference`),
    INDEX `Refund_donationId_idx`(`donationId`),
    INDEX `Refund_status_idx`(`status`),
    UNIQUE INDEX `Refund_provider_providerRefundRef_key`(`provider`, `providerRefundRef`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DonationReceipt` (
    `id` VARCHAR(30) NOT NULL,
    `receiptNumber` VARCHAR(32) NOT NULL,
    `donationId` VARCHAR(30) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('ISSUED', 'VOID') NOT NULL DEFAULT 'ISSUED',
    `locale` VARCHAR(5) NOT NULL DEFAULT 'en',
    `snapshot` JSON NOT NULL,
    `issuedById` VARCHAR(30) NULL,
    `replacesReceiptId` VARCHAR(30) NULL,
    `voidReason` VARCHAR(500) NULL,
    `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `voidedAt` DATETIME(3) NULL,

    UNIQUE INDEX `DonationReceipt_receiptNumber_key`(`receiptNumber`),
    INDEX `DonationReceipt_status_idx`(`status`),
    UNIQUE INDEX `DonationReceipt_donationId_version_key`(`donationId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReceiptSequence` (
    `year` INTEGER NOT NULL,
    `lastNumber` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Donation` ADD CONSTRAINT `Donation_donorId_fkey` FOREIGN KEY (`donorId`) REFERENCES `Donor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Donation` ADD CONSTRAINT `Donation_sourceEventId_fkey` FOREIGN KEY (`sourceEventId`) REFERENCES `Event`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Donation` ADD CONSTRAINT `Donation_recurringDonationId_fkey` FOREIGN KEY (`recurringDonationId`) REFERENCES `RecurringDonation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DonationAllocation` ADD CONSTRAINT `DonationAllocation_donationId_fkey` FOREIGN KEY (`donationId`) REFERENCES `Donation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DonationAllocation` ADD CONSTRAINT `DonationAllocation_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DonationAllocation` ADD CONSTRAINT `DonationAllocation_programmeId_fkey` FOREIGN KEY (`programmeId`) REFERENCES `Programme`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecurringDonation` ADD CONSTRAINT `RecurringDonation_donorId_fkey` FOREIGN KEY (`donorId`) REFERENCES `Donor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecurringDonation` ADD CONSTRAINT `RecurringDonation_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecurringDonation` ADD CONSTRAINT `RecurringDonation_programmeId_fkey` FOREIGN KEY (`programmeId`) REFERENCES `Programme`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentAttempt` ADD CONSTRAINT `PaymentAttempt_donationId_fkey` FOREIGN KEY (`donationId`) REFERENCES `Donation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentTransaction` ADD CONSTRAINT `PaymentTransaction_donationId_fkey` FOREIGN KEY (`donationId`) REFERENCES `Donation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentTransaction` ADD CONSTRAINT `PaymentTransaction_paymentAttemptId_fkey` FOREIGN KEY (`paymentAttemptId`) REFERENCES `PaymentAttempt`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentTransaction` ADD CONSTRAINT `PaymentTransaction_refundId_fkey` FOREIGN KEY (`refundId`) REFERENCES `Refund`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentTransaction` ADD CONSTRAINT `PaymentTransaction_webhookEventId_fkey` FOREIGN KEY (`webhookEventId`) REFERENCES `PaymentWebhookEvent`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Refund` ADD CONSTRAINT `Refund_donationId_fkey` FOREIGN KEY (`donationId`) REFERENCES `Donation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Refund` ADD CONSTRAINT `Refund_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `AdminUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Refund` ADD CONSTRAINT `Refund_decidedById_fkey` FOREIGN KEY (`decidedById`) REFERENCES `AdminUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DonationReceipt` ADD CONSTRAINT `DonationReceipt_donationId_fkey` FOREIGN KEY (`donationId`) REFERENCES `Donation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Financial integrity: the payment ledger is append-only; financial records are never deleted.
CREATE TRIGGER `PaymentTransaction_block_update` BEFORE UPDATE ON `PaymentTransaction` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'PaymentTransaction is append-only';

CREATE TRIGGER `PaymentTransaction_block_delete` BEFORE DELETE ON `PaymentTransaction` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'PaymentTransaction is append-only';

CREATE TRIGGER `Donation_block_delete` BEFORE DELETE ON `Donation` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Donations cannot be deleted';

CREATE TRIGGER `DonationAllocation_block_delete` BEFORE DELETE ON `DonationAllocation` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Donation allocations cannot be deleted';

CREATE TRIGGER `Refund_block_delete` BEFORE DELETE ON `Refund` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Refunds cannot be deleted';

CREATE TRIGGER `DonationReceipt_block_delete` BEFORE DELETE ON `DonationReceipt` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Receipts cannot be deleted';
