import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfGuard, PermissionsGuard, SessionAuthGuard } from './guards';
import { LogPasswordResetNotifier, PASSWORD_RESET_NOTIFIER } from './password-reset.notifier';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    SessionService,
    SessionAuthGuard,
    CsrfGuard,
    PermissionsGuard,
    { provide: PASSWORD_RESET_NOTIFIER, useClass: LogPasswordResetNotifier },
  ],
  exports: [PasswordService, SessionService, SessionAuthGuard, CsrfGuard, PermissionsGuard],
})
export class AuthModule {}
