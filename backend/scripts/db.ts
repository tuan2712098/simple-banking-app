import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { User } from '../src/users/entities/user.entity';
import { Account } from '../src/accounts/entities/account.entity';
import { AccountHistory } from '../src/accounts/entities/account-history.entity';
import { Transaction } from '../src/transactions/entities/transaction.entity';
import { LedgerEntry } from '../src/ledger/entities/ledger-entry.entity';
import { IdempotencyKey } from '../src/idempotency/entities/idempotency-key.entity';
import { AuditLog } from '../src/audit/entities/audit-log.entity';
import { RefreshSession } from '../src/security/entities/refresh-session.entity';
import { ReconciliationReport } from '../src/monitoring/entities/reconciliation-report.entity';

export const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE || 'simple_banking_app_final',
  synchronize: process.env.DB_SYNCHRONIZE === 'true',
  entities: [User, Account, AccountHistory, Transaction, LedgerEntry, IdempotencyKey, AuditLog, RefreshSession, ReconciliationReport],
});
