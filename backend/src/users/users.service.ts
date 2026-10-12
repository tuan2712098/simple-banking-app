
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { User, UserRole, UserStatus } from './entities/user.entity';
import { Account, AccountStatus } from '../accounts/entities/account.entity';

interface StaffCustomerRow {
  id: string;
  fullName: string;
  email: string;
  accountNumber: string;
  accountStatus: string;
  currency: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Account)
    private readonly accounts: Repository<Account>,
  ) {}

  findByEmail(email: string) {
    return this.users.findOne({
      where: { email: email.trim().toLowerCase() },
    });
  }

  findByEmailWithPassword(email: string) {
    return this.users.createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('LOWER(user.email) = LOWER(:email)', { email: email.trim() })
      .andWhere('user.deleted_at IS NULL')
      .getOne();
  }

  findById(id: string) {
    return this.users.findOne({ where: { id } });
  }

  async create(
    fullName: string,
    email: string,
    passwordHash: string,
    manager?: EntityManager,
  ) {
    const repo = manager ? manager.getRepository(User) : this.users;
    const normalized = email.trim().toLowerCase();

    if (await repo.findOne({ where: { email: normalized } })) {
      throw new ConflictException('Email already exists');
    }

    try {
      return await repo.save(
        repo.create({
          fullName: fullName.trim(),
          email: normalized,
          passwordHash,
        }),
      );
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === '23505') {
        throw new ConflictException('Email already exists');
      }
      throw error;
    }
  }

  async setStatus(id: string, status: UserStatus) {
    const user = await this.users.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const before = { status: user.status };

    user.status = status;
    user.tokenVersion += 1;

    await this.users.save(user);

    return {
      id: user.id,
      before,
      after: { status: user.status },
    };
  }

  async remove(id: string) {
    const user = await this.users.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.users.softDelete(id);

    return { id, deleted: true };
  }

  list() {
    return this.users.find({
      select: ['id', 'fullName', 'email', 'role', 'status', 'createdAt'],
    });
  }

  async listStaffCustomers() {
    const rows = await this.accounts
      .createQueryBuilder('account')
      .innerJoin('account.user', 'owner')
      .select('owner.id', 'id')
      .addSelect('owner.fullName', 'fullName')
      .addSelect('owner.email', 'email')
      .addSelect('account.accountNumber', 'accountNumber')
      .addSelect('account.status', 'accountStatus')
      .addSelect('account.currency', 'currency')
      .where('owner.role = :role', {
        role: UserRole.CUSTOMER,
      })
      .andWhere('owner.status = :userStatus', {
        userStatus: UserStatus.ACTIVE,
      })
      .orderBy('owner.fullName', 'ASC')
      .addOrderBy('account.accountNumber', 'ASC')
      .getRawMany<StaffCustomerRow>();

    const accountCounts = new Map<string, number>();

    for (const row of rows) {
      accountCounts.set(
        row.id,
        (accountCounts.get(row.id) ?? 0) + 1,
      );
    }

    return rows
      .filter(
        (row) =>
          accountCounts.get(row.id) === 1 &&
          row.accountStatus === AccountStatus.ACTIVE &&
          row.currency === 'VND',
      )
      .map((row) => ({
        id: row.id,
        fullName: row.fullName,
        email: row.email,
        accountNumber: row.accountNumber,
      }));
  }
}
