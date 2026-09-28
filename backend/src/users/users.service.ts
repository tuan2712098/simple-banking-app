import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { User, UserStatus } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  findByEmail(email: string) {
    return this.users.findOne({ where: { email: email.trim().toLowerCase() } });
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

  async create(fullName: string, email: string, passwordHash: string, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(User) : this.users;
    const normalized = email.trim().toLowerCase();
    if (await repo.findOne({ where: { email: normalized } })) throw new ConflictException('Email already exists');
    try {
      return await repo.save(repo.create({ fullName: fullName.trim(), email: normalized, passwordHash }));
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === '23505') throw new ConflictException('Email already exists');
      throw error;
    }
  }

  async setStatus(id: string, status: UserStatus) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    const before = { status: user.status };
    user.status = status;
    user.tokenVersion += 1;
    await this.users.save(user);
    return { id: user.id, before, after: { status: user.status } };
  }

  async remove(id: string) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    await this.users.softDelete(id);
    return { id, deleted: true };
  }

  list() {
    return this.users.find({ select: ['id', 'fullName', 'email', 'role', 'status', 'createdAt'] });
  }
}
