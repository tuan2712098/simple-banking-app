import 'reflect-metadata';
import 'dotenv/config';
import { Client } from 'pg';
import { dataSource } from './db';
import { Account } from '../src/accounts/entities/account.entity';
import { LedgerEntry, LedgerEntryType } from '../src/ledger/entities/ledger-entry.entity';
import { moneyToCents } from '../src/common/money';

async function main() {
  const pg = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });
  await pg.connect();
  try {
    await pg.query('BEGIN');
    await pg.query('ALTER TABLE users ALTER COLUMN role DROP DEFAULT');
    await pg.query('ALTER TABLE users ALTER COLUMN role TYPE varchar(16) USING role::text');
    await pg.query("ALTER TABLE users ALTER COLUMN role SET DEFAULT 'customer'");
    await pg.query('ALTER TABLE users ALTER COLUMN status DROP DEFAULT');
    await pg.query('ALTER TABLE users ALTER COLUMN status TYPE varchar(16) USING status::text');
    await pg.query("ALTER TABLE users ALTER COLUMN status SET DEFAULT 'active'");
    await pg.query('ALTER TABLE transactions ALTER COLUMN type TYPE varchar(20) USING type::text');
    await pg.query('ALTER TABLE transactions ALTER COLUMN status TYPE varchar(24) USING status::text');
    await pg.query("UPDATE transactions SET status = 'COMPLETED' WHERE status = 'success'");
    await pg.query("UPDATE transactions SET status = 'FAILED' WHERE status = 'failed'");
    await pg.query("UPDATE transactions SET status = 'INITIATED' WHERE status = 'pending'");
    await pg.query('COMMIT');
  } catch (error) {
    await pg.query('ROLLBACK');
    throw error;
  } finally {
    await pg.end();
  }
  dataSource.setOptions({ synchronize: true });
  await dataSource.initialize();
  await dataSource.transaction(async (manager) => {
    const accounts = await manager.find(Account);
    for (const account of accounts) {
      const count = await manager.getRepository(LedgerEntry).count({ where: { account: { id: account.id } } });
      if (count === 0 && moneyToCents(account.balance) !== 0n) {
        await manager.insert(LedgerEntry, {
          account,
          transaction: null,
          type: LedgerEntryType.CREDIT,
          amount: account.balance,
          balanceAfter: account.balance,
          reference: 'legacy_opening',
        });
      }
    }
  });
  await dataSource.destroy();
  process.stdout.write('Legacy database schema and opening balances upgraded.\n');
}

main().catch(async (error) => {
  process.stderr.write(`${String(error)}\n`);
  if (dataSource.isInitialized) await dataSource.destroy();
  process.exitCode = 1;
});
