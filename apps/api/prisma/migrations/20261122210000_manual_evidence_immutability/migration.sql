-- Evidence is immutable. Corrections require a new submission and preserve the original.
CREATE TRIGGER `ManualPaymentEvidence_immutable` BEFORE UPDATE ON `ManualPaymentEvidence` FOR EACH ROW
BEGIN
  IF NOT (OLD.`targetType` <=> NEW.`targetType`)
     OR NOT (OLD.`targetId` <=> NEW.`targetId`)
     OR NOT (OLD.`reference` <=> NEW.`reference`)
     OR NOT (OLD.`evidenceReference` <=> NEW.`evidenceReference`)
     OR NOT (OLD.`externalPaymentId` <=> NEW.`externalPaymentId`)
     OR NOT (OLD.`amount` <=> NEW.`amount`)
     OR NOT (OLD.`currency` <=> NEW.`currency`)
     OR NOT (OLD.`occurredAt` <=> NEW.`occurredAt`)
     OR NOT (OLD.`formUrl` <=> NEW.`formUrl`)
     OR NOT (OLD.`classification` <=> NEW.`classification`)
     OR NOT (OLD.`emailMessageId` <=> NEW.`emailMessageId`)
     OR NOT (OLD.`emailFrom` <=> NEW.`emailFrom`)
     OR NOT (OLD.`emailTo` <=> NEW.`emailTo`)
     OR NOT (OLD.`emailReceivedAt` <=> NEW.`emailReceivedAt`)
     OR NOT (OLD.`protectedReference` <=> NEW.`protectedReference`)
     OR NOT (OLD.`originalSdiEmail` <=> NEW.`originalSdiEmail`)
     OR NOT (OLD.`note` <=> NEW.`note`)
     OR NOT (OLD.`reviewReason` <=> NEW.`reviewReason`)
     OR NOT (OLD.`submittedById` <=> NEW.`submittedById`)
     OR NOT (OLD.`createdAt` <=> NEW.`createdAt`)
     OR (OLD.`status` IN ('APPROVED','REJECTED') AND (
       NOT (OLD.`status` <=> NEW.`status`) OR NOT (OLD.`decidedById` <=> NEW.`decidedById`)
       OR NOT (OLD.`decidedAt` <=> NEW.`decidedAt`) OR NOT (OLD.`decisionNote` <=> NEW.`decisionNote`)))
     OR (OLD.`reportReconciledAt` IS NOT NULL AND (NOT (OLD.`reportReconciledAt` <=> NEW.`reportReconciledAt`) OR NOT (OLD.`reportImportId` <=> NEW.`reportImportId`))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'SDI payment evidence is immutable';
  END IF;
END;

CREATE TRIGGER `ManualPaymentEvidence_no_delete` BEFORE DELETE ON `ManualPaymentEvidence` FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'SDI payment evidence cannot be deleted';