import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { ActorContext } from '../../common/types/auth-request';
import { defined, Paginated, parseSort } from '../../common/utils';
import type { DonorAdminQueryDto, UpdateDonorDto } from './donations.dto';

@Injectable()
export class DonorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: DonorAdminQueryDto) {
    const s = q.search?.trim();
    const where: Prisma.DonorWhereInput = {
      ...(q.includeAnonymized === 'true' ? {} : { anonymizedAt: null }),
      ...(s ? { OR: [{ email: { contains: s.toLowerCase() } }, { lastName: { contains: s } }, { firstName: { contains: s } }, { organizationName: { contains: s } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.donor.findMany({
        where,
        include: { _count: { select: { donations: true } } },
        orderBy: parseSort(q.sort, ['createdAt', 'lastName', 'email'], { createdAt: 'desc' }),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.donor.count({ where }),
    ]);
    return Paginated.of(items, total, q.page, q.pageSize);
  }

  async get(id: string) {
    const donor = await this.prisma.donor.findUnique({
      where: { id },
      include: {
        donations: {
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: { id: true, reference: true, amount: true, currency: true, frequency: true, status: true, paymentStatus: true, refundedAmount: true, isTest: true, confirmedAt: true, createdAt: true },
        },
        recurringDonations: { select: { id: true, reference: true, amount: true, currency: true, status: true, nextBillingDate: true } },
      },
    });
    if (!donor) throw new NotFoundException('Donor not found');
    return {
      ...donor,
      donations: donor.donations.map((d) => ({ ...d, amount: d.amount.toString(), refundedAmount: d.refundedAmount.toString() })),
      recurringDonations: donor.recurringDonations.map((r) => ({ ...r, amount: r.amount.toString() })),
    };
  }

  async update(id: string, dto: UpdateDonorDto, actor: ActorContext) {
    const donor = await this.get(id);
    if (donor.anonymizedAt) throw new UnprocessableEntityException('Anonymized donors cannot be edited');
    await this.prisma.donor.update({
      where: { id },
      data: { ...defined(dto), ...(dto.marketingConsent === false ? { marketingConsentAt: null } : {}) },
    });
    // Field names only — never personal values — in the audit trail.
    await this.audit.record(actor, 'donor.update', 'Donor', id, { fields: AuditService.changedFields(dto) });
    return this.get(id);
  }

  /**
   * Privacy/retention erasure. Personal data is removed; donations, ledger, refunds and issued receipt snapshots are
   * financial records and are retained (retention period is a MEKI legal decision — docs/10).
   * Refused while a recurring donation is still active.
   */
  async anonymize(id: string, reason: string, actor: ActorContext) {
    const donor = await this.get(id);
    if (donor.anonymizedAt) return donor;
    if (donor.recurringDonations.some((r) => ['ACTIVE', 'PAUSED', 'PAST_DUE', 'PENDING_ACTIVATION'].includes(r.status))) {
      throw new UnprocessableEntityException({ message: 'Cancel the donor’s recurring donations first', code: 'ACTIVE_RECURRING' });
    }
    await this.prisma.donor.update({
      where: { id },
      data: {
        firstName: 'Anonymized',
        lastName: 'Donor',
        email: `anonymized+${id}@invalid.invalid`,
        phone: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        region: null,
        postalCode: null,
        organizationName: null,
        marketingConsent: false,
        marketingConsentAt: null,
        anonymizedAt: new Date(),
      },
    });
    await this.prisma.donation.updateMany({ where: { donorId: id }, data: { donorMessage: null } });
    await this.audit.record(actor, 'donor.anonymize', 'Donor', id, { reason });
    return this.get(id);
  }
}
