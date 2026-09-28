import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Account } from '../../accounts/entities/account.entity';

export enum TransactionType {
  TRANSFER = 'transfer',
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  REVERSAL = 'reversal',
}

export enum TransactionStatus {
  INITIATED = 'INITIATED',
  PENDING_OTP = 'PENDING_OTP',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REVERSED = 'REVERSED',
}

export enum ReviewStatus {
  NONE = 'none',
  FLAGGED = 'flagged',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Account, { nullable: true })
  @JoinColumn({ name: 'from_account_id' })
  fromAccount: Account | null;

  @ManyToOne(() => Account, { nullable: true })
  @JoinColumn({ name: 'to_account_id' })
  toAccount: Account | null;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  amount: string;

  @Column({ type: 'varchar', length: 20, default: TransactionType.TRANSFER })
  type: TransactionType;

  @Column({ type: 'varchar', length: 24, default: TransactionStatus.INITIATED })
  status: TransactionStatus;

  @Column({ type: 'varchar', length: 255, default: '' })
  description: string;

  @Column({ name: 'attempted_account_number', type: 'varchar', length: 30, nullable: true })
  attemptedAccountNumber: string | null;

  @Column({ name: 'original_transaction_id', type: 'uuid', nullable: true, unique: true })
  originalTransactionId: string | null;

  @ManyToOne(() => Transaction, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'original_transaction_id' })
  originalTransaction: Transaction | null;

  @Column({ name: 'otp_hash', type: 'varchar', nullable: true, select: false })
  otpHash: string | null;

  @Column({ name: 'otp_expires_at', type: 'timestamptz', nullable: true })
  otpExpiresAt: Date | null;

  @Column({ name: 'otp_attempts', type: 'int', default: 0 })
  otpAttempts: number;

  @Column({ name: 'review_status', type: 'varchar', length: 12, default: ReviewStatus.NONE })
  reviewStatus: ReviewStatus;

  @Column({ name: 'failure_reason', type: 'varchar', length: 255, nullable: true })
  failureReason: string | null;

  @Column({ name: 'teller_initiated', type: 'boolean', default: false })
  tellerInitiated: boolean;

  @Column({ name: 'approved_by_id', type: 'uuid', nullable: true })
  approvedById: string | null;

  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
