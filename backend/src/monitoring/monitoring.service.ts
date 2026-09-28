import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { ReconciliationReport } from './entities/reconciliation-report.entity';
import { TransactionsService } from '../transactions/transactions.service';

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(private readonly dataSource: DataSource, private readonly transactions: TransactionsService) {}

  @Cron('* * * * *')
  async inspectStalled() {
    return this.transactions.failStalled();
  }

  @Cron('55 23 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async reconcile() {
    const rows = await this.dataSource.query(`
      SELECT a.id AS account_id, a.balance::text AS stored_balance,
        COALESCE(SUM(CASE WHEN l.type = 'CREDIT' THEN l.amount WHEN l.type = 'DEBIT' THEN -l.amount ELSE 0 END), 0)::numeric(18,2)::text AS ledger_balance
      FROM accounts a LEFT JOIN ledger_entries l ON l.account_id = a.id
      GROUP BY a.id, a.balance
      HAVING a.balance <> COALESCE(SUM(CASE WHEN l.type = 'CREDIT' THEN l.amount WHEN l.type = 'DEBIT' THEN -l.amount ELSE 0 END), 0)
    `) as { account_id: string; stored_balance: string; ledger_balance: string }[];
    for (const row of rows) {
      await this.dataSource.getRepository(ReconciliationReport).save({
        accountId: row.account_id,
        storedBalance: row.stored_balance,
        ledgerBalance: row.ledger_balance,
      });
      this.logger.error(JSON.stringify({ event: 'balance_mismatch', ...row }));
    }
    return { checkedAt: new Date().toISOString(), mismatches: rows };
  }

  async health() {
    const started = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok', database: 'connected', testDatabase: (process.env.DB_DATABASE || '').endsWith('_test'), responseMs: Date.now() - started };
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable', database: 'disconnected' });
    }
  }

  reports() {
    return this.dataSource.getRepository(ReconciliationReport).find({ order: { createdAt: 'DESC' }, take: 100 });
  }
}
