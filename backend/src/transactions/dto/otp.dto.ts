import { IsUUID, Matches } from 'class-validator';

export class ConfirmOtpDto {
  @IsUUID()
  transactionId: string;

  @Matches(/^\d{6}$/)
  otp: string;
}
