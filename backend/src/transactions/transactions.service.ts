import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { DataSource, EntityManager, LessThan } from 'typeorm';
import { Account, AccountStatus, AccountTier } from '../accounts/entities/account.entity';
import { User, UserStatus } from '../users/entities/user.entity';
import { checkAmount, centsToMoney, moneyToCents } from '../common/money';
import { changeTransactionStatus } from '../common/transaction-state';
import { LedgerService } from '../ledger/ledger.service';
import { LedgerEntry, LedgerEntryType } from '../ledger/entities/ledger-entry.entity';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { TransferDto } from './dto/transfer.dto';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { ReviewStatus, Transaction, TransactionStatus, TransactionType } from './entities/transaction.entity';

class VersionConflict extends Error {}

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly ledger: LedgerService,
    private readonly idempotency: IdempotencyService,
  ) {}

  private async lockedAccounts(manager: EntityManager, firstId: string, secondId: string) {
    const rows = new Map<string, Account>();
    for (const id of [firstId, secondId].sort()) {
      const row = await manager.getRepository(Account).createQueryBuilder('account')
        .where('account.id = :id', { id })
        .setLock('pessimistic_write')
        .getOne();
      if (!row) throw new NotFoundException('Account not found');
      rows.set(id, row);
    }
    return [rows.get(firstId)!, rows.get(secondId)!] as const;
  }

  private async updateAccount(manager: EntityManager, account: Account, change: bigint, useOptimistic = false) {
    if (useOptimistic) {
      const result = await manager.getRepository(Account).createQueryBuilder().update(Account)
        .set({ balance: () => 'balance + :delta', version: () => 'version + 1' })
        .where('id = :id AND version = :version AND balance + :delta >= 0', {
          id: account.id,
          version: account.version,
          delta: centsToMoney(change),
        }).execute();
      if (result.affected !== 1) throw new VersionConflict('Concurrent modification');
    } else {
      account.balance = centsToMoney(moneyToCents(account.balance) + change);
      await manager.getRepository(Account).save(account);
    }
    account.balance = centsToMoney(moneyToCents(account.balance) + (useOptimistic ? change : 0n));
  }

  private ensureActive(account: Account, owner: User) {
    if (account.status !== AccountStatus.ACTIVE || owner.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('Account is frozen, closed or unavailable');
    }
    if (account.currency !== 'VND') throw new BadRequestException('Currency must be VND');
  }

  private async limitCheck(manager: EntityManager, source: Account, amount: bigint) {
    const perTransfer = source.tier === AccountTier.VIP ? 50_000_000n : 20_000_000n;
    const daily = source.tier === AccountTier.VIP ? 200_000_000n : 50_000_000n;
    if (amount > perTransfer * 100n) throw new BadRequestException('Per-transaction limit exceeded');
    const result = await manager.query(`
      SELECT COALESCE(SUM(amount), 0)::text AS spent
      FROM transactions
      WHERE from_account_id = $1
        AND type IN ('transfer', 'withdrawal')
        AND status IN ('COMPLETED', 'REVERSED')
        AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    `, [source.id]) as { spent: string }[];
    if (moneyToCents(result[0].spent) + amount > daily * 100n) {
      throw new BadRequestException('Daily transaction limit exceeded');
    }
  }

  private async fraudReview(manager: EntityManager, source: Account, amount: bigint) {
    const result = await manager.query(`
      SELECT COUNT(*)::int AS count,
        COALESCE(TRUNC(AVG(amount) * 100), 0)::text AS avg_cents
      FROM transactions
      WHERE from_account_id = $1
        AND status = 'COMPLETED'
        AND created_at >= now() - interval '30 days'
    `, [source.id]) as { count: number; avg_cents: string }[];
    const recent = await manager.query(`
      SELECT COUNT(*)::int AS count FROM transactions
      WHERE from_account_id = $1 AND status = 'COMPLETED'
        AND created_at >= now() - interval '1 minute'
    `, [source.id]) as { count: number }[];
    const average = BigInt(result[0].avg_cents);
    return recent[0].count >= 5 || (result[0].count > 0 && average > 0n && amount > average * 5n);
  }

  private publicTransaction(transaction: Transaction, from: Account, to: Account) {
    return {
      id: transaction.id,
      fromAccountNumber: from.accountNumber,
      toAccountNumber: to.accountNumber,
      amount: transaction.amount,
      type: transaction.type,
      status: transaction.status,
      description: transaction.description,
      reviewStatus: transaction.reviewStatus,
      createdAt: transaction.createdAt,
    };
  }

  private async finalTransfer(manager: EntityManager, sourceId: string, destinationId: string, amountRaw: string, description: string, options: { optimistic?: boolean; transaction?: Transaction; requestId?: string } = {}) {
    const useOptimistic = options.optimistic === true;
    let source: Account;
    let destination: Account;
    if (useOptimistic) {
      const [a, b] = await Promise.all([
        manager.getRepository(Account).findOne({ where: { id: sourceId } }),
        manager.getRepository(Account).findOne({ where: { id: destinationId } }),
      ]);
      if (!a || !b) throw new NotFoundException('Account not found');
      source = a;
      destination = b;
    } else {
      [source, destination] = await this.lockedAccounts(manager, sourceId, destinationId);
    }
    const [sourceUser, destinationUser] = await Promise.all([
      manager.findOneBy(User, { id: (await manager.findOne(Account, { where: { id: source.id }, relations: { user: true } }))!.user.id }),
      manager.findOneBy(User, { id: (await manager.findOne(Account, { where: { id: destination.id }, relations: { user: true } }))!.user.id }),
    ]);
    if (!sourceUser || !destinationUser) throw new NotFoundException('Account owner not found');
    this.ensureActive(source, sourceUser);
    this.ensureActive(destination, destinationUser);
    if (source.currency !== destination.currency) throw new BadRequestException('Currency mismatch');
    if (source.id === destination.id) throw new BadRequestException('Cannot transfer to same account');
    const amount = checkAmount(amountRaw);
    await this.limitCheck(manager, source, amount);
    if (moneyToCents(source.balance) - moneyToCents(source.holdAmount) < amount) {
      throw new BadRequestException('Insufficient available balance');
    }
    const review = await this.fraudReview(manager, source, amount);
    await this.updateAccount(manager, source, -amount, useOptimistic);
    await this.updateAccount(manager, destination, amount, useOptimistic);
    let transaction = options.transaction;
    if (transaction) {
      transaction.status = changeTransactionStatus(transaction.status, TransactionStatus.PROCESSING);
    } else {
      transaction = manager.create(Transaction, {
        fromAccount: source,
        toAccount: destination,
        amount: amountRaw,
        type: TransactionType.TRANSFER,
        status: TransactionStatus.INITIATED,
        description,
        attemptedAccountNumber: destination.accountNumber,
        requestId: options.requestId || null,
      });
      if (!transaction) throw new BadRequestException('Transaction could not be created');
      transaction.status = changeTransactionStatus(transaction.status, TransactionStatus.PROCESSING);
    }
    if (!transaction) throw new BadRequestException('Transaction could not be created');
    transaction.status = changeTransactionStatus(transaction.status, TransactionStatus.COMPLETED);
    transaction.reviewStatus = review ? ReviewStatus.FLAGGED : ReviewStatus.NONE;
    const saved = await manager.save(Transaction, transaction);
    await this.ledger.post(manager, saved, source, destination, amountRaw);
    this.logger.log(JSON.stringify({ event: 'transfer_completed', requestId: options.requestId || null, transactionId: saved.id, from: source.id, to: destination.id }));
    return this.publicTransaction(saved, source, destination);
  }

  private async recordFailure(userId: string, dto: TransferDto, reason: string, requestId?: string) {
    try {
      const source = await this.dataSource.getRepository(Account).findOne({ where: { user: { id: userId } } });
      if (!source) return;
      const destination = await this.dataSource.getRepository(Account).findOne({ where: { accountNumber: dto.toAccountNumber } });
      await this.dataSource.getRepository(Transaction).save({
        fromAccount: source,
        toAccount: destination,
        amount: dto.amount,
        type: TransactionType.TRANSFER,
        status: TransactionStatus.FAILED,
        description: dto.description,
        attemptedAccountNumber: dto.toAccountNumber,
        failureReason: reason.slice(0, 255),
        requestId: requestId || null,
      });
    } catch (error) {
      this.logger.warn(JSON.stringify({ event: 'failed_transaction_log_error', requestId, error: String(error) }));
    }
  }

  async transfer(userId: string, dto: TransferDto, key: string, requestId?: string, ownerId = userId, optimistic = false) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
      throw new BadRequestException('Idempotency-Key must be UUID');
    }
    const payload = { ownerId, ...dto };
    const fingerprint = this.idempotency.fingerprint(userId, payload);
    const attempts = 8;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await this.dataSource.transaction('READ COMMITTED', async (manager) => {
          const replay = await this.idempotency.lookup(manager, userId, key, fingerprint);
          if (replay) return replay;
          const source = await manager.findOne(Account, { where: { user: { id: ownerId } }, relations: { user: true } });
          if (!source) throw new NotFoundException('Source account not found');
          const destination = await manager.findOne(Account, { where: { accountNumber: dto.toAccountNumber } });
          if (!destination) throw new NotFoundException('Destination account not found');
          if (source.id === destination.id) throw new BadRequestException('Cannot transfer to same account');
          const amount = checkAmount(dto.amount);
          if (amount >= 10_000_000n * 100n) {
            const recipient = await manager.findOne(Account, {
              where: { id: destination.id },
              relations: { user: true },
            });
            if (!source.user || !recipient?.user) {
              throw new NotFoundException('Account owner not found');
            }
            const [senderUser, recipientUser] = await Promise.all([
              manager.findOneBy(User, { id: source.user.id }),
              manager.findOneBy(User, { id: recipient.user.id }),
            ]);
            if (!senderUser || !recipientUser) {
              throw new NotFoundException('Account owner not found');
            }
            this.ensureActive(source, senderUser);
            this.ensureActive(recipient, recipientUser);
            if (source.currency !== recipient.currency) {
              throw new BadRequestException('Currency mismatch');
            }
            await this.limitCheck(manager, source, amount);
            if (moneyToCents(source.balance) - moneyToCents(source.holdAmount) < amount) {
              throw new BadRequestException('Insufficient available balance');
            }
            const current = manager.create(Transaction, {
              fromAccount: source,
              toAccount: destination,
              amount: dto.amount,
              type: TransactionType.TRANSFER,
              status: TransactionStatus.INITIATED,
              attemptedAccountNumber: destination.accountNumber,
              description: dto.description.trim(),
              requestId: requestId || null,
              tellerInitiated: ownerId !== userId,
            });
            const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
            current.status = changeTransactionStatus(current.status, TransactionStatus.PENDING_OTP);
            current.otpHash = await bcrypt.hash(otp, 10);
            current.otpExpiresAt = new Date(Date.now() + 5 * 60_000);
            const saved = await manager.save(current);
            const response = { id: saved.id, status: saved.status, otpRequired: true, ...(process.env.NODE_ENV === 'production' ? {} : { demoOtp: otp }) };
            await this.idempotency.save(manager, userId, key, fingerprint, response);
            return response;
          }
          const result = await this.finalTransfer(manager, source.id, destination.id, dto.amount, dto.description.trim(), { optimistic, requestId });
          await this.idempotency.save(manager, userId, key, fingerprint, result);
          return result;
        });
      } catch (error) {
        if (error instanceof VersionConflict || ['40P01', '40001'].includes((error as { driverError?: { code?: string } }).driverError?.code ?? '')) {
          if (attempt + 1 < attempts) { await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1))); continue; }
          throw new ConflictException('Concurrent update exceeded retry limit');
        }
        if (error instanceof BadRequestException || error instanceof NotFoundException) {
          if (!(error instanceof ConflictException)) await this.recordFailure(ownerId, dto, error.message, requestId);
        }
        throw error;
      }
    }
    throw new ConflictException('Concurrent update exceeded retry limit');
  }

  async confirmOtp(userId: string, transactionId: string, otp: string) {
    const result = await this.dataSource.transaction(async (manager) => {
      const transaction = await manager.getRepository(Transaction).createQueryBuilder('t')
        .addSelect('t.otpHash')
        .leftJoinAndSelect('t.fromAccount', 'source')
        .leftJoinAndSelect('t.toAccount', 'destination')
        .where('t.id = :id', { id: transactionId })
        .setLock('pessimistic_write', undefined, ['t'])
        .getOne();
      if (!transaction || !transaction.fromAccount || !transaction.toAccount) throw new NotFoundException('Transaction not found');
      const sourceOwner = await manager.findOne(Account, { where: { id: transaction.fromAccount.id }, relations: { user: true } });
      if (sourceOwner?.user.id !== userId) throw new ForbiddenException('Transaction does not belong to user');
      if (transaction.status !== TransactionStatus.PENDING_OTP) throw new BadRequestException('OTP confirmation no longer allowed');
      if (transaction.tellerInitiated && !transaction.approvedById) throw new BadRequestException('Admin approval required for teller-initiated large transaction');
      if (!transaction.otpExpiresAt || transaction.otpExpiresAt <= new Date() || transaction.otpAttempts >= 3) {
        transaction.status = changeTransactionStatus(transaction.status, TransactionStatus.FAILED);
        transaction.failureReason = 'OTP expired or attempts exceeded';
        await manager.save(transaction);
        return { id: transaction.id, status: transaction.status, error: 'OTP expired or attempts exceeded' };
      }
      if (!transaction.otpHash || !await bcrypt.compare(otp, transaction.otpHash)) {
        transaction.otpAttempts += 1;
        if (transaction.otpAttempts >= 3) {
          transaction.status = changeTransactionStatus(transaction.status, TransactionStatus.FAILED);
          transaction.failureReason = 'Too many OTP attempts';
        }
        await manager.save(transaction);
        return { id: transaction.id, status: transaction.status, error: 'Invalid OTP' };
      }
      transaction.otpHash = null;
      transaction.otpExpiresAt = null;
      return this.finalTransfer(manager, transaction.fromAccount.id, transaction.toAccount.id, transaction.amount, transaction.description, { transaction, requestId: transaction.requestId || undefined });
    });
    if ('error' in result) throw new BadRequestException(result.error);
    return result;
  }

  async approveLarge(id: string, adminId: string) {
    return this.dataSource.transaction(async (manager) => {
      const transaction = await manager.getRepository(Transaction).createQueryBuilder('t')
        .where('t.id = :id', { id }).setLock('pessimistic_write').getOne();
      if (!transaction) throw new NotFoundException('Transaction not found');
      if (!transaction.tellerInitiated || transaction.status !== TransactionStatus.PENDING_OTP) {
        throw new BadRequestException('Transaction is not awaiting teller approval');
      }
      if (transaction.approvedById) throw new ConflictException('Already approved');
      transaction.approvedById = adminId;
      await manager.save(transaction);
      return { id: transaction.id, approvedById: adminId, status: transaction.status };
    });
  }

  async reverse(id: string) {
    return this.dataSource.transaction(async (manager) => {
      const original = await manager.getRepository(Transaction).createQueryBuilder('tx')
        .leftJoinAndSelect('tx.fromAccount', 'source')
        .leftJoinAndSelect('tx.toAccount', 'target')
        .where('tx.id = :id', { id })
        .setLock('pessimistic_write', undefined, ['tx'])
        .getOne();
      if (!original || !original.fromAccount || !original.toAccount) throw new NotFoundException('Transaction not found');
      if (original.status !== TransactionStatus.COMPLETED || original.type !== TransactionType.TRANSFER) {
        throw new BadRequestException('Only completed transfers can be reversed once');
      }
      const [source, target] = await this.lockedAccounts(manager, original.toAccount.id, original.fromAccount.id);
      const amount = checkAmount(original.amount);
      if (moneyToCents(source.balance) - moneyToCents(source.holdAmount) < amount) {
        throw new BadRequestException('Recipient has insufficient balance for reversal');
      }
      source.balance = centsToMoney(moneyToCents(source.balance) - amount);
      target.balance = centsToMoney(moneyToCents(target.balance) + amount);
      await manager.save([source, target]);
      const reversal = manager.create(Transaction, {
        fromAccount: source,
        toAccount: target,
        amount: original.amount,
        type: TransactionType.REVERSAL,
        status: TransactionStatus.COMPLETED,
        originalTransactionId: original.id,
        description: `Reversal of ${original.id}`,
      });
      const saved = await manager.save(reversal);
      await this.ledger.post(manager, saved, source, target, original.amount);
      original.status = changeTransactionStatus(original.status, TransactionStatus.REVERSED);
      await manager.save(original);
      return { reversedTransactionId: original.id, reversalTransactionId: saved.id, status: original.status };
    });
  }

  async deposit(accountNumber: string, amountRaw: string, key: string, userId: string) {
    const amount = checkAmount(amountRaw);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
      throw new BadRequestException('Idempotency-Key must be UUID');
    }
    const fingerprint = this.idempotency.fingerprint(userId, {
      operation: 'deposit',
      accountNumber,
      amount: amountRaw,
    });

    return this.dataSource.transaction(async (manager) => {
      const replay = await this.idempotency.lookup(manager, userId, key, fingerprint);
      if (replay) return replay;

      const account = await manager.getRepository(Account).createQueryBuilder('a')
        .where('a.accountNumber = :number', { number: accountNumber })
        .setLock('pessimistic_write')
        .getOne();

      if (!account || account.status !== AccountStatus.ACTIVE) {
        throw new NotFoundException('Account not active');
      }

      account.balance = centsToMoney(moneyToCents(account.balance) + amount);
      await manager.save(account);

      const transaction = await manager.save(Transaction, manager.create(Transaction, {
        fromAccount: null,
        toAccount: account,
        amount: amountRaw,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.COMPLETED,
        description: 'Cash deposit',
      }));

      await this.ledger.opening(manager, account, amountRaw);

      const response = {
        id: transaction.id,
        balance: account.balance,
        status: transaction.status,
      };

      await this.idempotency.save(manager, userId, key, fingerprint, response);
      return response;
    });
  }
  async withdraw(userId: string, amountRaw: string) {
    const amount = checkAmount(amountRaw);
    try {
      return await this.dataSource.transaction(async (manager) => {
      const account = await manager.getRepository(Account).createQueryBuilder('a')
        .innerJoin('a.user', 'u')
        .where('u.id = :userId', { userId })
        .setLock('pessimistic_write', undefined, ['a'])
        .getOne();
      if (!account || account.status !== AccountStatus.ACTIVE) throw new NotFoundException('Account not active');
      await this.limitCheck(manager, account, amount);
      if (moneyToCents(account.balance) - moneyToCents(account.holdAmount) < amount) throw new BadRequestException('Insufficient available balance');
      account.balance = centsToMoney(moneyToCents(account.balance) - amount);
      await manager.save(account);
      const transaction = await manager.save(Transaction, manager.create(Transaction, {
        fromAccount: account,
        toAccount: null,
        amount: amountRaw,
        type: TransactionType.WITHDRAWAL,
        status: TransactionStatus.COMPLETED,
        description: 'Cash withdrawal',
      }));
      await manager.getRepository(LedgerEntry).insert({
        account,
        transaction,
        amount: amountRaw,
        balanceAfter: account.balance,
        type: LedgerEntryType.DEBIT,
        reference: 'withdrawal',
      });
      return { id: transaction.id, balance: account.balance, status: transaction.status };
      });
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        try {
          const source = await this.dataSource.getRepository(Account).findOne({ where: { user: { id: userId } } });
          if (source) await this.dataSource.getRepository(Transaction).save({
            fromAccount: source,
            toAccount: null,
            amount: amountRaw,
            type: TransactionType.WITHDRAWAL,
            status: TransactionStatus.FAILED,
            description: 'Cash withdrawal',
            failureReason: error.message,
          });
        } catch (logError) {
          this.logger.warn(JSON.stringify({ event: 'failed_withdrawal_log_error', error: String(logError) }));
        }
      }
      throw error;
    }
  }

  async getHistory(userId: string, query: TransactionQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const sort = query.sort ?? 'desc';
    const [transactions, total] = await this.dataSource.getRepository(Transaction)
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.fromAccount', 'source')
      .leftJoinAndSelect('t.toAccount', 'destination')
      .leftJoinAndSelect('source.user', 'sender')
      .leftJoinAndSelect('destination.user', 'receiver')
      .where('(sender.id = :userId OR receiver.id = :userId)', { userId })
      .andWhere(query.status ? 't.status = :status' : '1=1', query.status ? { status: query.status } : {})
      .andWhere(query.type ? 't.type = :type' : '1=1', query.type ? { type: query.type } : {})
      .orderBy('t.createdAt', sort.toUpperCase() as 'ASC' | 'DESC')
      .addOrderBy('t.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return {
      data: transactions.map((transaction) => ({
        id: transaction.id,
        direction: transaction.fromAccount?.user?.id === userId ? 'outgoing' : 'incoming',
        fromAccountNumber: transaction.fromAccount?.accountNumber ?? null,
        toAccountNumber: transaction.toAccount?.accountNumber ?? transaction.attemptedAccountNumber,
        amount: transaction.amount,
        type: transaction.type,
        status: transaction.status,
        reviewStatus: transaction.reviewStatus,
        description: transaction.description,
        createdAt: transaction.createdAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async listAll() {
    return this.dataSource.getRepository(Transaction).find({ order: { createdAt: 'DESC' }, take: 100 });
  }

  async listFlagged() {
    return this.dataSource.getRepository(Transaction).find({ where: { reviewStatus: ReviewStatus.FLAGGED }, order: { createdAt: 'DESC' } });
  }

  async review(id: string, status: ReviewStatus.APPROVED | ReviewStatus.REJECTED) {
    const transaction = await this.dataSource.getRepository(Transaction).findOne({ where: { id } });
    if (!transaction) throw new NotFoundException('Transaction not found');
    if (transaction.reviewStatus !== ReviewStatus.FLAGGED) throw new BadRequestException('Transaction not flagged');
    transaction.reviewStatus = status;
    await this.dataSource.getRepository(Transaction).save(transaction);
    return { id, reviewStatus: status };
  }

  async failStalled() {
    const overdue = await this.dataSource.getRepository(Transaction).find({
      where: { status: TransactionStatus.PROCESSING, createdAt: LessThan(new Date(Date.now() - 10 * 60_000)) },
    });
    for (const transaction of overdue) {
      transaction.status = changeTransactionStatus(transaction.status, TransactionStatus.FAILED);
      transaction.failureReason = 'Processing timeout';
      await this.dataSource.getRepository(Transaction).save(transaction);
    }
    return { inspected: overdue.length };
  }
}
