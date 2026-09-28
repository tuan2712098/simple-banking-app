import { Matches } from 'class-validator';

export class MoneyDto {
  @Matches(/^(?!0+(?:\.0{1,2})?$)\d{1,16}(?:\.\d{1,2})?$/)
  amount: string;
}

export class DepositDto extends MoneyDto {
  @Matches(/^\d{8,30}$/)
  accountNumber: string;
}
