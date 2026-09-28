import { IsEnum } from 'class-validator';
import { UserStatus } from '../../users/entities/user.entity';

export class UserStatusDto {
  @IsEnum(UserStatus)
  status: UserStatus;
}
