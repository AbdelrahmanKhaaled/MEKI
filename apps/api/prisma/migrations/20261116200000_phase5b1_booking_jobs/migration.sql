-- CreateTable
CREATE TABLE `EventBookingJob` (
    `id` VARCHAR(30) NOT NULL,
    `bookingId` VARCHAR(30) NOT NULL,
    `type` ENUM('TICKET_PDF', 'EMAIL') NOT NULL,
    `template` VARCHAR(40) NULL,
    `ticketId` VARCHAR(30) NULL,
    `dedupeKey` VARCHAR(120) NOT NULL,
    `status` ENUM('PENDING', 'RUNNING', 'DONE', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `nextRunAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lockedUntil` DATETIME(3) NULL,
    `lastError` VARCHAR(500) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EventBookingJob_dedupeKey_key`(`dedupeKey`),
    INDEX `EventBookingJob_status_nextRunAt_idx`(`status`, `nextRunAt`),
    INDEX `EventBookingJob_bookingId_idx`(`bookingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EventBookingJob` ADD CONSTRAINT `EventBookingJob_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `EventBooking`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

