import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  Prisma,
  type ManualPaymentEvidence,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AppConfigService } from "../../config/app-config.service";
import type { ActorContext } from "../../common/types/auth-request";
import { AuditService } from "../audit/audit.service";
import { D } from "../donations/money";
import { BookingPaymentsService } from "../gala/booking-payments.service";
import { generateBookingAttemptReference } from "../gala/gala.rules";
import { createHash } from "node:crypto";

// Use the SAME unique provider/order namespace as the report importer.
const PROVIDER = "sdi_report";
export type EvidenceInput = {
  reference: string;
  evidenceReference?: string;
  externalPaymentId?: string;
  amount?: string;
  currency?: string;
  occurredAt?: string;
  formUrl?: string;
  classification?: string;
  emailMessageId?: string;
  emailFrom?: string;
  emailTo?: string;
  emailReceivedAt?: string;
  protectedReference?: string;
  originalSdiEmail?: boolean;
  note: string;
};

@Injectable()
export class ManualEvidenceService {
  constructor(
    private readonly db: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    private readonly bookings: BookingPaymentsService,
  ) {}

  private async target(reference: string, tx: Prisma.TransactionClient) {
    if (reference.startsWith("DN-")) {
      const d = await tx.donation.findUnique({ where: { reference } });
      if (!d || d.intentType !== "GALA_DONATION" || d.provider !== "sdi_hosted")
        throw new NotFoundException({ message: "Hosted Gala intent not found", code: "EVIDENCE_TARGET_NOT_FOUND" });
      return {
        type: "Donation",
        id: d.id,
        amount: d.amount,
        currency: d.currency,
        classification: d.charitableClassification,
        paid: d.paymentStatus === "PAID" || !!d.externalPaymentId,
        pending: d.status === "PENDING",
        createdAt: d.createdAt,
        isTest: d.isTest,
        formUrl: this.config.get("ZEFFY_GALA_GIVING_FORM_URL"),
      };
    }
    const b = await tx.eventBooking.findUnique({
      where: { publicReference: reference },
    });
    if (!b || b.ticketIssuer !== "ZEFFY")
      throw new NotFoundException({ message: "Hosted Gala booking not found", code: "EVIDENCE_TARGET_NOT_FOUND" });
    return {
      type: "EventBooking",
      id: b.id,
      amount: b.totalAmount,
      currency: b.currency,
      classification: null,
      paid: b.paymentStatus === "PAID" || b.paymentStatus === "REFUNDED",
      pending: b.bookingStatus === "PENDING",
      createdAt: b.createdAt,
      isTest: b.isTest,
      formUrl: this.config.get("ZEFFY_GALA_TICKET_FORM_URL"),
    };
  }

  private validate(
    e: EvidenceInput,
    t: Awaited<ReturnType<ManualEvidenceService["target"]>>,
  ) {
    if (e.evidenceReference && e.evidenceReference !== e.reference)
      throw new UnprocessableEntityException({ message: "Evidence reference does not match the selected intent", code: "EVIDENCE_REFERENCE_MISMATCH" });
    if (e.amount && !D(e.amount).equals(t.amount))
      throw new UnprocessableEntityException({ message: "Amount does not match the original intent", code: "EVIDENCE_AMOUNT_MISMATCH" });
    if (e.currency && e.currency !== t.currency)
      throw new UnprocessableEntityException({ message: "Currency does not match the original intent", code: "EVIDENCE_CURRENCY_MISMATCH" });
    if (e.formUrl && e.formUrl !== t.formUrl)
      throw new UnprocessableEntityException({ message: "Payment source does not match the approved form", code: "EVIDENCE_SOURCE_MISMATCH" });
    if (e.classification && e.classification !== t.classification)
      throw new UnprocessableEntityException({ message: "Classification does not match the original intent", code: "EVIDENCE_CLASSIFICATION_MISMATCH" });
    if (
      e.occurredAt &&
      (new Date(e.occurredAt) < t.createdAt ||
        new Date(e.occurredAt).getTime() > Date.now())
    )
      throw new UnprocessableEntityException({ message: "Payment date must follow the intent and cannot be in the future", code: "EVIDENCE_DATE_INVALID" });
    const missing = [
      "evidenceReference",
      "externalPaymentId",
      "amount",
      "currency",
      "occurredAt",
      "formUrl",
      "emailMessageId",
      "emailFrom",
      "emailTo",
      "emailReceivedAt",
      "protectedReference",
    ].filter((k) => !e[k as keyof EvidenceInput]);
    if (!e.originalSdiEmail)
      missing.push(
        "original SDI email (screenshots and donor forwards are insufficient)",
      );
    if (t.classification && !e.classification) missing.push("classification");
    return missing;
  }

  async submit(input: EvidenceInput, actor: ActorContext) {
    if (input.note.trim().length < 10) throw new UnprocessableEntityException({ message: "Document the evidence source and review reasoning", code: "EVIDENCE_NOTE_REQUIRED" });
    return this.db.$transaction(async (tx) => {
      const t = await this.target(input.reference, tx);
      if (t.paid || !t.pending)
        throw new ConflictException({ message: "The target is already paid or is no longer pending", code: "EVIDENCE_TARGET_NOT_PENDING" });
      const missing = this.validate(input, t);
      if (
        input.externalPaymentId &&
        (await tx.providerPayment.findUnique({
          where: {
            provider_providerPaymentId: {
              provider: PROVIDER,
              providerPaymentId: input.externalPaymentId,
            },
          },
        }))
      )
        throw new ConflictException({ message: "External payment ID is already recorded", code: "EXTERNAL_ID_ALREADY_RECORDED" });
      // Phase 14B: one external order can be claimed by only ONE live evidence request (any reference). A racing submission that
      // slips past this check is still stopped at approval by the unique (provider, order) record.
      if (
        input.externalPaymentId &&
        (await tx.manualPaymentEvidence.findFirst({
          where: { externalPaymentId: input.externalPaymentId, status: { in: ["PENDING_REVIEW", "AWAITING_APPROVAL", "APPROVED"] } },
          select: { id: true },
        }))
      )
        throw new ConflictException({ message: "This external payment ID is already claimed by another evidence request", code: "EXTERNAL_ID_ALREADY_CLAIMED" });
      const e = await tx.manualPaymentEvidence.create({
        data: {
          ...input,
          amount: input.amount ? D(input.amount) : null,
          occurredAt: input.occurredAt ? new Date(input.occurredAt) : null,
          emailReceivedAt: input.emailReceivedAt
            ? new Date(input.emailReceivedAt)
            : null,
          targetType: t.type,
          targetId: t.id,
          submittedById: actor.userId,
          status: missing.length ? "PENDING_REVIEW" : "AWAITING_APPROVAL",
          reviewReason: missing.length
            ? `Stronger SDI evidence required: ${missing.join(", ")}`.slice(
                0,
                500,
              )
            : null,
        },
      });
      // Never copy private email metadata into donor-visible donation history.
      await this.audit.record(
        actor,
        "sdi.evidence.submit",
        "ManualPaymentEvidence",
        e.id,
        { targetType: t.type, targetId: t.id, status: e.status },
        tx,
      );
      return this.view(e);
    });
  }

  view(e: ManualPaymentEvidence) {
    return { ...e, amount: e.amount?.toFixed(2) ?? null };
  }
  async detail(id: string) {
    const e = await this.db.manualPaymentEvidence.findUnique({ where: { id } });
    if (!e) throw new NotFoundException({ message: "Evidence not found", code: "EVIDENCE_NOT_FOUND" });
    const history = await this.db.auditLog.findMany({
      where: { entityType: "ManualPaymentEvidence", entityId: id },
      orderBy: { createdAt: "asc" },
      select: { action: true, actorId: true, createdAt: true, metadata: true },
    });
    return { ...this.view(e), history };
  }
  async list(status?: string, reference?: string) {
    const items = await this.db.manualPaymentEvidence.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(reference ? { reference } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return {
      approvalEnabled: this.config.get("SDI_MANUAL_CONFIRMATION_ENABLED"),
      items: items.map((e) => this.view(e)),
    };
  }

  async decide(
    id: string,
    decision: "APPROVE" | "REJECT",
    note: string,
    actor: ActorContext,
  ) {
    if (note.trim().length < 10) throw new UnprocessableEntityException({ message: "Document the decision reasoning", code: "EVIDENCE_NOTE_REQUIRED" });
    // No manual approval before the authentic SDI email template and matching procedure are validated.
    if (
      decision === "APPROVE" &&
      !this.config.get("SDI_MANUAL_CONFIRMATION_ENABLED")
    )
      throw new ServiceUnavailableException({
        code: "MANUAL_APPROVAL_DISABLED",
        message:
          "Authentic SDI email sample and reliable matching procedure must be validated first",
      });
    try {
      return await this.db.$transaction(
        async (tx) => {
          const e = await tx.manualPaymentEvidence.findUnique({
            where: { id },
          });
          if (!e) throw new NotFoundException({ message: "Evidence not found", code: "EVIDENCE_NOT_FOUND" });
          if (e.submittedById === actor.userId)
            throw new ForbiddenException({ message: "A different finance administrator must review this evidence", code: "FOUR_EYES_REQUIRED" });
          if (
            e.status === "APPROVED" &&
            decision === "APPROVE" &&
            e.decidedById === actor.userId
          )
            return this.view(e); // idempotent replay
          if (!["PENDING_REVIEW", "AWAITING_APPROVAL"].includes(e.status))
            throw new ConflictException({ message: "Evidence already decided", code: "EVIDENCE_ALREADY_DECIDED" });
          const t = await this.target(e.reference, tx);
          if (decision === "APPROVE") {
            const missing = this.validate(
              {
                ...e,
                amount: e.amount?.toFixed(2),
                occurredAt: e.occurredAt?.toISOString(),
                emailReceivedAt: e.emailReceivedAt?.toISOString(),
              } as EvidenceInput,
              t,
            );
            if (missing.length || e.status !== "AWAITING_APPROVAL")
              throw new UnprocessableEntityException({ message: "Stronger authoritative evidence required; submit a new evidence request", code: "EVIDENCE_INSUFFICIENT" });
            if (t.paid || !t.pending)
              throw new ConflictException({ message: "Target already paid or no longer pending", code: "EVIDENCE_TARGET_NOT_PENDING" });
            if (
              t.isTest &&
              ["staging", "production"].includes(this.config.get("NODE_ENV"))
            )
              throw new UnprocessableEntityException({ message: "Synthetic/test evidence cannot confirm payments in staging or production", code: "SYNTHETIC_NOT_ALLOWED" });
            await this.confirm(tx, e, t, actor);
          }
          const changed = await tx.manualPaymentEvidence.updateMany({
            where: { id, status: e.status },
            data: {
              status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
              decidedById: actor.userId,
              decidedAt: new Date(),
              decisionNote: note,
            },
          });
          if (changed.count !== 1)
            throw new ConflictException({ message: "Evidence changed concurrently", code: "EVIDENCE_CONFLICT" });
          await this.audit.record(
            actor,
            `sdi.evidence.${decision.toLowerCase()}`,
            "ManualPaymentEvidence",
            id,
            { targetType: t.type, targetId: t.id, note },
            tx,
          );
          return this.view(
            await tx.manualPaymentEvidence.findUniqueOrThrow({ where: { id } }),
          );
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30_000,
        },
      );
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2002", "P2034"].includes(err.code)
      )
        throw new ConflictException({ message: "Payment already claimed or concurrent update; refresh and retry", code: "EVIDENCE_CONFLICT" });
      throw err;
    }
  }

  private async confirm(
    tx: Prisma.TransactionClient,
    e: ManualPaymentEvidence,
    t: Awaited<ReturnType<ManualEvidenceService["target"]>>,
    actor: ActorContext,
  ) {
    await tx.providerPayment.create({
      data: {
        provider: PROVIDER,
        providerPaymentId: e.externalPaymentId!,
        status: "COMPLETED",
        type: t.isTest ? "manual_test" : "manual",
        amount: t.amount,
        eligibleAmount: t.amount,
        refundedAmount: 0,
        refundStatus: "none",
        currency: t.currency,
        classification:
          t.type === "Donation"
            ? "CHARITABLE_DONATION"
            : "EVENT_TICKET_PAYMENT",
        campaignCategory: t.type === "Donation" ? "GALA_DONATION" : null,
        items: [],
        correlationRef: e.reference,
        matchStatus: "CONFIRMED",
        matchedEntityType: t.type,
        matchedEntityId: t.id,
        matchReason: `Original SDI email evidence ${e.id}; second-admin approval`,
        providerCreatedAt: e.occurredAt!,
        lastSyncedAt: e.occurredAt!,
        lastEventId: `manual-evidence:${e.id}`,
      },
    });
    if (t.type === "Donation") {
      const moved = await tx.donation.updateMany({
        where: {
          id: t.id,
          paymentStatus: { not: "PAID" },
          externalPaymentId: null,
        },
        data: {
          status: "COMPLETED",
          paymentStatus: "PAID",
          confirmedAt: new Date(),
          externalPaymentId: e.externalPaymentId,
          reportedAmount: t.amount,
          reconciliationStatus: "VERIFIED",
          reconciledAt: new Date(),
        },
      });
      if (moved.count !== 1)
        throw new ConflictException({ message: "Intent changed concurrently", code: "EVIDENCE_CONFLICT" });
      await this.audit.record(
        actor,
        "giving.intent.verified",
        "Donation",
        t.id,
        { source: "SDI_EMAIL", evidenceId: e.id, orderId: e.externalPaymentId },
        tx,
      );
    } else {
      const event = await tx.paymentWebhookEvent.create({
        data: {
          provider: PROVIDER,
          providerEventId: `manual-evidence:${e.id}`,
          eventType: "manual.evidence.approved",
          signatureVerified: false,
          payloadHash: createHash("sha256").update(e.id).digest("hex"),
          payload: { evidenceId: e.id, source: "SDI_EMAIL" },
        },
      });
      const a = await tx.eventBookingPaymentAttempt.create({
        data: {
          bookingId: t.id,
          reference: generateBookingAttemptReference(),
          provider: PROVIDER,
          providerSessionRef: `manual:${e.id}`,
          amount: t.amount,
          currency: t.currency,
          isTest: t.isTest,
        },
      });
      const result = await this.bookings.handle(tx, event, {
        eventId: event.providerEventId,
        type: "payment.succeeded",
        occurredAt: e.occurredAt!,
        attemptReference: a.reference,
        sessionRef: a.providerSessionRef!,
        paymentRef: e.externalPaymentId!,
        amount: D(t.amount).toFixed(2),
        currency: t.currency,
      });
      if (result.status !== "PROCESSED")
        throw new ConflictException({ message: "Booking confirmation failed", code: "EVIDENCE_CONFLICT" });
      await tx.eventBooking.update({
        where: { id: t.id },
        data: {
          reportedTicketCount: (
            await tx.eventBooking.findUniqueOrThrow({ where: { id: t.id } })
          ).guestCount,
        },
      });
    }
  }
}
