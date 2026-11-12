import { BadRequestException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

/** argon2id hashing (OWASP-recommended parameters) + password policy. */
@Injectable()
export class PasswordService {
  private static readonly options = {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    raw: false,
  } as const;
  /** Pre-computed hash used to equalise timing when the account does not exist. */
  private dummyHash?: Promise<string>;

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, PasswordService.options);
  }

  async verify(hash: string, plain: string) {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  async verifyDummy(plain: string) {
    this.dummyHash ??= this.hash('dummy-password-for-timing-equalisation');
    const dummy = await this.dummyHash;
    await this.verify(dummy, plain);
    return false;
  }

  assertPolicy(password: string, email?: string) {
    const problems: string[] = [];
    if (password.length < PASSWORD_MIN) problems.push(`must be at least ${PASSWORD_MIN} characters`);
    if (password.length > PASSWORD_MAX) problems.push(`must be at most ${PASSWORD_MAX} characters`);
    if (!/[a-zA-Z]/.test(password) || !/[0-9\W_]/.test(password)) problems.push('must mix letters with numbers or symbols');
    if (email && password.toLowerCase().includes(email.split('@')[0].toLowerCase())) problems.push('must not contain the email name');
    if (problems.length) {
      throw new BadRequestException({ message: 'Password does not meet the policy', code: 'WEAK_PASSWORD', details: problems });
    }
  }
}
