import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { SessionService } from '../auth/session.service';
import type { ActorContext, AuthUser } from '../../common/types/auth-request';
import { Paginated, parseSort } from '../../common/utils';
import { SUPER_ADMIN } from './permissions.catalog';
import type { CreateAdminUserDto, UpdateAdminUserDto, UsersQueryDto } from './users.dto';

/** Never returns passwordHash or lockout internals beyond what the dashboard needs. */
export const safeUserSelect = {
  id: true,
  email: true,
  name: true,
  isActive: true,
  mustChangePassword: true,
  lastLoginAt: true,
  lockedUntil: true,
  createdAt: true,
  updatedAt: true,
  roles: { select: { role: { select: { key: true, name: true } } } },
} satisfies Prisma.AdminUserSelect;

type SafeUser = Prisma.AdminUserGetPayload<{ select: typeof safeUserSelect }>;
const present = (u: SafeUser) => ({ ...u, roles: u.roles.map((r) => r.role) });

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async list(q: UsersQueryDto) {
    const where: Prisma.AdminUserWhereInput = {
      ...(q.isActive ? { isActive: q.isActive === 'true' } : {}),
      ...(q.role ? { roles: { some: { role: { key: q.role } } } } : {}),
      ...(q.search ? { OR: [{ email: { contains: q.search } }, { name: { contains: q.search } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.adminUser.findMany({
        where,
        select: safeUserSelect,
        orderBy: parseSort(q.sort, ['createdAt', 'email', 'name', 'lastLoginAt'], { createdAt: 'desc' }),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.adminUser.count({ where }),
    ]);
    return Paginated.of(items.map(present), total, q.page, q.pageSize);
  }

  async get(id: string) {
    const user = await this.prisma.adminUser.findUnique({ where: { id }, select: safeUserSelect });
    if (!user) throw new NotFoundException('User not found');
    return present(user);
  }

  private async resolveRoles(keys: string[], actor: AuthUser) {
    if (!actor.isSuperAdmin && keys.includes(SUPER_ADMIN)) {
      throw new ForbiddenException('Only a Super Admin can grant the Super Admin role');
    }
    const roles = await this.prisma.role.findMany({ where: { key: { in: keys } } });
    if (roles.length !== keys.length) throw new BadRequestException('Unknown role key');
    return roles;
  }

  private assertCanManage(target: SafeUser, actor: AuthUser) {
    const targetIsSuper = target.roles.some((r) => r.role.key === SUPER_ADMIN);
    if (targetIsSuper && !actor.isSuperAdmin) throw new ForbiddenException('Only a Super Admin can modify a Super Admin');
  }

  private async assertNotLastSuperAdmin(userId: string) {
    const remaining = await this.prisma.adminUser.count({
      where: { id: { not: userId }, isActive: true, roles: { some: { role: { key: SUPER_ADMIN } } } },
    });
    if (remaining === 0) throw new BadRequestException('At least one active Super Admin must remain');
  }

  async create(dto: CreateAdminUserDto, actorUser: AuthUser, actor: ActorContext) {
    this.passwords.assertPolicy(dto.temporaryPassword, dto.email);
    const roles = await this.resolveRoles(dto.roleKeys, actorUser);
    const user = await this.prisma.adminUser.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash: await this.passwords.hash(dto.temporaryPassword),
        mustChangePassword: true,
        createdById: actor.userId,
        roles: { create: roles.map((r) => ({ roleId: r.id, assignedById: actor.userId })) },
      },
      select: safeUserSelect,
    });
    await this.audit.record(actor, 'user.create', 'AdminUser', user.id, { roles: dto.roleKeys });
    return present(user);
  }

  async update(id: string, dto: UpdateAdminUserDto, actorUser: AuthUser, actor: ActorContext) {
    const target = await this.prisma.adminUser.findUnique({ where: { id }, select: safeUserSelect });
    if (!target) throw new NotFoundException('User not found');
    this.assertCanManage(target, actorUser);

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (dto.roleKeys) {
      const roles = await this.resolveRoles(dto.roleKeys, actorUser);
      const wasSuper = target.roles.some((r) => r.role.key === SUPER_ADMIN);
      if (wasSuper && !dto.roleKeys.includes(SUPER_ADMIN)) await this.assertNotLastSuperAdmin(id);
      ops.push(
        this.prisma.userRole.deleteMany({ where: { userId: id } }),
        this.prisma.userRole.createMany({ data: roles.map((r) => ({ userId: id, roleId: r.id, assignedById: actor.userId })) }),
      );
    }
    if (dto.name !== undefined) ops.push(this.prisma.adminUser.update({ where: { id }, data: { name: dto.name } }));
    await this.prisma.$transaction(ops);
    await this.audit.record(actor, 'user.update', 'AdminUser', id, { fields: AuditService.changedFields(dto), roles: dto.roleKeys });
    return this.get(id);
  }

  async setActive(id: string, isActive: boolean, actorUser: AuthUser, actor: ActorContext) {
    if (id === actorUser.id && !isActive) throw new BadRequestException('You cannot deactivate your own account');
    const target = await this.prisma.adminUser.findUnique({ where: { id }, select: safeUserSelect });
    if (!target) throw new NotFoundException('User not found');
    this.assertCanManage(target, actorUser);
    if (!isActive && target.roles.some((r) => r.role.key === SUPER_ADMIN)) await this.assertNotLastSuperAdmin(id);

    await this.prisma.adminUser.update({ where: { id }, data: { isActive, ...(isActive ? { failedLoginCount: 0, lockedUntil: null } : {}) } });
    if (!isActive) await this.sessions.revokeAllForUser(id);
    await this.audit.record(actor, isActive ? 'user.activate' : 'user.deactivate', 'AdminUser', id);
    return this.get(id);
  }

  // ── roles ──
  async listRoles() {
    const roles = await this.prisma.role.findMany({
      orderBy: { createdAt: 'asc' },
      include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
    });
    return roles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      userCount: r._count.users,
      permissions: r.permissions.map((p) => p.permission.key).sort(),
    }));
  }

  listPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ group: 'asc' }, { key: 'asc' }] });
  }

  async setRolePermissions(roleKey: string, keys: string[], actor: ActorContext) {
    if (roleKey === SUPER_ADMIN) throw new BadRequestException('Super Admin permissions are fixed');
    const role = await this.prisma.role.findUnique({ where: { key: roleKey } });
    if (!role) throw new NotFoundException('Role not found');
    const perms = await this.prisma.permission.findMany({ where: { key: { in: keys } } });
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
      this.prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })) }),
    ]);
    await this.audit.record(actor, 'role.permissions_update', 'Role', role.id, { roleKey, permissions: keys });
    return (await this.listRoles()).find((r) => r.key === roleKey);
  }
}
