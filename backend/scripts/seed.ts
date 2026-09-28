import * as bcrypt from 'bcrypt';
import { dataSource } from './db';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Account, AccountStatus, AccountTier } from '../src/accounts/entities/account.entity';
import { LedgerEntry, LedgerEntryType } from '../src/ledger/entities/ledger-entry.entity';

const demo = [
  { fullName: 'Pham Anh Tuan', email: 'tuan@example.com', role: UserRole.CUSTOMER, balance: '1000000.00' },
  { fullName: 'Nguyen Van An', email: 'an@example.com', role: UserRole.CUSTOMER, balance: '1000000.00' },
  { fullName: 'Tran Van Binh', email: 'binh@example.com', role: UserRole.CUSTOMER, balance: '1000000.00' },
  { fullName: 'Giao Dich Vien', email: 'teller@example.com', role: UserRole.TELLER, balance: '0.00' },
  { fullName: 'Quan Tri Vien', email: 'admin@example.com', role: UserRole.ADMIN, balance: '0.00' },
];

async function main() {
  await dataSource.initialize();
  const hash = await bcrypt.hash('Demo@123456', 12);
  for (let index = 0; index < demo.length; index += 1) {
    const row = demo[index];
    const accountNumber = `900000000${(index + 1).toString().padStart(3, '0')}`;
    await dataSource.transaction(async (manager) => {
      let user = await manager.findOne(User, { where: { email: row.email } });
      if (!user) {
        user = await manager.save(User, manager.create(User, {
          fullName: row.fullName,
          email: row.email,
          passwordHash: hash,
          role: row.role,
          status: UserStatus.ACTIVE,
        }));
      }
      let account = await manager.findOne(Account, { where: { user: { id: user.id } } });
      if (!account) {
        account = await manager.save(Account, manager.create(Account, {
          user,
          accountNumber,
          balance: row.balance,
          currency: 'VND',
          status: AccountStatus.ACTIVE,
          tier: AccountTier.STANDARD,
        }));
      }
      const exists = await manager.findOne(LedgerEntry, { where: { account: { id: account.id }, reference: 'opening' } });
      if (!exists && row.balance !== '0.00') {
        await manager.insert(LedgerEntry, {
          account,
          transaction: null,
          type: LedgerEntryType.CREDIT,
          amount: account.balance,
          balanceAfter: account.balance,
          reference: 'opening',
        });
      }
      process.stdout.write(`${row.email} | ${account.accountNumber} | ${account.balance}\n`);
    });
  }
  await dataSource.destroy();
}

main().catch(async (error) => {
  process.stderr.write(`${String(error)}\n`);
  if (dataSource.isInitialized) await dataSource.destroy();
  process.exitCode = 1;
});
