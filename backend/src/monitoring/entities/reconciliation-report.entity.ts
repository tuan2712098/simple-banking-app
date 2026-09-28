import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('reconciliation_reports')
export class ReconciliationReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ name: 'stored_balance', type: 'numeric', precision: 18, scale: 2 })
  storedBalance: string;

  @Column({ name: 'ledger_balance', type: 'numeric', precision: 18, scale: 2 })
  ledgerBalance: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
