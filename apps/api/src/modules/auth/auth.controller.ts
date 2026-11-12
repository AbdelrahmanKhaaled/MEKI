import { Body, Controller, Get, HttpCode, Post, Req, Res, SetMetadata } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Response } from 'express';
import { AppConfigService } from '../../config/app-config.service';
import { LOGIN_THROTTLE } from '../../common/rate-limit';
import { Actor, CurrentUser, Public, SkipCsrf } from '../../common/decorators';
import type { ActorContext, AuthenticatedRequest, AuthUser } from '../../common/types/auth-request';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { ALLOW_PENDING_PASSWORD_KEY } from './guards';
import { ChangePasswordDto, LoginDto, PasswordResetConfirmDto, PasswordResetRequestDto } from './auth.dto';

const AllowPendingPassword = () => SetMetadata(ALLOW_PENDING_PASSWORD_KEY, true);
const LOGIN_LIMIT = LOGIN_THROTTLE;

@ApiTags('Admin · Auth')
@Controller('admin/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly config: AppConfigService,
  ) {}

  private cookieOptions(expires?: Date): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.secureCookies,
      sameSite: 'strict',
      path: '/',
      ...(expires ? { expires } : {}),
    };
  }

  @Public()
  @SkipCsrf()
  @Throttle(LOGIN_LIMIT)
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Admin login. Sets HttpOnly session cookie; returns user + CSRF token.' })
  async login(@Body() dto: LoginDto, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.email, dto.password, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
      requestId: req.requestId,
    });
    res.cookie(this.config.sessionCookieName, result.token, this.cookieOptions(result.expiresAt));
    return { user: result.user, csrfToken: result.csrfToken, expiresAt: result.expiresAt };
  }

  @Post('logout')
  @HttpCode(200)
  @AllowPendingPassword()
  @ApiCookieAuth()
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOperation({ summary: 'Revoke the current session and clear the cookie' })
  async logout(@Req() req: AuthenticatedRequest, @Actor() actor: ActorContext, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.sessionId!, actor);
    res.clearCookie(this.config.sessionCookieName, this.cookieOptions());
    return { loggedOut: true };
  }

  @Get('me')
  @AllowPendingPassword()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Current authenticated admin with roles and effective permissions' })
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Get('csrf')
  @AllowPendingPassword()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Rotate and return the CSRF token for the current session' })
  async csrf(@Req() req: AuthenticatedRequest) {
    return { csrfToken: await this.sessions.rotateCsrf(req.sessionId!) };
  }

  @Post('password/change')
  @HttpCode(200)
  @AllowPendingPassword()
  @Throttle(LOGIN_LIMIT)
  @ApiCookieAuth()
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOperation({ summary: 'Change own password (revokes other sessions)' })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthUser,
    @Req() req: AuthenticatedRequest,
    @Actor() actor: ActorContext,
  ) {
    await this.auth.changePassword(user, req.sessionId!, dto.currentPassword, dto.newPassword, actor);
    return { changed: true };
  }

  @Public()
  @SkipCsrf()
  @Throttle(LOGIN_LIMIT)
  @Post('password/reset-request')
  @HttpCode(202)
  @ApiOperation({ summary: 'Request a password reset. Always 202 (no account enumeration). E-mail delivery pending provider.' })
  async resetRequest(@Body() dto: PasswordResetRequestDto, @Req() req: AuthenticatedRequest) {
    await this.auth.requestPasswordReset(dto.email, { ip: req.ip, userAgent: req.get('user-agent'), requestId: req.requestId });
    return { accepted: true };
  }

  @Public()
  @SkipCsrf()
  @Throttle(LOGIN_LIMIT)
  @Post('password/reset-confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Complete a password reset with the one-time token (revokes all sessions)' })
  async resetConfirm(@Body() dto: PasswordResetConfirmDto, @Req() req: AuthenticatedRequest) {
    await this.auth.confirmPasswordReset(dto.token, dto.newPassword, { ip: req.ip, userAgent: req.get('user-agent'), requestId: req.requestId });
    return { reset: true };
  }
}
