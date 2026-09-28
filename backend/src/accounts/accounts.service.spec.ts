import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import { AccountsService } from './accounts.service';
import {
  Account,
  AccountStatus,
  AccountTier,
} from './entities/account.entity';
import { AccountHistory } from './entities/account-history.entity';
import { User } from '../users/entities/user.entity';

describe('AccountsService', () => {
  let service: AccountsService;
  let accounts: any;
  let users: any;
  let histories: any;
  let manager: any;
  let dataSource: any;

  const makeUser = () =>
    ({
      id: 'user-1',
      email: 'old@example.com',
      tokenVersion: 2,
    }) as User;

  const makeAccount = (balance = '0.00') =>
    ({
      id: 'account-1',
      accountNumber: '900000000001',
      balance,
      holdAmount: '0.00',
      currency: 'VND',
      status: AccountStatus.ACTIVE,
      tier: AccountTier.STANDARD,
      user: makeUser(),
    }) as Account;

  beforeEach(() => {
    accounts = {
      exist: jest.fn().mockResolvedValue(false),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      findOne: jest.fn().mockResolvedValue(null),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    users = {
      findOne: jest.fn().mockResolvedValue(null),
      exist: jest.fn().mockResolvedValue(false),
      save: jest.fn(async (value) => value),
    };

    histories = {
      find: jest.fn().mockResolvedValue([]),
    };

    manager = {
      getRepository: jest.fn((entity) => {
        if (entity === User) return users;
        if (entity === Account) return accounts;
        if (entity === AccountHistory) return histories;
        return null;
      }),
      create: jest.fn((_entity, value) => value),
      save: jest.fn(async (_entity, value) => value),
    };

    dataSource = {
      transaction: jest.fn(async (callback) => callback(manager)),
      getRepository: jest.fn((entity) => {
        if (entity === AccountHistory) return histories;
        return accounts;
      }),
    };

    service = new AccountsService(
      accounts as Repository<Account>,
      dataSource as DataSource,
    );
  });

  describe('generateAccountNumber', () => {
    it('generates a 12-digit account number', () => {
      const number = service.generateAccountNumber();

      expect(number).toMatch(/^\d{12}$/);
    });

    it('generates numbers using digits only', () => {
      for (let index = 0; index < 10; index += 1) {
        expect(service.generateAccountNumber()).toMatch(/^\d{12}$/);
      }
    });
  });

  describe('createForUser', () => {
    it('creates an account with zero balance and VND currency', async () => {
      const user = makeUser();

      jest
        .spyOn(service, 'generateAccountNumber')
        .mockReturnValue('900000000001');

      const result = await service.createForUser(user);

      expect(accounts.exist).toHaveBeenCalledWith({
        where: { accountNumber: '900000000001' },
      });

      expect(accounts.create).toHaveBeenCalledWith({
        user,
        accountNumber: '900000000001',
        balance: '0.00',
        holdAmount: '0.00',
        currency: 'VND',
      });

      expect(accounts.save).toHaveBeenCalledTimes(1);
      expect(result.accountNumber).toBe('900000000001');
    });

    it('generates another number when a number already exists', async () => {
      jest
        .spyOn(service, 'generateAccountNumber')
        .mockReturnValueOnce('900000000001')
        .mockReturnValueOnce('900000000002');

      accounts.exist
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const result = await service.createForUser(makeUser());

      expect(accounts.exist).toHaveBeenCalledTimes(2);
      expect(accounts.save).toHaveBeenCalledTimes(1);
      expect(result.accountNumber).toBe('900000000002');
    });

    it('rejects account creation after eight number collisions', async () => {
      jest
        .spyOn(service, 'generateAccountNumber')
        .mockReturnValue('900000000001');

      accounts.exist.mockResolvedValue(true);

      await expect(
        service.createForUser(makeUser()),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(accounts.exist).toHaveBeenCalledTimes(8);
      expect(accounts.save).not.toHaveBeenCalled();
    });

    it('uses the provided transaction manager', async () => {
      jest
        .spyOn(service, 'generateAccountNumber')
        .mockReturnValue('900000000003');

      const user = makeUser();

      await service.createForUser(user, manager);

      expect(manager.getRepository).toHaveBeenCalledWith(Account);
      expect(accounts.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('findByUserId', () => {
    it('finds the account belonging to the user', async () => {
      const account = makeAccount();

      accounts.findOne.mockResolvedValue(account);

      const result = await service.findByUserId('user-1');

      expect(result).toEqual(account);

      expect(accounts.findOne).toHaveBeenCalledWith({
        where: { user: { id: 'user-1' } },
        relations: { user: true },
      });
    });

    it('returns null when the account does not exist', async () => {
      accounts.findOne.mockResolvedValue(null);

      const result = await service.findByUserId('unknown');

      expect(result).toBeNull();
    });
  });

  describe('requireAccount', () => {
    it('returns an existing account', async () => {
      const account = makeAccount();

      accounts.findOne.mockResolvedValue(account);

      await expect(
        service.requireAccount('user-1'),
      ).resolves.toEqual(account);
    });

    it('rejects a missing account', async () => {
      accounts.findOne.mockResolvedValue(null);

      await expect(
        service.requireAccount('unknown'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('setStatus', () => {
    it('freezes an active account', async () => {
      const account = makeAccount();

      accounts.findOne.mockResolvedValue(account);

      const result = await service.setStatus(
        'account-1',
        AccountStatus.FROZEN,
      );

      expect(result).toEqual({
        id: 'account-1',
        before: { status: AccountStatus.ACTIVE },
        after: { status: AccountStatus.FROZEN },
      });

      expect(account.status).toBe(AccountStatus.FROZEN);
      expect(accounts.save).toHaveBeenCalledWith(account);
    });

    it('reactivates a frozen account', async () => {
      const account = makeAccount();

      account.status = AccountStatus.FROZEN;
      accounts.findOne.mockResolvedValue(account);

      const result = await service.setStatus(
        'account-1',
        AccountStatus.ACTIVE,
      );

      expect(result.before.status).toBe(AccountStatus.FROZEN);
      expect(result.after.status).toBe(AccountStatus.ACTIVE);
    });

    it('rejects status changes for a missing account', async () => {
      accounts.findOne.mockResolvedValue(null);

      await expect(
        service.setStatus('unknown', AccountStatus.FROZEN),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(accounts.save).not.toHaveBeenCalled();
    });
  });

  describe('setTier', () => {
    it('upgrades an account to VIP', async () => {
      const account = makeAccount();

      accounts.findOne.mockResolvedValue(account);

      const result = await service.setTier(
        'account-1',
        AccountTier.VIP,
      );

      expect(result).toEqual({
        id: 'account-1',
        tier: AccountTier.VIP,
      });

      expect(account.tier).toBe(AccountTier.VIP);
      expect(accounts.save).toHaveBeenCalledWith(account);
    });

    it('rejects tier changes for a missing account', async () => {
      accounts.findOne.mockResolvedValue(null);

      await expect(
        service.setTier('unknown', AccountTier.VIP),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(accounts.save).not.toHaveBeenCalled();
    });
  });

  describe('changeEmail', () => {
    it('normalizes email and records account history', async () => {
      const user = makeUser();

      users.findOne.mockResolvedValue(user);
      users.exist.mockResolvedValue(false);

      const result = await service.changeEmail(
        'user-1',
        '  NEW@EXAMPLE.COM  ',
      );

      expect(result).toEqual({
        email: 'new@example.com',
      });

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);

      expect(users.findOne).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        lock: { mode: 'pessimistic_write' },
      });

      expect(users.exist).toHaveBeenCalledWith({
        where: { email: 'new@example.com' },
      });

      expect(manager.create).toHaveBeenCalledWith(
        AccountHistory,
        {
          userId: 'user-1',
          previousEmail: 'old@example.com',
          updatedEmail: 'new@example.com',
        },
      );

      expect(manager.save).toHaveBeenCalledWith(
        AccountHistory,
        expect.objectContaining({
          previousEmail: 'old@example.com',
          updatedEmail: 'new@example.com',
        }),
      );

      expect(user.email).toBe('new@example.com');
      expect(user.tokenVersion).toBe(3);
      expect(users.save).toHaveBeenCalledWith(user);
    });

    it('rejects email changes when the user does not exist', async () => {
      users.findOne.mockResolvedValue(null);

      await expect(
        service.changeEmail('unknown', 'new@example.com'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(users.exist).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('rejects an email already in use', async () => {
      const user = makeUser();

      users.findOne.mockResolvedValue(user);
      users.exist.mockResolvedValue(true);

      await expect(
        service.changeEmail('user-1', 'TAKEN@EXAMPLE.COM'),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(users.exist).toHaveBeenCalledWith({
        where: { email: 'taken@example.com' },
      });

      expect(user.email).toBe('old@example.com');
      expect(user.tokenVersion).toBe(2);
      expect(manager.save).not.toHaveBeenCalled();
      expect(users.save).not.toHaveBeenCalled();
    });
  });

  describe('deleteAccount', () => {
    it('soft-deletes an account with zero balance', async () => {
      const account = makeAccount('0.00');

      accounts.findOne.mockResolvedValue(account);

      const result = await service.deleteAccount('account-1');

      expect(result).toEqual({
        id: 'account-1',
        deleted: true,
      });

      expect(account.status).toBe(AccountStatus.CLOSED);
      expect(accounts.save).toHaveBeenCalledWith(account);
      expect(accounts.softDelete).toHaveBeenCalledWith('account-1');
    });

    it('accepts zero balance with decimal formatting', async () => {
      const account = makeAccount('0.0');

      accounts.findOne.mockResolvedValue(account);

      await expect(
        service.deleteAccount('account-1'),
      ).resolves.toEqual({
        id: 'account-1',
        deleted: true,
      });
    });

    it('rejects closing an account with remaining money', async () => {
      const account = makeAccount('100.00');

      accounts.findOne.mockResolvedValue(account);

      await expect(
        service.deleteAccount('account-1'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(accounts.save).not.toHaveBeenCalled();
      expect(accounts.softDelete).not.toHaveBeenCalled();
    });

    it('rejects closing an account with a negative balance', async () => {
      const account = makeAccount('-1.00');

      accounts.findOne.mockResolvedValue(account);

      await expect(
        service.deleteAccount('account-1'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(accounts.softDelete).not.toHaveBeenCalled();
    });

    it('rejects closing an account that does not exist', async () => {
      accounts.findOne.mockResolvedValue(null);

      await expect(
        service.deleteAccount('unknown'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(accounts.save).not.toHaveBeenCalled();
      expect(accounts.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('history', () => {
    it('returns email change history ordered by newest first', async () => {
      const records = [
        {
          userId: 'user-1',
          previousEmail: 'old@example.com',
          updatedEmail: 'new@example.com',
        },
      ];

      histories.find.mockResolvedValue(records);

      const result = await service.history('user-1');

      expect(result).toEqual(records);

      expect(dataSource.getRepository).toHaveBeenCalledWith(
        AccountHistory,
      );

      expect(histories.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { createdAt: 'DESC' },
      });
    });

    it('returns an empty list when no history exists', async () => {
      histories.find.mockResolvedValue([]);

      await expect(
        service.history('user-1'),
      ).resolves.toEqual([]);
    });
  });
});