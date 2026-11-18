-- CreateTable
CREATE TABLE `EventTicketConfig` (
    `id` VARCHAR(30) NOT NULL,
    `eventId` VARCHAR(30) NOT NULL,
    `ticketNameEn` VARCHAR(120) NOT NULL DEFAULT 'Individual ticket',
    `ticketPrice` DECIMAL(18, 3) NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'USD',
    `salesEnabled` BOOLEAN NOT NULL DEFAULT false,
    `maxTicketsPerBooking` INTEGER NOT NULL DEFAULT 10,
    `capacity` INTEGER NULL,
    `displayNameEn` VARCHAR(255) NOT NULL,
    `eventDateLabelEn` VARCHAR(120) NOT NULL,
    `venueLabelEn` VARCHAR(255) NOT NULL,
    `checkInNoteEn` VARCHAR(500) NULL,
    `provenance` ENUM('VERIFIED_SOURCE', 'PROPOSED', 'DEMO') NOT NULL DEFAULT 'PROPOSED',
    `updatedById` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EventTicketConfig_eventId_key`(`eventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventBooking` (
    `id` VARCHAR(30) NOT NULL,
    `publicReference` VARCHAR(24) NOT NULL,
    `accessTokenHash` CHAR(64) NOT NULL,
    `idempotencyKey` VARCHAR(80) NULL,
    `idempotencyRequestHash` CHAR(64) NULL,
    `eventId` VARCHAR(30) NOT NULL,
    `purchaserName` VARCHAR(160) NOT NULL,
    `purchaserEmail` VARCHAR(191) NOT NULL,
    `purchaserPhone` VARCHAR(40) NOT NULL,
    `guestCount` INTEGER NOT NULL,
    `unitPrice` DECIMAL(18, 3) NOT NULL,
    `totalAmount` DECIMAL(18, 3) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `classification` ENUM('CHARITABLE_DONATION', 'EVENT_TICKET_PAYMENT') NOT NULL DEFAULT 'EVENT_TICKET_PAYMENT',
    `bookingStatus` ENUM('PENDING', 'CONFIRMED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `paymentStatus` ENUM('UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'UNPAID',
    `paymentProvider` VARCHAR(40) NULL,
    `providerReference` VARCHAR(191) NULL,
    `refundedAmount` DECIMAL(18, 3) NOT NULL DEFAULT 0,
    `isTest` BOOLEAN NOT NULL DEFAULT false,
    `locale` VARCHAR(5) NOT NULL DEFAULT 'en',
    `paidAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `cancelReason` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EventBooking_publicReference_key`(`publicReference`),
    UNIQUE INDEX `EventBooking_idempotencyKey_key`(`idempotencyKey`),
    INDEX `EventBooking_eventId_bookingStatus_paymentStatus_idx`(`eventId`, `bookingStatus`, `paymentStatus`),
    INDEX `EventBooking_purchaserEmail_idx`(`purchaserEmail`),
    INDEX `EventBooking_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventBookingGuest` (
    `id` VARCHAR(30) NOT NULL,
    `bookingId` VARCHAR(30) NOT NULL,
    `position` INTEGER NOT NULL,
    `fullName` VARCHAR(160) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(40) NOT NULL,
    `dietaryRequirements` VARCHAR(500) NOT NULL,
    `isPurchaser` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EventBookingGuest_email_idx`(`email`),
    UNIQUE INDEX `EventBookingGuest_bookingId_position_key`(`bookingId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventTicket` (
    `id` VARCHAR(30) NOT NULL,
    `ticketNumber` VARCHAR(24) NOT NULL,
    `bookingId` VARCHAR(30) NOT NULL,
    `guestId` VARCHAR(30) NOT NULL,
    `eventId` VARCHAR(30) NOT NULL,
    `qrTokenHash` CHAR(64) NULL,
    `status` ENUM('PENDING', 'ISSUED', 'CHECKED_IN', 'REVOKED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `issuedAt` DATETIME(3) NULL,
    `checkedInAt` DATETIME(3) NULL,
    `checkedInById` VARCHAR(30) NULL,
    `revokedAt` DATETIME(3) NULL,
    `revokedById` VARCHAR(30) NULL,
    `revokeReason` VARCHAR(500) NULL,
    `pdfStorageKey` VARCHAR(200) NULL,
    `pdfGeneratedAt` DATETIME(3) NULL,
    `pdfSha256` CHAR(64) NULL,
    `tokenVersion` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EventTicket_ticketNumber_key`(`ticketNumber`),
    UNIQUE INDEX `EventTicket_guestId_key`(`guestId`),
    UNIQUE INDEX `EventTicket_qrTokenHash_key`(`qrTokenHash`),
    INDEX `EventTicket_eventId_status_idx`(`eventId`, `status`),
    INDEX `EventTicket_bookingId_idx`(`bookingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventBookingPaymentAttempt` (
    `id` VARCHAR(30) NOT NULL,
    `reference` VARCHAR(32) NOT NULL,
    `bookingId` VARCHAR(30) NOT NULL,
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

    UNIQUE INDEX `EventBookingPaymentAttempt_reference_key`(`reference`),
    INDEX `EventBookingPaymentAttempt_bookingId_status_idx`(`bookingId`, `status`),
    UNIQUE INDEX `EventBookingPaymentAttempt_provider_providerSessionRef_key`(`provider`, `providerSessionRef`),
    UNIQUE INDEX `EventBookingPaymentAttempt_provider_providerPaymentRef_key`(`provider`, `providerPaymentRef`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventBookingTransaction` (
    `id` VARCHAR(30) NOT NULL,
    `bookingId` VARCHAR(30) NOT NULL,
    `attemptId` VARCHAR(30) NULL,
    `webhookEventId` VARCHAR(30) NULL,
    `classification` ENUM('CHARITABLE_DONATION', 'EVENT_TICKET_PAYMENT') NOT NULL DEFAULT 'EVENT_TICKET_PAYMENT',
    `provider` VARCHAR(40) NOT NULL,
    `providerTransactionRef` VARCHAR(191) NOT NULL,
    `type` ENUM('AUTHORIZATION', 'CAPTURE', 'FAILURE', 'CANCELLATION', 'REFUND') NOT NULL,
    `status` ENUM('SUCCEEDED', 'FAILED') NOT NULL,
    `amount` DECIMAL(18, 3) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `failureCode` VARCHAR(80) NULL,
    `isTest` BOOLEAN NOT NULL DEFAULT false,
    `occurredAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EventBookingTransaction_bookingId_idx`(`bookingId`),
    INDEX `EventBookingTransaction_classification_type_status_idx`(`classification`, `type`, `status`),
    INDEX `EventBookingTransaction_occurredAt_idx`(`occurredAt`),
    UNIQUE INDEX `EventBookingTransaction_provider_providerTransactionRef_type_key`(`provider`, `providerTransactionRef`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EventTicketConfig` ADD CONSTRAINT `EventTicketConfig_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventBooking` ADD CONSTRAINT `EventBooking_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventBookingGuest` ADD CONSTRAINT `EventBookingGuest_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `EventBooking`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventTicket` ADD CONSTRAINT `EventTicket_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `EventBooking`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventTicket` ADD CONSTRAINT `EventTicket_guestId_fkey` FOREIGN KEY (`guestId`) REFERENCES `EventBookingGuest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventTicket` ADD CONSTRAINT `EventTicket_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventBookingPaymentAttempt` ADD CONSTRAINT `EventBookingPaymentAttempt_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `EventBooking`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventBookingTransaction` ADD CONSTRAINT `EventBookingTransaction_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `EventBooking`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventBookingTransaction` ADD CONSTRAINT `EventBookingTransaction_attemptId_fkey` FOREIGN KEY (`attemptId`) REFERENCES `EventBookingPaymentAttempt`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventBookingTransaction` ADD CONSTRAINT `EventBookingTransaction_webhookEventId_fkey` FOREIGN KEY (`webhookEventId`) REFERENCES `PaymentWebhookEvent`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Phase 5B history protection (same pattern as phase 3): ticket ledger is append-only; bookings, guests, tickets
-- and payment attempts are never deleted.
CREATE TRIGGER `EventBookingTransaction_block_update` BEFORE UPDATE ON `EventBookingTransaction` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'EventBookingTransaction is append-only';

CREATE TRIGGER `EventBookingTransaction_block_delete` BEFORE DELETE ON `EventBookingTransaction` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'EventBookingTransaction is append-only';

CREATE TRIGGER `EventBooking_block_delete` BEFORE DELETE ON `EventBooking` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Event bookings cannot be deleted';

CREATE TRIGGER `EventBookingGuest_block_delete` BEFORE DELETE ON `EventBookingGuest` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Booking guests cannot be deleted';

CREATE TRIGGER `EventTicket_block_delete` BEFORE DELETE ON `EventTicket` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Tickets cannot be deleted';

CREATE TRIGGER `EventBookingPaymentAttempt_block_delete` BEFORE DELETE ON `EventBookingPaymentAttempt` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment attempts cannot be deleted';
