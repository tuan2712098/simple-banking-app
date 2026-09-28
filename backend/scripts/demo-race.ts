import { dataSource } from './db';
import { Account } from '../src/accounts/entities/account.entity';

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!process.env.DB_DATABASE?.endsWith('_test')) throw new Error('Only run race demonstration against dedicated *_test database');
  await dataSource.initialize();
  const account = await dataSource.getRepository(Account).findOne({ where: { accountNumber: '900000000001' } });
  if (!account) throw new Error('Seed test database first');
  await dataSource.query('UPDATE accounts SET balance = $1 WHERE id = $2', ['1000000.00', account.id]);
  await Promise.all(Array.from({ length: 20 }, async () => {
    const [{ balance }] = await dataSource.query('SELECT balance::text FROM accounts WHERE id = $1', [account.id]);
    await delay(100);
    const newBalance = (BigInt(balance.split('.')[0]) - 100000n).toString() + '.00';
    await dataSource.query('UPDATE accounts SET balance = $1 WHERE id = $2', [newBalance, account.id]);
  }));
  const [result] = await dataSource.query('SELECT balance::text FROM accounts WHERE id = $1', [account.id]);
  process.stdout.write(JSON.stringify({
    requests: 20,
    initialBalance: '1000000.00',
    amountEach: '100000.00',
    naiveArithmeticResult: '-1000000.00',
    actualUnsafeBalance: result.balance,
    explanation: 'All requests read stale balances before their writes; the final value demonstrates lost updates.',
  }, null, 2) + '\n');
  await dataSource.query('UPDATE accounts SET balance = $1 WHERE id = $2', ['1000000.00', account.id]);
  await dataSource.destroy();
}

main().catch(async (error) => {
  process.stderr.write(String(error) + '\n');
  if (dataSource.isInitialized) await dataSource.destroy();
  process.exitCode = 1;
});
