import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Account, AccountStatus, AccountTier } from './entities/account.entity';
import { AccountHistory } from './entities/account-history.entity';
import { moneyToCents } from '../common/money';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    private readonly dataSource: DataSource,
  ) {}

  generateAccountNumber(): string {
    return Array.from({ length: 12 }, () => randomInt(0, 10)).join('');
  }

  async createForUser(user: User, manager?: EntityManager): Promise<Account> {
    const repo = manager ? manager.getRepository(Account) : this.accounts;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const accountNumber = this.generateAccountNumber();
      if (await repo.exist({ where: { accountNumber } })) continue;
      return repo.save(repo.create({ user, accountNumber, balance: '0.00', holdAmount: '0.00', currency: 'VND' }));
    }
    throw new ConflictException('Could not generate account number');
  }

  findByUserId(userId: string) {
    return this.accounts.findOne({ where: { user: { id: userId } }, relations: { user: true } });
  }

  async requireAccount(userId: string) {
    const account = await this.findByUserId(userId);
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  async setStatus(id: string, status: AccountStatus) {
    const account = await this.accounts.findOne({ where: { id } });
    if (!account) throw new NotFoundException('Account not found');
    const before = { status: account.status };
    account.status = status;
    await this.accounts.save(account);
    return { id: account.id, before, after: { status: account.status } };
  }

  async setTier(id: string, tier: AccountTier) {
    const account = await this.accounts.findOne({ where: { id } });
    if (!account) throw new NotFoundException('Account not found');
    account.tier = tier;
    await this.accounts.save(account);
    return { id, tier };
  }

  async changeEmail(userId: string, email: string) {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(User);
      const user = await repo.findOne({ where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      if (!user) throw new NotFoundException('User not found');
      const normalized = email.trim().toLowerCase();
      if (await repo.exist({ where: { email: normalized } })) throw new ConflictException('Email already exists');
      await manager.save(AccountHistory, manager.create(AccountHistory, {
        userId,
        previousEmail: user.email,
        updatedEmail: normalized,
      }));
      user.email = normalized;
      user.tokenVersion += 1;
      await repo.save(user);
      return { email: normalized };
    });
  }

  async deleteAccount(id: string) {
    const account = await this.accounts.findOne({ where: { id } });
    if (!account) throw new NotFoundException('Account not found');
    if (moneyToCents(account.balance) !== 0n) {
      throw new BadRequestException('Account balance must be zero before closing');
    }
    account.status = AccountStatus.CLOSED;
    await this.accounts.save(account);
    await this.accounts.softDelete(id);
    return { id, deleted: true };
  }

  history(userId: string) {
    return this.dataSource.getRepository(AccountHistory).find({ where: { userId }, order: { createdAt: 'DESC' } });
  }
}
