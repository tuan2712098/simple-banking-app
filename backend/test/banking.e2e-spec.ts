import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { MonitoringService } from '../src/monitoring/monitoring.service';
import { ReconciliationReport } from '../src/monitoring/entities/reconciliation-report.entity';
import { Account } from '../src/accounts/entities/account.entity';
import { Transaction, TransactionStatus } from '../src/transactions/entities/transaction.entity';
import { LedgerEntry } from '../src/ledger/entities/ledger-entry.entity';
import { LedgerService } from '../src/ledger/ledger.service';
import { centsToMoney } from '../src/common/money';
import { randomUUID } from 'crypto';

const database = process.env.DB_DATABASE || '';
const run = database.endsWith('_test') ? describe : describe.skip;

run('banking API with dedicated test PostgreSQL', () => {
  let app: INestApplication;
  let sourceToken: string;
  let destToken: string;
  let sourceNumber: string;
  let destNumber: string;
  let sourceId: string;
  let destId: string;
  let db: DataSource;
  let ledger: LedgerService;
  let originalPost: typeof LedgerService.prototype.post;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    db = module.get(DataSource);
    ledger = module.get(LedgerService);
    originalPost = ledger.post.bind(ledger);
    for (const email of ['test-source@example.com', 'test-target@example.com']) {
      const result = await request(app.getHttpServer()).post('/auth/register').send({ fullName: email, email, password: 'Demo@123456' });
      expect(result.status).toBeLessThan(300);
      if (email.startsWith('test-source')) {
        sourceToken = result.body.accessToken;
        sourceNumber = result.body.account.accountNumber;
        sourceId = result.body.account.id;
      } else {
        destToken = result.body.accessToken;
        destNumber = result.body.account.accountNumber;
        destId = result.body.account.id;
      }
    }
    await db.transaction(async (manager) => {
      await manager.update(Account, { id: sourceId }, { balance: '1000000.00' });
      const account = await manager.findOneByOrFail(Account, { id: sourceId });
      await manager.insert(LedgerEntry, { account, transaction: null, type: 'CREDIT' as any, amount: '1000000.00', balanceAfter: '1000000.00', reference: 'opening' });
    });
  }, 60000);

  afterAll(async () => {
    ledger.post = originalPost;
    if (db?.isInitialized) {
      await db.query('TRUNCATE TABLE idempotency_keys, ledger_entries, transactions, refresh_sessions, audit_logs, accounts, users CASCADE');
    }
    if (app) await app.close();
  });

  it('rejects account access without a token', async () => {
    const response = await request(app.getHttpServer()).get('/accounts/me');
    expect(response.status).toBe(401);
  });

  it('rejects insufficient balance and self transfer', async () => {
    const denied = await request(app.getHttpServer()).post('/transactions/transfer')
      .set('Authorization', `Bearer ${sourceToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ toAccountNumber: destNumber, amount: '2000000.00', description: 'Too much' });
    expect(denied.status).toBe(400);
    const self = await request(app.getHttpServer()).post('/transactions/transfer')
      .set('Authorization', `Bearer ${sourceToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ toAccountNumber: sourceNumber, amount: '10.00', description: 'Self' });
    expect(self.status).toBe(400);
  });

  it('applies 20 concurrent requests without negative balances', async () => {
    const jobs = Array.from({ length: 20 }, () => request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', `Bearer ${sourceToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ toAccountNumber: destNumber, amount: '100000.00', description: 'Concurrency' }));
    const responses = await Promise.all(jobs);
    expect(responses.every((x) => [201, 400].includes(x.status))).toBe(true);
    expect(responses.filter((x) => x.status === 201).length).toBe(10);
    const source = await db.getRepository(Account).findOneByOrFail({ id: sourceId });
    const destination = await db.getRepository(Account).findOneByOrFail({ id: destId });
    expect(source.balance).toBe('0.00');
    expect(destination.balance).toBe('1000000.00');
    const entries = await db.getRepository(LedgerEntry).find({ where: { reference: 'transfer' } });
    expect(entries.length).toBe(20);
  }, 60000);

  it('enforces immutable ledger entries at database level', async () => {
    const entry = await db.getRepository(LedgerEntry).findOne({ where: { reference: 'transfer' } });
    expect(entry).not.toBeNull();
    await expect(db.query('UPDATE ledger_entries SET amount = $1 WHERE id = $2', ['1.00', entry!.id])).rejects.toThrow();
    await expect(db.query('DELETE FROM ledger_entries WHERE id = $1', [entry!.id])).rejects.toThrow();
  });

  it('handles simultaneous transfers in both directions without deadlock', async () => {
    await db.getRepository(Account).update({ id: sourceId }, { balance: '1000000.00' });
    await db.getRepository(Account).update({ id: destId }, { balance: '1000000.00' });
    const jobs = Array.from({ length: 10 }, (_, index) => request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', `Bearer ${index % 2 === 0 ? sourceToken : destToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ toAccountNumber: index % 2 === 0 ? destNumber : sourceNumber, amount: '100.00', description: 'Two-way' }));
    const responses = await Promise.all(jobs);
    expect(responses.every((result) => result.status === 201)).toBe(true);
    const source = await db.getRepository(Account).findOneByOrFail({ id: sourceId });
    const destination = await db.getRepository(Account).findOneByOrFail({ id: destId });
    expect(source.balance).toBe('1000000.00');
    expect(destination.balance).toBe('1000000.00');
  }, 60000);

  it('keeps nonnegative balances with optimistic version updates', async () => {
    await db.getRepository(Account).update({ id: sourceId }, { balance: '1000000.00' });
    await db.getRepository(Account).update({ id: destId }, { balance: '0.00' });
    const jobs = Array.from({ length: 20 }, () => request(app.getHttpServer())
      .post('/transactions/transfer-optimistic')
      .set('Authorization', `Bearer ${sourceToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ toAccountNumber: destNumber, amount: '100000.00', description: 'Optimistic' }));
    const responses = await Promise.all(jobs);
    expect(responses.every((result) => [201, 400, 409].includes(result.status))).toBe(true);
    const source = await db.getRepository(Account).findOneByOrFail({ id: sourceId });
    const destination = await db.getRepository(Account).findOneByOrFail({ id: destId });
    const from = BigInt(source.balance.replace('.', ''));
    const to = BigInt(destination.balance.replace('.', ''));
    expect(from).toBeGreaterThanOrEqual(0n);
    expect(from + to).toBe(100000000n);
  }, 60000);

  it('replays the same request five times once', async () => {
    await db.getRepository(Account).update({ id: sourceId }, { balance: '1000000.00' });
    const key = randomUUID();
    const payload = { toAccountNumber: destNumber, amount: '100.00', description: 'Repeat' };
    const jobs = Array.from({ length: 5 }, () => request(app.getHttpServer()).post('/transactions/transfer')
      .set('Authorization', `Bearer ${sourceToken}`).set('Idempotency-Key', key).send(payload));
    const results = await Promise.all(jobs);
    expect(results.every((x) => x.status === 201)).toBe(true);
    expect(new Set(results.map((x) => x.body.id)).size).toBe(1);
    const mismatch = await request(app.getHttpServer()).post('/transactions/transfer')
      .set('Authorization', `Bearer ${sourceToken}`).set('Idempotency-Key', key)
      .send({ ...payload, amount: '200.00' });
    expect(mismatch.status).toBe(409);
  }, 60000);

  it('rolls back both balance and partial ledger on injected failure', async () => {
    const before = await db.getRepository(Account).findOneByOrFail({ id: sourceId });
    const beforeCount = await db.getRepository(LedgerEntry).count();
    ledger.post = async (manager, transaction, source, _target, amount) => {
      await manager.insert(LedgerEntry, {
        account: source, transaction, type: 'DEBIT' as any, amount, balanceAfter: source.balance, reference: 'rollback_test',
      });
      throw new Error('Simulated failure between debit and credit');
    };
    try {
      const response = await request(app.getHttpServer()).post('/transactions/transfer')
        .set('Authorization', `Bearer ${sourceToken}`).set('Idempotency-Key', randomUUID())
        .send({ toAccountNumber: destNumber, amount: '200.00', description: 'Rollback' });
      expect(response.status).toBe(500);
      const after = await db.getRepository(Account).findOneByOrFail({ id: sourceId });
      expect(after.balance).toEqual(before.balance);
      expect(await db.getRepository(LedgerEntry).count()).toBe(beforeCount);
    } finally {
      ledger.post = originalPost;
    }
  }, 30000);

  it('does not deposit twice for the same idempotency key', async () => {
    const email = `deposit-teller-${randomUUID()}@example.com`;

    const registration = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        fullName: 'Deposit Test Teller',
        email,
        password: 'Demo@123456',
      });

    expect(registration.status).toBe(201);

    await db.query(
      'UPDATE users SET role = $1 WHERE email = $2',
      ['teller', email],
    );

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email,
        password: 'Demo@123456',
      });

    expect(login.status).toBe(201);

    const token = login.body.accessToken;
    const before = await db.getRepository(Account).findOneByOrFail({
      id: destId,
    });

    const requestKey = randomUUID();
    const payload = {
      accountNumber: destNumber,
      amount: '50.00',
    };

    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        request(app.getHttpServer())
          .post('/transactions/deposit')
          .set('Authorization', `Bearer ${token}`)
          .set('Idempotency-Key', requestKey)
          .send(payload),
      ),
    );

    expect(responses.every((response) => response.status === 201)).toBe(true);
    expect(new Set(responses.map((response) => response.body.id)).size).toBe(1);

    const after = await db.getRepository(Account).findOneByOrFail({
      id: destId,
    });

    const beforeCents = BigInt(before.balance.replace('.', ''));
    const afterCents = BigInt(after.balance.replace('.', ''));

    expect(afterCents - beforeCents).toBe(5000n);

    const changedPayload = await request(app.getHttpServer())
      .post('/transactions/deposit')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', requestKey)
      .send({
        accountNumber: destNumber,
        amount: '51.00',
      });

    expect(changedPayload.status).toBe(409);
  }, 30000);
  it('detects and records a reconciliation mismatch', async () => {
    const accounts = db.getRepository(Account);
    const reports = db.getRepository(ReconciliationReport);
    const before = await accounts.findOneByOrFail({ id: sourceId });
    const existingIds = new Set(
      (await reports.find({ select: ['id'] })).map((report) => report.id),
    );

    try {
      await db.query(
        `UPDATE accounts
         SET balance = (
           SELECT COALESCE(SUM(
             CASE
               WHEN type = 'CREDIT' THEN amount
               WHEN type = 'DEBIT' THEN -amount
               ELSE 0
             END
           ), 0) + 7
           FROM ledger_entries
           WHERE account_id = $1
         )
         WHERE id = $1`,
        [sourceId],
      );

      const changed = await accounts.findOneByOrFail({ id: sourceId });
      const result = await app.get(MonitoringService).reconcile();
      const mismatch = result.mismatches.find(
        (row) => row.account_id === sourceId,
      );

      expect(mismatch).toBeDefined();
      expect(mismatch!.stored_balance).toBe(changed.balance);
      expect(mismatch!.stored_balance).not.toBe(mismatch!.ledger_balance);

      const created = (await reports.find({ where: { accountId: sourceId } }))
        .filter((report) => !existingIds.has(report.id));

      expect(created).toHaveLength(1);
      expect(created[0].storedBalance).toBe(changed.balance);
      expect(created[0].ledgerBalance).toBe(mismatch!.ledger_balance);
    } finally {
      await accounts.update({ id: sourceId }, { balance: before.balance });

      const createdIds = (await reports.find({ select: ['id'] }))
        .map((report) => report.id)
        .filter((id) => !existingIds.has(id));

      if (createdIds.length > 0) {
        await reports.delete(createdIds);
      }
    }
  }, 30000);
  it('restricts admin to admin role', async () => {
    const denied = await request(app.getHttpServer()).get('/admin/audit-logs').set('Authorization', `Bearer ${sourceToken}`);
    expect(denied.status).toBe(403);
  });
});
