import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { sha256 } from '../common/hash';
import { RefreshSession } from './entities/refresh-session.entity';

@Injectable()
export class SecurityService {
  constructor(@InjectRepository(RefreshSession) private readonly sessions: Repository<RefreshSession>) {}

  async issue(userId: string, ip: string, userAgent: string) {
    const raw = randomBytes(48).toString('base64url');
    await this.sessions.save(this.sessions.create({
      userId,
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ipAddress: ip.slice(0, 80),
      userAgent: userAgent.slice(0, 255),
      revokedAt: null,
    }));
    return raw;
  }

  async rotate(raw: string, ip: string, userAgent: string) {
    const record = await this.sessions.findOne({ where: { tokenHash: sha256(raw) } });
    if (!record || record.revokedAt || record.expiresAt <= new Date()) throw new UnauthorizedException('Refresh token expired or revoked');
    const changed = await this.sessions.createQueryBuilder()
      .update(RefreshSession)
      .set({ revokedAt: new Date() })
      .where('id = :id AND revoked_at IS NULL', { id: record.id })
      .execute();
    if (changed.affected !== 1) throw new UnauthorizedException('Refresh token already used');
    const token = await this.issue(record.userId, ip, userAgent);
    return { userId: record.userId, token };
  }

  revokeAll(userId: string) {
    return this.sessions.createQueryBuilder().update(RefreshSession)
      .set({ revokedAt: new Date() })
      .where('user_id = :id AND revoked_at IS NULL', { id: userId })
      .execute();
  }
}
