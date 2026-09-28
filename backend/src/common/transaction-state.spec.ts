import { changeTransactionStatus } from './transaction-state';
import { TransactionStatus as S } from '../transactions/entities/transaction.entity';

it('supports valid transaction transitions', () => {
  expect(changeTransactionStatus(S.INITIATED, S.PENDING_OTP)).toBe(S.PENDING_OTP);
  expect(changeTransactionStatus(S.INITIATED, S.PROCESSING)).toBe(S.PROCESSING);
  expect(changeTransactionStatus(S.PENDING_OTP, S.PROCESSING)).toBe(S.PROCESSING);
  expect(changeTransactionStatus(S.PROCESSING, S.COMPLETED)).toBe(S.COMPLETED);
  expect(changeTransactionStatus(S.COMPLETED, S.REVERSED)).toBe(S.REVERSED);
});

it('rejects invalid transitions', () => {
  expect(() => changeTransactionStatus(S.FAILED, S.COMPLETED)).toThrow();
  expect(() => changeTransactionStatus(S.REVERSED, S.COMPLETED)).toThrow();
  expect(() => changeTransactionStatus(S.COMPLETED, S.PROCESSING)).toThrow();
  expect(() => changeTransactionStatus(S.INITIATED, S.REVERSED)).toThrow();
});
