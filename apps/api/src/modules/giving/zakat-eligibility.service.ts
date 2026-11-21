import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { ZakatEligibilityDecision } from '../../generated/prisma/client';
import type { ActorContext } from '../../common/types/auth-request';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { effectiveZakat } from './giving.rules';

export const ZAKAT_TARGET_TYPES = ['PROGRAMME', 'PROJECT', 'CAMPAIGN'] as const;
export type ZakatTargetType = (typeof ZAKAT_TARGET_TYPES)[number];

/**
 * Phase 14 — Zakat eligibility per programme / project (cause) / campaign.
 *
 *  - NOTHING is eligible by default. Eligibility exists only while the target's latest APPROVED decision says eligible=true and
 *    records BOTH the MEKI religious/finance authority reference AND SDI's acceptance of the accounting restriction.
 *  - One administrator requests (zakat.manage); a DIFFERENT administrator decides (zakat.approve). Every step is audited.
 *  - Revoking an approval is always allowed (it only reduces what can be offered) and takes effect immediately.
 *  - Decisions are never deleted or edited; a new approval supersedes the previous one. The system never infers eligibility.
 */
@Injectable()
export class ZakatEligibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async assertTarget(type: ZakatTargetType, id: string) {
    const where = { id, deletedAt: null };
    const found =
      type === 'PROGRAMME' ? await this.prisma.programme.findFirst({ where, select: { id: true, provenance: true } })
      : type === 'PROJECT' ? await this.prisma.project.findFirst({ where, select: { id: true, provenance: true } })
      : await this.prisma.campaign.findFirst({ where, select: { id: true, provenance: true } });
    if (!found) throw new NotFoundException({ message: 'Target not found', code: 'ZAKAT_TARGET_NOT_FOUND' });
    if (found.provenance === 'DEMO') throw new UnprocessableEntityException({ message: 'A DEMO record can never be Zakat-eligible', code: 'ZAKAT_TARGET_DEMO' });
  }

  /** Effective eligibility for several targets of one type (missing → false). */
  async effectiveMap(type: ZakatTargetType, ids: string[]): Promise<Map<string, boolean>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.zakatEligibilityDecision.findMany({ where: { targetType: type, targetId: { in: ids }, status: 'APPROVED' } });
    return new Map(ids.map((id) => [id, effectiveZakat(rows.filter((r) => r.targetId === id))]));
  }

  async isEligible(type: ZakatTargetType, id: string | null | undefined): Promise<boolean> {
    if (!id) return false;
    return (await this.effectiveMap(type, [id])).get(id) ?? false;
  }

  /** Admin overview: every programme / project / campaign with its effective state, pending request and history. */
  async overview() {
    const [programmes, projects, campaigns, decisions] = await Promise.all([
      this.prisma.programme.findMany({ where: { deletedAt: null, provenance: { not: 'DEMO' } }, select: { id: true, code: true, slug: true, nameEn: true, nameAr: true, kind: true }, orderBy: [{ number: 'asc' }, { code: 'asc' }] }),
      this.prisma.project.findMany({ where: { deletedAt: null, provenance: { not: 'DEMO' } }, select: { id: true, code: true, slug: true, nameEn: true, nameAr: true }, orderBy: { code: 'asc' } }),
      this.prisma.campaign.findMany({ where: { deletedAt: null, provenance: { not: 'DEMO' } }, select: { id: true, code: true, slug: true, titleEn: true, titleAr: true }, orderBy: { code: 'asc' } }),
      this.prisma.zakatEligibilityDecision.findMany({ orderBy: { requestedAt: 'desc' }, take: 500 }),
    ]);
    const row = (type: ZakatTargetType, t: { id: string; code: string; slug: string; nameEn: string; nameAr: string | null }) => {
      const mine = decisions.filter((d) => d.targetType === type && d.targetId === t.id);
      return { targetType: type, ...t, eligible: effectiveZakat(mine), pending: mine.find((d) => d.status === 'PENDING_APPROVAL') ?? null, history: mine.slice(0, 20) };
    };
    return {
      defaultEligible: false,
      targets: [
        ...programmes.map((p) => ({ ...row('PROGRAMME', p), kind: p.kind })),
        ...projects.map((p) => row('PROJECT', p)),
        ...campaigns.map((c) => row('CAMPAIGN', { id: c.id, code: c.code, slug: c.slug, nameEn: c.titleEn, nameAr: c.titleAr })),
      ],
    };
  }

  async request(input: { targetType: ZakatTargetType; targetId: string; eligible: boolean; authorityReference?: string; sdiAcceptanceReference?: string; note?: string }, actor: ActorContext) {
    await this.assertTarget(input.targetType, input.targetId);
    const authority = input.authorityReference?.trim() || null;
    const sdi = input.sdiAcceptanceReference?.trim() || null;
    if (input.eligible && (!authority || !sdi)) {
      throw new UnprocessableEntityException({ message: "Zakat eligibility needs the MEKI authority decision reference AND SDI's acceptance reference", code: 'ZAKAT_REFERENCES_REQUIRED' });
    }
    const pending = await this.prisma.zakatEligibilityDecision.findFirst({ where: { targetType: input.targetType, targetId: input.targetId, status: 'PENDING_APPROVAL' } });
    if (pending) throw new ConflictException({ message: 'A request is already awaiting a decision for this target', code: 'ZAKAT_REQUEST_PENDING', details: { id: pending.id } });
    const d = await this.prisma.zakatEligibilityDecision.create({
      data: { targetType: input.targetType, targetId: input.targetId, eligible: input.eligible, authorityReference: authority, sdiAcceptanceReference: sdi, requestNote: input.note?.trim().slice(0, 500) || null, requestedById: actor.userId },
    });
    await this.audit.record(actor, 'zakat.eligibility.request', 'ZakatEligibilityDecision', d.id, { targetType: d.targetType, targetId: d.targetId, eligible: d.eligible, authorityReference: authority, sdiAcceptanceReference: sdi });
    return d;
  }

  private async pending(id: string) {
    const d = await this.prisma.zakatEligibilityDecision.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Decision not found');
    if (d.status !== 'PENDING_APPROVAL') throw new ConflictException({ message: `This request is ${d.status}`, code: 'ZAKAT_REQUEST_CLOSED' });
    return d;
  }

  async approve(id: string, note: string | undefined, actor: ActorContext): Promise<ZakatEligibilityDecision> {
    const d = await this.pending(id);
    if (d.requestedById === actor.userId) throw new ForbiddenException({ message: 'A different administrator must decide this request (four-eyes rule)', code: 'FOUR_EYES_REQUIRED' });
    const now = new Date();
    const out = await this.prisma.$transaction(async (tx) => {
      await tx.zakatEligibilityDecision.updateMany({ where: { targetType: d.targetType, targetId: d.targetId, status: 'APPROVED' }, data: { status: 'SUPERSEDED' } });
      return tx.zakatEligibilityDecision.update({ where: { id }, data: { status: 'APPROVED', decidedById: actor.userId, decidedAt: now, decisionNote: note?.trim().slice(0, 500) || null } });
    });
    await this.audit.record(actor, 'zakat.eligibility.approve', 'ZakatEligibilityDecision', id, { targetType: d.targetType, targetId: d.targetId, eligible: d.eligible });
    return out;
  }

  async reject(id: string, note: string, actor: ActorContext) {
    const d = await this.pending(id);
    if (d.requestedById === actor.userId) throw new ForbiddenException({ message: 'A different administrator must decide this request (four-eyes rule)', code: 'FOUR_EYES_REQUIRED' });
    const out = await this.prisma.zakatEligibilityDecision.update({ where: { id }, data: { status: 'REJECTED', decidedById: actor.userId, decidedAt: new Date(), decisionNote: note.trim().slice(0, 500) } });
    await this.audit.record(actor, 'zakat.eligibility.reject', 'ZakatEligibilityDecision', id, { targetType: d.targetType, targetId: d.targetId });
    return out;
  }

  /** Withdraws the current approval immediately (no four-eyes needed: it only reduces what is offered). */
  async revoke(targetType: ZakatTargetType, targetId: string, reason: string, actor: ActorContext) {
    const current = await this.prisma.zakatEligibilityDecision.findMany({ where: { targetType, targetId, status: 'APPROVED' } });
    if (current.length === 0) throw new ConflictException({ message: 'There is no approved decision to revoke', code: 'ZAKAT_NOTHING_TO_REVOKE' });
    await this.prisma.zakatEligibilityDecision.updateMany({ where: { id: { in: current.map((c) => c.id) } }, data: { status: 'REVOKED', decisionNote: `Revoked: ${reason.trim().slice(0, 480)}` } });
    await this.audit.record(actor, 'zakat.eligibility.revoke', 'ZakatEligibilityDecision', current[0].id, { targetType, targetId, reason: reason.slice(0, 200) });
    return { targetType, targetId, eligible: false };
  }
}
