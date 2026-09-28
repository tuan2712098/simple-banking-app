import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class TransferDto {
  @IsString()
  @Matches(/^\d{8,30}$/)
  toAccountNumber: string;

  @IsString()
  @Matches(/^(?!0+(?:\.0{1,2})?$)\d{1,16}(?:\.\d{1,2})?$/, {
    message: 'amount must be greater than 0 and have at most 2 decimal places',
  })
  amount: string;

  @Transform(({ value }) => typeof value === 'string' ? value.replace(/[<>]/g, '').trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  description: string;
}
