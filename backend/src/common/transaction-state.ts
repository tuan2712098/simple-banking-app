import { BadRequestException } from '@nestjs/common';
import { TransactionStatus } from '../transactions/entities/transaction.entity';

const transitions: Record<TransactionStatus, TransactionStatus[]> = {
  [TransactionStatus.INITIATED]: [TransactionStatus.PENDING_OTP, TransactionStatus.PROCESSING, TransactionStatus.FAILED],
  [TransactionStatus.PENDING_OTP]: [TransactionStatus.PROCESSING, TransactionStatus.FAILED],
  [TransactionStatus.PROCESSING]: [TransactionStatus.COMPLETED, TransactionStatus.FAILED],
  [TransactionStatus.COMPLETED]: [TransactionStatus.REVERSED],
  [TransactionStatus.FAILED]: [],
  [TransactionStatus.REVERSED]: [],
};

export function changeTransactionStatus(current: TransactionStatus, next: TransactionStatus): TransactionStatus {
  if (!transitions[current]?.includes(next)) throw new BadRequestException(`Invalid transaction transition: ${current} -> ${next}`);
  return next;
}
