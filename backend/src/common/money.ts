import { BadRequestException } from '@nestjs/common';

export const MAX_MONEY_CENTS = 999999999999999999n;

export function moneyToCents(value: string): bigint {
  if (typeof value !== 'string' || !/^-?\d{1,16}(?:\.\d{1,2})?$/.test(value)) {
    throw new BadRequestException('Invalid decimal money format');
  }
  const negative = value.startsWith('-');
  const raw = negative ? value.slice(1) : value;
  const [whole, fraction = ''] = raw.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > MAX_MONEY_CENTS) throw new BadRequestException('Amount overflow');
  return negative ? -cents : cents;
}

export function centsToMoney(value: bigint): string {
  if (value > MAX_MONEY_CENTS || value < -MAX_MONEY_CENTS) throw new BadRequestException('Amount overflow');
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? '-' : ''}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

export function checkAmount(value: string): bigint {
  const amount = moneyToCents(value);
  if (amount <= 0n) throw new BadRequestException('Amount must be greater than 0');
  return amount;
}
