import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export class LoginDto {
  @ApiProperty({ example: 'admin@example.org' })
  @Transform(lower)
  @IsEmail()
  @MaxLength(191)
  email!: string;

  @ApiProperty({ format: 'password' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ format: 'password' }) @IsString() @MaxLength(128) currentPassword!: string;
  @ApiProperty({ format: 'password', minLength: 12 }) @IsString() @MaxLength(128) newPassword!: string;
}

export class PasswordResetRequestDto {
  @ApiProperty() @Transform(lower) @IsEmail() @MaxLength(191) email!: string;
}

export class PasswordResetConfirmDto {
  @ApiProperty() @IsString() @MinLength(20) @MaxLength(128) token!: string;
  @ApiProperty({ format: 'password', minLength: 12 }) @IsString() @MaxLength(128) newPassword!: string;
}
