import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Account } from '../accounts/entities/account.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { LedgerEntry, LedgerEntryType } from './entities/ledger-entry.entity';

@Injectable()
export class LedgerService {
  async post(manager: EntityManager, transaction: Transaction, source: Account, target: Account, amount: string) {
    const repository = manager.getRepository(LedgerEntry);
    const debit = repository.create({ account: source, transaction, type: LedgerEntryType.DEBIT, amount, balanceAfter: source.balance, reference: transaction.type });
    const credit = repository.create({ account: target, transaction, type: LedgerEntryType.CREDIT, amount, balanceAfter: target.balance, reference: transaction.type });
    await repository.insert([debit, credit]);
  }

  async opening(manager: EntityManager, account: Account, amount: string) {
    const repository = manager.getRepository(LedgerEntry);
    await repository.insert(repository.create({ account, transaction: null, type: LedgerEntryType.CREDIT, amount, balanceAfter: account.balance, reference: 'opening' }));
  }
}
