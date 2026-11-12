import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { ALL_PERMISSIONS } from './permissions.catalog';

export class CreateAdminUserDto {
  @ApiProperty() @Transform(({ value }) => String(value).trim().toLowerCase()) @IsEmail() @MaxLength(191) email!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @ApiProperty({ description: 'Temporary password; user must change it at first login', minLength: 12 })
  @IsString() @MaxLength(128) temporaryPassword!: string;
  @ApiProperty({ type: [String], example: ['CONTENT_MANAGER'] })
  @IsArray() @ArrayUnique() @ArrayMaxSize(10) @IsString({ each: true }) roleKeys!: string[];
}

export class UpdateAdminUserDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(10) @IsString({ each: true }) roleKeys?: string[];
}

export class SetActiveDto {
  @ApiProperty() @IsBoolean() isActive!: boolean;
}

export class UsersQueryDto extends ListQueryDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => String) @IsIn(['true', 'false']) isActive?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) role?: string;
}

export class UpdateRolePermissionsDto {
  @ApiProperty({ type: [String], enum: ALL_PERMISSIONS })
  @IsArray() @ArrayUnique() @IsIn(ALL_PERMISSIONS, { each: true }) permissions!: string[];
}
