-- AlterTable
ALTER TABLE `Donation` ADD COLUMN `idempotencyRequestHash` CHAR(64) NULL;

