import { BadRequestException } from '@nestjs/common';
import { centsToMoney, checkAmount, moneyToCents } from './money';

it('converts exact money without floating point', () => {
  expect(moneyToCents('100000.01')).toBe(10000001n);
  expect(moneyToCents('1.2')).toBe(120n);
  expect(moneyToCents('-2.50')).toBe(-250n);
  expect(centsToMoney(120n)).toBe('1.20');
  expect(centsToMoney(-123n)).toBe('-1.23');
});

it('accepts boundary values', () => {
  expect(checkAmount('0.01')).toBe(1n);
  expect(checkAmount('9999999999999999.99')).toBe(999999999999999999n);
  expect(centsToMoney(0n)).toBe('0.00');
});

it.each(['0', '0.00', '-1.00', '0.001', 'NaN', '1e2', '', '99999999999999999', '1,000', ' 2'])('rejects invalid amount %s', (value) => {
  expect(() => checkAmount(value)).toThrow(BadRequestException);
});

it('rejects format overflow and negative amounts', () => {
  expect(() => moneyToCents('12345678901234567890')).toThrow();
  expect(() => centsToMoney(9999999999999999999n)).toThrow();
  expect(() => checkAmount('-0.01')).toThrow();
});
