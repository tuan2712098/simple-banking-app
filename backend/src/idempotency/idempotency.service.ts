import { ConflictException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { sha256 } from '../common/hash';
import { IdempotencyKey } from './entities/idempotency-key.entity';

@Injectable()
export class IdempotencyService {
  fingerprint(userId: string, payload: Record<string, unknown>) {
    const ordered = Object.fromEntries(
      Object.entries(payload).sort(([first], [second]) =>
        first.localeCompare(second),
      ),
    );

    return sha256(JSON.stringify({ userId, ...ordered }));
  }

  async lookup(
    manager: EntityManager,
    userId: string,
    key: string,
    requestHash: string,
  ) {
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`${userId}:${key}`],
    );

    const current = await manager.getRepository(IdempotencyKey).findOne({
      where: { userId, key },
    });

    if (!current) {
      return null;
    }

    if (current.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency-Key reused with different payload',
      );
    }

    if (current.expiredAt < new Date()) {
      throw new ConflictException(
        'Expired Idempotency-Key cannot be reused',
      );
    }

    return current.response;
  }

  async save(
    manager: EntityManager,
    userId: string,
    key: string,
    requestHash: string,
    response: Record<string, unknown>,
  ) {
    const record = new IdempotencyKey();

    record.userId = userId;
    record.key = key;
    record.requestHash = requestHash;
    record.response = response;
    record.status = 'completed';
    record.expiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await manager.getRepository(IdempotencyKey).save(record);
  }
}