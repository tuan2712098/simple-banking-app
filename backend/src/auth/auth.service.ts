import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { AccountsService } from '../accounts/accounts.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { User, UserStatus } from '../users/entities/user.entity';
import { SecurityService } from '../security/security.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly accounts: AccountsService,
    private readonly jwt: JwtService,
    private readonly dataSource: DataSource,
    private readonly security: SecurityService,
  ) {}

  private publicUser(user: User) {
    return { id: user.id, fullName: user.fullName, email: user.email, role: user.role, status: user.status, createdAt: user.createdAt };
  }

  private async tokens(user: User, ip: string, userAgent: string) {
    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role, version: user.tokenVersion });
    const refreshToken = await this.security.issue(user.id, ip, userAgent);
    return { accessToken, refreshToken };
  }

  async register(dto: RegisterDto, ip = '', userAgent = '') {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const { user, account } = await this.dataSource.transaction(async (manager) => {
      const user = await this.users.create(dto.fullName, dto.email, passwordHash, manager);
      const account = await this.accounts.createForUser(user, manager);
      return { user, account };
    });
    return {
      user: this.publicUser(user),
      account: { id: account.id, accountNumber: account.accountNumber, balance: account.balance, currency: account.currency },
      ...(await this.tokens(user, ip, userAgent)),
    };
  }

  async login(dto: LoginDto, ip = '', userAgent = '') {
    const user = await this.users.findByEmailWithPassword(dto.email);
    if (!user) throw new UnauthorizedException('Invalid email or password');
    if (user.status !== UserStatus.ACTIVE) throw new UnauthorizedException('Account is locked');
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new UnauthorizedException('Too many login attempts');
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      const now = new Date();
      const recent = user.firstFailedAt && now.getTime() - user.firstFailedAt.getTime() < 60_000;
      user.failedLogins = recent ? user.failedLogins + 1 : 1;
      user.firstFailedAt = recent ? user.firstFailedAt : now;
      if (user.failedLogins >= 5) user.lockedUntil = new Date(now.getTime() + 15 * 60_000);
      await this.dataSource.getRepository(User).save(user);
      throw new UnauthorizedException('Invalid email or password');
    }
    user.failedLogins = 0;
    user.firstFailedAt = null;
    user.lockedUntil = null;
    await this.dataSource.getRepository(User).save(user);
    return { user: this.publicUser(user), ...(await this.tokens(user, ip, userAgent)) };
  }

  async refresh(raw: string, ip = '', userAgent = '') {
    if (!raw) throw new UnauthorizedException('Refresh token missing');
    const rotated = await this.security.rotate(raw, ip, userAgent);
    const user = await this.users.findById(rotated.userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      await this.security.revokeAll(rotated.userId);
      throw new UnauthorizedException('Account unavailable');
    }
    return { user: this.publicUser(user), accessToken: await this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role, version: user.tokenVersion }), refreshToken: rotated.token };
  }

  async logout(userId: string) {
    await this.security.revokeAll(userId);
    await this.dataSource.getRepository(User).increment({ id: userId }, 'tokenVersion', 1);
    return { loggedOut: true };
  }

  async changePassword(userId: string, current: string, replacement: string) {
    const user = await this.dataSource.getRepository(User).createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :userId', { userId })
      .getOne();
    if (!user || !await bcrypt.compare(current, user.passwordHash)) throw new UnauthorizedException('Invalid password');
    user.passwordHash = await bcrypt.hash(replacement, 12);
    await this.dataSource.getRepository(User).save(user);
    await this.logout(userId);
    return { passwordChanged: true };
  }
}
