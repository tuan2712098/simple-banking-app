import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import { dataSource } from './db';
import { Account } from '../src/accounts/entities/account.entity';

const origin = process.env.API_ORIGIN || 'http://localhost:3000';

async function login(email: string) {
  const response = await fetch(`${origin}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Demo@123456' }),
  });
  if (!response.ok) throw new Error(`Login failed: ${response.status}`);
  return (await response.json()).accessToken as string;
}

async function bench(path: string, token: string, number: string, amount: string) {
  const started = performance.now();
  const statuses = await Promise.all(Array.from({ length: 20 }, async () => {
    const response = await fetch(`${origin}${path}`, {
      method: 'POST', headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': randomUUID(),
      },
      body: JSON.stringify({ toAccountNumber: number, amount, description: 'Concurrency benchmark' }),
    });
    return response.status;
  }));
  const milliseconds = performance.now() - started;
  return { path, statuses, success: statuses.filter((s) => s === 201).length, failed: statuses.filter((s) => s !== 201).length, ms: Math.round(milliseconds), throughputPerSecond: Math.round(20000 / milliseconds) };
}

async function main() {
  if (!process.env.DB_DATABASE?.endsWith('_test')) throw new Error('Benchmark requires a dedicated *_test database');
  const healthResponse = await fetch(`${origin}/health`);
  if (!healthResponse.ok || !(await healthResponse.json()).testDatabase) throw new Error('The running API must use the same dedicated *_test database');
  await dataSource.initialize();
  const first = await dataSource.getRepository(Account).findOne({ where: { accountNumber: '900000000001' } });
  const second = await dataSource.getRepository(Account).findOne({ where: { accountNumber: '900000000002' } });
  if (!first || !second) throw new Error('Seed test database first');
  const token = await login('tuan@example.com');
  const runs = [];
  for (const path of ['/transactions/transfer', '/transactions/transfer-optimistic']) {
    await dataSource.query('UPDATE accounts SET balance = $1 WHERE id = $2', ['1000000.00', first.id]);
    await dataSource.query('UPDATE accounts SET balance = $1 WHERE id = $2', ['0.00', second.id]);
    const result = await bench(path, token, second.accountNumber, '100000.00');
    const [source] = await dataSource.query('SELECT balance::text FROM accounts WHERE id = $1', [first.id]);
    const [destination] = await dataSource.query('SELECT balance::text FROM accounts WHERE id = $1', [second.id]);
    runs.push({ ...result, balances: { source: source.balance, destination: destination.balance } });
  }
  process.stdout.write(JSON.stringify(runs, null, 2) + '\n');
  await dataSource.destroy();
}

main().catch(async (error) => {
  process.stderr.write(String(error) + '\n');
  if (dataSource.isInitialized) await dataSource.destroy();
  process.exitCode = 1;
});
