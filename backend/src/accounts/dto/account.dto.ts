import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { AccountStatus, AccountTier } from '../entities/account.entity';

export class AccountStatusDto {
  @IsEnum(AccountStatus)
  status: AccountStatus;
}

export class AccountTierDto {
  @IsEnum(AccountTier)
  tier: AccountTier;
}

export class EmailDto {
  @IsEmail()
  email: string;
}
