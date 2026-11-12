import { Body, Controller, Get, Module, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Actor, CurrentUser, RequirePermissions } from '../../common/decorators';
import type { ActorContext, AuthUser } from '../../common/types/auth-request';
import { CreateAdminUserDto, SetActiveDto, UpdateAdminUserDto, UpdateRolePermissionsDto, UsersQueryDto } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('Admin · Users & roles')
@ApiCookieAuth()
@Controller('admin')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('users')
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'List admin users (search by email/name, filter by role/isActive)' })
  list(@Query() q: UsersQueryDto) {
    return this.users.list(q);
  }

  @Get('users/:id')
  @RequirePermissions('users.read')
  get(@Param('id') id: string) {
    return this.users.get(id);
  }

  @Post('users')
  @RequirePermissions('users.manage')
  @ApiOperation({ summary: 'Create an admin user (no public registration exists). Forces password change at first login.' })
  create(@Body() dto: CreateAdminUserDto, @CurrentUser() user: AuthUser, @Actor() actor: ActorContext) {
    return this.users.create(dto, user, actor);
  }

  @Patch('users/:id')
  @RequirePermissions('users.manage')
  update(@Param('id') id: string, @Body() dto: UpdateAdminUserDto, @CurrentUser() user: AuthUser, @Actor() actor: ActorContext) {
    return this.users.update(id, dto, user, actor);
  }

  @Patch('users/:id/status')
  @RequirePermissions('users.manage')
  @ApiOperation({ summary: 'Activate/deactivate (deactivation revokes all sessions)' })
  setActive(@Param('id') id: string, @Body() dto: SetActiveDto, @CurrentUser() user: AuthUser, @Actor() actor: ActorContext) {
    return this.users.setActive(id, dto.isActive, user, actor);
  }

  @Get('roles')
  @RequirePermissions('roles.read')
  listRoles() {
    return this.users.listRoles();
  }

  @Get('permissions')
  @RequirePermissions('roles.read')
  listPermissions() {
    return this.users.listPermissions();
  }

  @Put('roles/:key/permissions')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Replace the permission set of a role (Super Admin role is fixed)' })
  setRolePermissions(@Param('key') key: string, @Body() dto: UpdateRolePermissionsDto, @Actor() actor: ActorContext) {
    return this.users.setRolePermissions(key, dto.permissions, actor);
  }
}

@Module({ controllers: [UsersController], providers: [UsersService] })
export class UsersModule {}
