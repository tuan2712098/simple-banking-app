import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { DataSource } from 'typeorm';
import { TransactionsService } from './transactions.service';
import {
  Account,
  AccountStatus,
  AccountTier,
} from '../accounts/entities/account.entity';
import { User, UserStatus } from '../users/entities/user.entity';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
  ReviewStatus,
} from './entities/transaction.entity';
import { LedgerEntry } from '../ledger/entities/ledger-entry.entity';
import { LedgerService } from '../ledger/ledger.service';
import { IdempotencyService } from '../idempotency/idempotency.service';

const key = '00000000-0000-4000-8000-000000000001';

const dto = {
  toAccountNumber: '900000000002',
  amount: '100.00',
  description: 'Test',
};

describe('TransactionsService', () => {
  let service: TransactionsService;
  let source: Account;
  let destination: Account;
  let sourceUser: User;
  let destinationUser: User;
  let storedTransaction: Transaction | null;
  let accountResult: Account | null | undefined;
  let updateAffected: number;
  let spent: string;
  let averageCount: number;
  let averageCents: string;
  let recentCount: number;
  let historyRows: Transaction[];
  let historyTotal: number;
  let accountRepository: any;
  let transactionRepository: any;
  let ledgerRepository: any;
  let manager: any;
  let dataSource: any;
  let ledger: any;
  let idempotency: any;

  const makeTransaction = (
    values: Partial<Transaction> = {},
  ): Transaction =>
    ({
      id: 'transaction-1',
      amount: '100.00',
      type: TransactionType.TRANSFER,
      status: TransactionStatus.PENDING_OTP,
      description: 'Test',
      reviewStatus: ReviewStatus.NONE,
      otpAttempts: 0,
      otpExpiresAt: new Date(Date.now() + 60000),
      otpHash: null,
      tellerInitiated: false,
      approvedById: null,
      createdAt: new Date('2026-09-28T12:00:00Z'),
      ...values,
    }) as Transaction;

  beforeEach(() => {
    sourceUser = {
      id: 'source-user',
      status: UserStatus.ACTIVE,
    } as User;

    destinationUser = {
      id: 'destination-user',
      status: UserStatus.ACTIVE,
    } as User;

    source = {
      id: 'source-account',
      accountNumber: '900000000001',
      balance: '1000.00',
      holdAmount: '0.00',
      status: AccountStatus.ACTIVE,
      tier: AccountTier.STANDARD,
      currency: 'VND',
      version: 1,
      user: sourceUser,
    } as Account;

    destination = {
      id: 'destination-account',
      accountNumber: '900000000002',
      balance: '0.00',
      holdAmount: '0.00',
      status: AccountStatus.ACTIVE,
      tier: AccountTier.STANDARD,
      currency: 'VND',
      version: 1,
      user: destinationUser,
    } as Account;

    storedTransaction = makeTransaction({
      fromAccount: source,
      toAccount: destination,
    });

    accountResult = undefined;
    updateAffected = 1;
    spent = '0';
    averageCount = 0;
    averageCents = '0';
    recentCount = 0;
    historyRows = [];
    historyTotal = 0;

    const builder = (
      kind: 'account' | 'transaction',
      alias?: string,
    ) => {
      let parameters: Record<string, any> = {};
      const qb: any = {};

      for (const method of [
        'addSelect',
        'leftJoinAndSelect',
        'innerJoin',
        'setLock',
        'update',
        'set',
        'andWhere',
        'orderBy',
        'addOrderBy',
        'skip',
        'take',
      ]) {
        qb[method] = jest.fn().mockReturnValue(qb);
      }

      qb.where = jest.fn(
        (_sql: string, values?: Record<string, any>) => {
          parameters = values || {};
          return qb;
        },
      );

      qb.getOne = jest.fn(async () => {
        if (kind === 'transaction') {
          return storedTransaction;
        }

        if (accountResult !== undefined) {
          return accountResult;
        }

        if (alias === 'account') {
          if (parameters.id === source.id) {
            return source;
          }

          if (parameters.id === destination.id) {
            return destination;
          }

          return null;
        }

        return parameters.number ? destination : source;
      });

      qb.getManyAndCount = jest.fn(
        async () => [historyRows, historyTotal],
      );

      qb.execute = jest.fn(
        async () => ({ affected: updateAffected }),
      );

      return qb;
    };

    accountRepository = {
      createQueryBuilder: jest.fn(
        (alias?: string) => builder('account', alias),
      ),

      findOne: jest.fn(async ({ where }: any) => {
        if (where.user) {
          return where.user.id === sourceUser.id
            ? source
            : null;
        }

        if (where.accountNumber) {
          return where.accountNumber === destination.accountNumber
            ? destination
            : null;
        }

        return where.id === source.id
          ? source
          : where.id === destination.id
            ? destination
            : null;
      }),

      save: jest.fn(async (value: any) => value),
    };

    transactionRepository = {
      createQueryBuilder: jest.fn(
        (alias?: string) => builder('transaction', alias),
      ),

      findOne: jest.fn(async () => storedTransaction),
      find: jest.fn(async () => []),
      save: jest.fn(async (value: any) => value),
    };

    ledgerRepository = {
      insert: jest.fn().mockResolvedValue({
        identifiers: [],
      }),
    };

    manager = {
      getRepository: jest.fn((entity: any) => {
        if (entity === Account) {
          return accountRepository;
        }

        if (entity === Transaction) {
          return transactionRepository;
        }

        if (entity === LedgerEntry) {
          return ledgerRepository;
        }

        throw new Error('Unexpected repository');
      }),

      findOne: jest.fn(
        async (entity: any, options: any) => {
          if (entity !== Account) {
            return null;
          }

          if (options.where.id) {
            return options.where.id === source.id
              ? source
              : destination;
          }

          if (options.where.user) {
            return options.where.user.id === sourceUser.id
              ? source
              : null;
          }

          if (options.where.accountNumber) {
            return options.where.accountNumber ===
              destination.accountNumber
              ? destination
              : null;
          }

          return null;
        },
      ),

      findOneBy: jest.fn(
        async (_entity: any, where: any) => {
          if (where.id === sourceUser.id) {
            return sourceUser;
          }

          if (where.id === destinationUser.id) {
            return destinationUser;
          }

          return null;
        },
      ),

      query: jest.fn(async (sql: string) => {
        if (sql.includes('COALESCE(SUM')) {
          return [{ spent }];
        }

        if (sql.includes('TRUNC(AVG')) {
          return [
            {
              count: averageCount,
              avg_cents: averageCents,
            },
          ];
        }

        if (sql.includes("interval '1 minute'")) {
          return [{ count: recentCount }];
        }

        return [];
      }),

      create: jest.fn(
        (_entity: any, value: any) => ({
          ...value,
        }),
      ),

      save: jest.fn(
        async (first: any, second?: any) => {
          const value =
            second === undefined ? first : second;

          if (Array.isArray(value)) {
            return value;
          }

          if (value.type && value.amount) {
            value.id ||= 'saved-transaction';

            value.createdAt ||=
              new Date('2026-09-28T12:00:00Z');

            value.reviewStatus ||= ReviewStatus.NONE;
          }

          return value;
        },
      ),
    };

    dataSource = {
      transaction: jest.fn(
        async (
          isolationOrCallback: any,
          callback?: any,
        ) => {
          const action =
            typeof isolationOrCallback === 'function'
              ? isolationOrCallback
              : callback;

          return action(manager);
        },
      ),

      getRepository: jest.fn(
        (entity: any) =>
          entity === Account
            ? accountRepository
            : transactionRepository,
      ),
    };

    ledger = {
      post: jest.fn().mockResolvedValue(undefined),
      opening: jest.fn().mockResolvedValue(undefined),
    };

    idempotency = {
      fingerprint: jest.fn().mockReturnValue('fingerprint'),
      lookup: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
    };

    service = new TransactionsService(
      dataSource as DataSource,
      ledger as LedgerService,
      idempotency as IdempotencyService,
    );
  });

  describe('locking and balance', () => {
    it('locks both accounts', async () => {
      const [a, b] = await (
        service as any
      ).lockedAccounts(
        manager,
        source.id,
        destination.id,
      );

      expect(a).toBe(source);
      expect(b).toBe(destination);

      const calls =
        accountRepository.createQueryBuilder.mock.results;

      expect(calls).toHaveLength(2);

      expect(
        calls.every(
          (call: any) =>
            call.value.setLock.mock.calls[0][0] ===
            'pessimistic_write',
        ),
      ).toBe(true);
    });

    it('rejects a missing account', async () => {
      accountResult = null;

      await expect(
        (service as any).lockedAccounts(
          manager,
          source.id,
          destination.id,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates a balance with pessimistic locking', async () => {
      await (service as any).updateAccount(
        manager,
        source,
        -10000n,
      );

      expect(source.balance).toBe('900.00');

      expect(accountRepository.save).toHaveBeenCalledWith(
        source,
      );
    });

    it('updates a balance with optimistic locking', async () => {
      await (service as any).updateAccount(
        manager,
        source,
        -10000n,
        true,
      );

      expect(source.balance).toBe('900.00');

      const qb =
        accountRepository.createQueryBuilder.mock.results[0]
          .value;

      expect(qb.where.mock.calls[0][0]).toContain(
        'version = :version',
      );

      expect(qb.execute).toHaveBeenCalledTimes(1);
    });

    it('rejects optimistic version conflicts', async () => {
      updateAffected = 0;

      await expect(
        (service as any).updateAccount(
          manager,
          source,
          -10000n,
          true,
        ),
      ).rejects.toThrow('Concurrent modification');
    });

    it('rejects frozen accounts', () => {
      source.status = AccountStatus.FROZEN;

      expect(() =>
        (service as any).ensureActive(
          source,
          sourceUser,
        ),
      ).toThrow(BadRequestException);
    });

    it('rejects locked users', () => {
      sourceUser.status = UserStatus.LOCKED;

      expect(() =>
        (service as any).ensureActive(
          source,
          sourceUser,
        ),
      ).toThrow(BadRequestException);
    });

    it('rejects non-VND accounts', () => {
      source.currency = 'USD';

      expect(() =>
        (service as any).ensureActive(
          source,
          sourceUser,
        ),
      ).toThrow('Currency must be VND');
    });

    it('accepts active VND accounts', () => {
      expect(() =>
        (service as any).ensureActive(
          source,
          sourceUser,
        ),
      ).not.toThrow();
    });
  });

  describe('limits and fraud detection', () => {
    it('accepts the standard transfer limit', async () => {
      await expect(
        (service as any).limitCheck(
          manager,
          source,
          2000000000n,
        ),
      ).resolves.toBeUndefined();
    });

    it('rejects amounts above the standard limit', async () => {
      await expect(
        (service as any).limitCheck(
          manager,
          source,
          2000000001n,
        ),
      ).rejects.toThrow(
        'Per-transaction limit exceeded',
      );
    });

    it('accepts the VIP transfer limit', async () => {
      source.tier = AccountTier.VIP;

      await expect(
        (service as any).limitCheck(
          manager,
          source,
          5000000000n,
        ),
      ).resolves.toBeUndefined();
    });

    it('rejects exceeding the daily limit', async () => {
      spent = '49999999.99';

      await expect(
        (service as any).limitCheck(
          manager,
          source,
          2n,
        ),
      ).rejects.toThrow(
        'Daily transaction limit exceeded',
      );
    });

    it('applies the VIP daily limit', async () => {
      source.tier = AccountTier.VIP;
      spent = '199999999.99';

      await expect(
        (service as any).limitCheck(
          manager,
          source,
          1n,
        ),
      ).resolves.toBeUndefined();

      await expect(
        (service as any).limitCheck(
          manager,
          source,
          2n,
        ),
      ).rejects.toThrow(
        'Daily transaction limit exceeded',
      );
    });

    it('does not flag ordinary transactions', async () => {
      const result = await (
        service as any
      ).fraudReview(
        manager,
        source,
        10000n,
      );

      expect(result).toBe(false);
    });

    it('flags frequent transfers', async () => {
      recentCount = 5;

      const result = await (
        service as any
      ).fraudReview(
        manager,
        source,
        10000n,
      );

      expect(result).toBe(true);
    });

    it('flags unusually large transfers', async () => {
      averageCount = 10;
      averageCents = '10000';

      const result = await (
        service as any
      ).fraudReview(
        manager,
        source,
        50001n,
      );

      expect(result).toBe(true);
    });

    it('does not flag an amount below the threshold', async () => {
      averageCount = 10;
      averageCents = '10000';

      const result = await (
        service as any
      ).fraudReview(
        manager,
        source,
        50000n,
      );

      expect(result).toBe(false);
    });
  });

  describe('transfer', () => {
    it('transfers money and creates ledger entries', async () => {
      const result = await service.transfer(
        sourceUser.id,
        dto,
        key,
      );

      expect(result.status).toBe(
        TransactionStatus.COMPLETED,
      );

      expect(source.balance).toBe('900.00');
      expect(destination.balance).toBe('100.00');

      expect((result as { fromAccountNumber: string }).fromAccountNumber).toBe(
        source.accountNumber,
      );

      expect((result as { toAccountNumber: string }).toAccountNumber).toBe(
        destination.accountNumber,
      );

      expect(ledger.post).toHaveBeenCalledTimes(1);

      expect(idempotency.save).toHaveBeenCalledWith(
        manager,
        sourceUser.id,
        key,
        'fingerprint',
        result,
      );
    });

    it('rejects an invalid idempotency key', async () => {
      await expect(
        service.transfer(
          sourceUser.id,
          dto,
          'invalid',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('reuses a cached transaction response', async () => {
      const cached = {
        id: 'original',
        status: TransactionStatus.COMPLETED,
      };

      idempotency.lookup.mockResolvedValue(cached);

      await expect(
        service.transfer(
          sourceUser.id,
          dto,
          key,
        ),
      ).resolves.toEqual(cached);

      expect(ledger.post).not.toHaveBeenCalled();

      expect(idempotency.save).not.toHaveBeenCalled();
    });

    it('rejects a missing sender', async () => {
      manager.findOne.mockResolvedValueOnce(null);

      await expect(
        service.transfer(
          sourceUser.id,
          dto,
          key,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(ledger.post).not.toHaveBeenCalled();
    });

    it('rejects a missing recipient', async () => {
      manager.findOne.mockImplementation(
        async (_entity: any, options: any) =>
          options.where.user ? source : null,
      );

      await expect(
        service.transfer(
          sourceUser.id,
          dto,
          key,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects self transfers', async () => {
      manager.findOne.mockResolvedValue(source);

      await expect(
        service.transfer(
          sourceUser.id,
          {
            ...dto,
            toAccountNumber: source.accountNumber,
          },
          key,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects insufficient funds', async () => {
      source.balance = '99.99';

      await expect(
        service.transfer(
          sourceUser.id,
          dto,
          key,
        ),
      ).rejects.toThrow(
        'Insufficient available balance',
      );

      expect(
        transactionRepository.save,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          status: TransactionStatus.FAILED,
        }),
      );

      expect(ledger.post).not.toHaveBeenCalled();
    });

    it('checks money currently on hold', async () => {
      source.holdAmount = '950.01';

      await expect(
        service.transfer(
          sourceUser.id,
          dto,
          key,
        ),
      ).rejects.toThrow(
        'Insufficient available balance',
      );
    });

    it('rejects frozen senders', async () => {
      source.status = AccountStatus.FROZEN;

      await expect(
        service.transfer(
          sourceUser.id,
          dto,
          key,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(ledger.post).not.toHaveBeenCalled();
    });

    it('rejects currency mismatches', async () => {
      destination.currency = 'USD';

      await expect(
        service.transfer(
          sourceUser.id,
          dto,
          key,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('flags suspicious completed transfers', async () => {
      recentCount = 5;

      const result = await service.transfer(
        sourceUser.id,
        dto,
        key,
      );

      expect((result as { reviewStatus: ReviewStatus }).reviewStatus).toBe(
        ReviewStatus.FLAGGED,
      );
    });

    it('starts OTP verification for large transfers', async () => {
      source.balance = '30000000.00';

      const large = {
        ...dto,
        amount: '10000000.00',
      };

      const result = await service.transfer(
        sourceUser.id,
        large,
        key,
      );

      expect(result.status).toBe(
        TransactionStatus.PENDING_OTP,
      );

      expect((result as any).otpRequired).toBe(true);

      expect(source.balance).toBe('30000000.00');

      expect(ledger.post).not.toHaveBeenCalled();
      expect(idempotency.save).toHaveBeenCalledTimes(1);
    });

    it('rejects large transfers without enough money before creating OTP', async () => {
      source.balance = '9999999.99';

      await expect(
        service.transfer(
          sourceUser.id,
          { ...dto, amount: '10000000.00' },
          key,
        ),
      ).rejects.toThrow('Insufficient available balance');

      expect(idempotency.save).not.toHaveBeenCalled();
      expect(ledger.post).not.toHaveBeenCalled();
    });

    it('rejects large transfers exceeding the per-transaction limit', async () => {
      source.balance = '30000000.00';

      await expect(
        service.transfer(
          sourceUser.id,
          { ...dto, amount: '20000000.01' },
          key,
        ),
      ).rejects.toThrow('Per-transaction limit exceeded');

      expect(idempotency.save).not.toHaveBeenCalled();
    });

    it('rejects large transfers exceeding the daily limit', async () => {
      source.balance = '20000000.00';
      spent = '49000000.01';

      await expect(
        service.transfer(
          sourceUser.id,
          { ...dto, amount: '10000000.00' },
          key,
        ),
      ).rejects.toThrow('Daily transaction limit exceeded');

      expect(idempotency.save).not.toHaveBeenCalled();
    });

    it('rejects large transfers from frozen accounts before creating OTP', async () => {
      source.balance = '20000000.00';
      source.status = AccountStatus.FROZEN;

      await expect(
        service.transfer(
          sourceUser.id,
          { ...dto, amount: '10000000.00' },
          key,
        ),
      ).rejects.toThrow('Account is frozen, closed or unavailable');

      expect(idempotency.save).not.toHaveBeenCalled();
    });

    it('rejects large transfers to frozen accounts before creating OTP', async () => {
      source.balance = '20000000.00';
      destination.status = AccountStatus.FROZEN;

      await expect(
        service.transfer(
          sourceUser.id,
          { ...dto, amount: '10000000.00' },
          key,
        ),
      ).rejects.toThrow('Account is frozen, closed or unavailable');

      expect(idempotency.save).not.toHaveBeenCalled();
    });
    it('uses optimistic balance updates', async () => {
      const result = await service.transfer(
        sourceUser.id,
        dto,
        key,
        undefined,
        sourceUser.id,
        true,
      );

      expect(result.status).toBe(
        TransactionStatus.COMPLETED,
      );

      expect(source.balance).toBe('900.00');
      expect(destination.balance).toBe('100.00');

      expect(ledger.post).toHaveBeenCalledTimes(1);
    });

    it('retries PostgreSQL deadlocks', async () => {
      const deadlock = Object.assign(
        new Error('deadlock'),
        {
          driverError: {
            code: '40P01',
          },
        },
      );

      dataSource.transaction.mockRejectedValueOnce(deadlock);

      const result = await service.transfer(
        sourceUser.id,
        dto,
        key,
      );

      expect(result.status).toBe(
        TransactionStatus.COMPLETED,
      );

      expect(dataSource.transaction).toHaveBeenCalledTimes(
        2,
      );
    });

    it('rejects exhausted serialization retries', async () => {
      const conflict = Object.assign(
        new Error('serialization'),
        {
          driverError: {
            code: '40001',
          },
        },
      );

      dataSource.transaction.mockRejectedValue(conflict);

      await expect(
        service.transfer(
          sourceUser.id,
          dto,
          key,
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(dataSource.transaction).toHaveBeenCalledTimes(
        8,
      );
    });

    it('returns conflict after exhausted optimistic retries', async () => {
      updateAffected = 0;

      await expect(
        service.transfer(
          sourceUser.id,
          dto,
          key,
          undefined,
          sourceUser.id,
          true,
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(dataSource.transaction).toHaveBeenCalledTimes(
        8,
      );
    });

    it('preserves unexpected errors', async () => {
      dataSource.transaction.mockRejectedValue(
        new Error('Database offline'),
      );

      await expect(
        service.transfer(
          sourceUser.id,
          dto,
          key,
        ),
      ).rejects.toThrow('Database offline');

      expect(
        transactionRepository.save,
      ).not.toHaveBeenCalled();
    });

    it('preserves errors when failure logging also fails', async () => {
      source.balance = '0.00';

      transactionRepository.save.mockRejectedValue(
        new Error('Log unavailable'),
      );

      await expect(
        service.transfer(
          sourceUser.id,
          dto,
          key,
        ),
      ).rejects.toThrow(
        'Insufficient available balance',
      );
    });
  });

  describe('OTP confirmation', () => {
    it('rejects missing OTP transactions', async () => {
      storedTransaction = null;

      await expect(
        service.confirmOtp(
          sourceUser.id,
          'missing',
          '123456',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects access by another user', async () => {
      await expect(
        service.confirmOtp(
          'other-user',
          'transaction-1',
          '123456',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects confirmation after completion', async () => {
      storedTransaction!.status =
        TransactionStatus.COMPLETED;

      await expect(
        service.confirmOtp(
          sourceUser.id,
          'transaction-1',
          '123456',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requires approval for teller transfers', async () => {
      storedTransaction!.tellerInitiated = true;

      await expect(
        service.confirmOtp(
          sourceUser.id,
          'transaction-1',
          '123456',
        ),
      ).rejects.toThrow('Admin approval required');
    });

    it('fails expired OTP transactions', async () => {
      storedTransaction!.otpExpiresAt = new Date(0);

      await expect(
        service.confirmOtp(
          sourceUser.id,
          'transaction-1',
          '123456',
        ),
      ).rejects.toThrow(
        'OTP expired or attempts exceeded',
      );

      expect(storedTransaction!.status).toBe(
        TransactionStatus.FAILED,
      );

      expect(manager.save).toHaveBeenCalledWith(
        storedTransaction,
      );
    });

    it('fails transactions after maximum OTP attempts', async () => {
      storedTransaction!.otpAttempts = 3;

      await expect(
        service.confirmOtp(
          sourceUser.id,
          'transaction-1',
          '123456',
        ),
      ).rejects.toThrow(
        'OTP expired or attempts exceeded',
      );
    });

    it('rejects an incorrect OTP', async () => {
      storedTransaction!.otpHash = bcrypt.hashSync(
        '123456',
        4,
      );

      await expect(
        service.confirmOtp(
          sourceUser.id,
          'transaction-1',
          '000000',
        ),
      ).rejects.toThrow('Invalid OTP');

      expect(storedTransaction!.otpAttempts).toBe(1);

      expect(storedTransaction!.status).toBe(
        TransactionStatus.PENDING_OTP,
      );
    });

    it('fails on the third incorrect OTP', async () => {
      storedTransaction!.otpHash = bcrypt.hashSync(
        '123456',
        4,
      );

      storedTransaction!.otpAttempts = 2;

      await expect(
        service.confirmOtp(
          sourceUser.id,
          'transaction-1',
          '000000',
        ),
      ).rejects.toThrow('Invalid OTP');

      expect(storedTransaction!.status).toBe(
        TransactionStatus.FAILED,
      );
    });

    it('completes a transaction with a valid OTP', async () => {
      storedTransaction!.otpHash = bcrypt.hashSync(
        '123456',
        4,
      );

      const result = await service.confirmOtp(
        sourceUser.id,
        'transaction-1',
        '123456',
      );

      expect(result.status).toBe(
        TransactionStatus.COMPLETED,
      );

      expect(storedTransaction!.otpHash).toBeNull();

      expect(storedTransaction!.otpExpiresAt).toBeNull();

      expect(ledger.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('admin approval', () => {
    it('rejects missing transactions', async () => {
      storedTransaction = null;

      await expect(
        service.approveLarge(
          'missing',
          'admin-1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects non-teller transactions', async () => {
      await expect(
        service.approveLarge(
          'transaction-1',
          'admin-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate approvals', async () => {
      storedTransaction!.tellerInitiated = true;
      storedTransaction!.approvedById = 'admin-1';

      await expect(
        service.approveLarge(
          'transaction-1',
          'admin-2',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('approves pending teller transactions', async () => {
      storedTransaction!.tellerInitiated = true;

      const result = await service.approveLarge(
        'transaction-1',
        'admin-1',
      );

      expect(result.approvedById).toBe('admin-1');

      expect(storedTransaction!.approvedById).toBe(
        'admin-1',
      );
    });
  });

  describe('reversal', () => {
    it('rejects missing transactions', async () => {
      storedTransaction = null;

      await expect(
        service.reverse('missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects reversal of failed transactions', async () => {
      storedTransaction!.status =
        TransactionStatus.FAILED;

      await expect(
        service.reverse('transaction-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects reversal of deposits', async () => {
      storedTransaction!.status =
        TransactionStatus.COMPLETED;

      storedTransaction!.type =
        TransactionType.DEPOSIT;

      await expect(
        service.reverse('transaction-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects reversal with insufficient recipient balance', async () => {
      storedTransaction!.status =
        TransactionStatus.COMPLETED;

      await expect(
        service.reverse('transaction-1'),
      ).rejects.toThrow(
        'Recipient has insufficient balance',
      );
    });

    it('creates a reversal transaction and ledger entries', async () => {
      storedTransaction!.status =
        TransactionStatus.COMPLETED;

      destination.balance = '100.00';

      const result = await service.reverse(
        'transaction-1',
      );

      expect(result.status).toBe(
        TransactionStatus.REVERSED,
      );

      expect(storedTransaction!.status).toBe(
        TransactionStatus.REVERSED,
      );

      expect(destination.balance).toBe('0.00');
      expect(source.balance).toBe('1100.00');

      expect(ledger.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('deposit', () => {
    it('rejects invalid deposit amounts', async () => {
      await expect(
        service.deposit(
          destination.accountNumber,
          '0.00',
          key,
          sourceUser.id,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects nonexistent accounts', async () => {
      accountResult = null;

      await expect(
        service.deposit(
          destination.accountNumber,
          '10.00',
          key,
          sourceUser.id,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects frozen accounts', async () => {
      destination.status = AccountStatus.FROZEN;

      await expect(
        service.deposit(
          destination.accountNumber,
          '10.00',
          key,
          sourceUser.id,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('replays a duplicate deposit without adding money twice', async () => {
      const first = await service.deposit(
        destination.accountNumber,
        '10.00',
        key,
        sourceUser.id,
      );

      idempotency.lookup.mockResolvedValueOnce(first);

      const second = await service.deposit(
        destination.accountNumber,
        '10.00',
        key,
        sourceUser.id,
      );

      expect(second).toEqual(first);
      expect(destination.balance).toBe('10.00');
      expect(ledger.opening).toHaveBeenCalledTimes(1);
      expect(idempotency.save).toHaveBeenCalledTimes(1);
    });

    it('rejects deposits without a valid idempotency key', async () => {
      await expect(
        service.deposit(
          destination.accountNumber,
          '10.00',
          '',
          sourceUser.id,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(ledger.opening).not.toHaveBeenCalled();
    });
    it('deposits money and creates a ledger entry', async () => {
      const result = await service.deposit(
          destination.accountNumber,
          '10.00',
          key,
          sourceUser.id,
        );

      expect(destination.balance).toBe('10.00');

      expect(result.status).toBe(
        TransactionStatus.COMPLETED,
      );

      expect(ledger.opening).toHaveBeenCalledWith(
        manager,
        destination,
        '10.00',
      );
    });
  });

  describe('withdrawal', () => {
    it('rejects invalid withdrawal amounts', async () => {
      await expect(
        service.withdraw(
          sourceUser.id,
          '-1.00',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects frozen accounts and logs the failure', async () => {
      source.status = AccountStatus.FROZEN;

      await expect(
        service.withdraw(
          sourceUser.id,
          '100.00',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(
        transactionRepository.save,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          status: TransactionStatus.FAILED,
        }),
      );
    });

    it('rejects withdrawal exceeding available funds', async () => {
      source.holdAmount = '950.01';

      await expect(
        service.withdraw(
          sourceUser.id,
          '100.00',
        ),
      ).rejects.toThrow(
        'Insufficient available balance',
      );
    });

    it('withdraws money and records a debit', async () => {
      const result = await service.withdraw(
        sourceUser.id,
        '100.00',
      );

      expect(result.balance).toBe('900.00');

      expect(
        ledgerRepository.insert,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          account: source,
          amount: '100.00',
          reference: 'withdrawal',
        }),
      );
    });

    it('preserves withdrawal errors when logging fails', async () => {
      source.balance = '0.00';

      transactionRepository.save.mockRejectedValue(
        new Error('Audit unavailable'),
      );

      await expect(
        service.withdraw(
          sourceUser.id,
          '100.00',
        ),
      ).rejects.toThrow(
        'Insufficient available balance',
      );
    });
  });

  describe('history', () => {
    it('lists incoming and outgoing transactions', async () => {
      historyRows = [
        makeTransaction({
          status: TransactionStatus.COMPLETED,
          fromAccount: source,
          toAccount: destination,
        }),
        makeTransaction({
          id: 'transaction-2',
          status: TransactionStatus.COMPLETED,
          fromAccount: destination,
          toAccount: source,
        }),
      ];

      historyTotal = 2;

      const result = await service.getHistory(
        sourceUser.id,
        {} as any,
      );

      expect(
        result.data.map(
          (transaction) => transaction.direction,
        ),
      ).toEqual([
        'outgoing',
        'incoming',
      ]);

      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      });
    });

    it('applies filters and pagination', async () => {
      const result = await service.getHistory(
        sourceUser.id,
        {
          page: 2,
          limit: 5,
          sort: 'asc',
          status: TransactionStatus.FAILED,
          type: TransactionType.TRANSFER,
        } as any,
      );

      expect(result.data).toEqual([]);

      const qb =
        transactionRepository.createQueryBuilder
          .mock.results[0].value;

      expect(qb.andWhere).toHaveBeenCalledTimes(2);

      expect(qb.orderBy).toHaveBeenCalledWith(
        't.createdAt',
        'ASC',
      );

      expect(qb.skip).toHaveBeenCalledWith(5);

      expect(qb.take).toHaveBeenCalledWith(5);
    });
  });

  describe('admin transaction management', () => {
    it('lists recent transactions', async () => {
      const rows = [makeTransaction()];

      transactionRepository.find.mockResolvedValue(
        rows,
      );

      await expect(
        service.listAll(),
      ).resolves.toEqual(rows);
    });

    it('lists flagged transactions', async () => {
      const rows = [makeTransaction()];

      transactionRepository.find.mockResolvedValue(
        rows,
      );

      await expect(
        service.listFlagged(),
      ).resolves.toEqual(rows);

      expect(
        transactionRepository.find,
      ).toHaveBeenCalledWith({
        where: {
          reviewStatus: ReviewStatus.FLAGGED,
        },
        order: {
          createdAt: 'DESC',
        },
      });
    });

    it('rejects review of missing transactions', async () => {
      storedTransaction = null;

      await expect(
        service.review(
          'missing',
          ReviewStatus.APPROVED,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects review of unflagged transactions', async () => {
      storedTransaction!.reviewStatus =
        ReviewStatus.NONE;

      await expect(
        service.review(
          'transaction-1',
          ReviewStatus.APPROVED,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('records review decisions', async () => {
      storedTransaction!.reviewStatus =
        ReviewStatus.FLAGGED;

      const result = await service.review(
        'transaction-1',
        ReviewStatus.APPROVED,
      );

      expect(result).toEqual({
        id: 'transaction-1',
        reviewStatus: ReviewStatus.APPROVED,
      });

      expect(
        transactionRepository.save,
      ).toHaveBeenCalledWith(storedTransaction);
    });
  });

  describe('stalled transactions', () => {
    it('returns zero when no transaction is stalled', async () => {
      await expect(
        service.failStalled(),
      ).resolves.toEqual({
        inspected: 0,
      });
    });

    it('marks stalled transactions as failed', async () => {
      const stale = makeTransaction({
        status: TransactionStatus.PROCESSING,
      });

      transactionRepository.find.mockResolvedValue([
        stale,
      ]);

      const result = await service.failStalled();

      expect(result).toEqual({
        inspected: 1,
      });

      expect(stale.status).toBe(
        TransactionStatus.FAILED,
      );

      expect(stale.failureReason).toBe(
        'Processing timeout',
      );

      expect(
        transactionRepository.save,
      ).toHaveBeenCalledWith(stale);
    });
  });
});