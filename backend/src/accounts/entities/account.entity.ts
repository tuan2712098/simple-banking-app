import { Column, CreateDateColumn, DeleteDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, VersionColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  FROZEN = 'FROZEN',
  CLOSED = 'CLOSED',
}

export enum AccountTier {
  STANDARD = 'STANDARD',
  VIP = 'VIP',
}

@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'account_number', type: 'varchar', length: 30, unique: true })
  accountNumber: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: '0.00' })
  balance: string;

  @Column({ name: 'hold_amount', type: 'numeric', precision: 18, scale: 2, default: '0.00' })
  holdAmount: string;

  @Column({ type: 'varchar', length: 10, default: 'VND' })
  currency: string;

  @Column({ type: 'varchar', length: 12, default: AccountStatus.ACTIVE })
  status: AccountStatus;

  @Column({ type: 'varchar', length: 12, default: AccountTier.STANDARD })
  tier: AccountTier;

  @VersionColumn()
  version: number;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
