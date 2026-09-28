import { ConflictException } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';

const service = new IdempotencyService();

it('hashes identical requests deterministically', () => {
  const input = {
    amount: '100.00',
    toAccountNumber: '12345678',
    description: 'test',
  };

  expect(service.fingerprint('u', input)).toBe(
    service.fingerprint('u', input),
  );

  expect(service.fingerprint('u', input)).not.toBe(
    service.fingerprint('u', { ...input, amount: '200.00' }),
  );

  expect(service.fingerprint('a', input)).not.toBe(
    service.fingerprint('b', input),
  );
});

it('returns cached identical response', async () => {
  const response = { id: 'once', status: 'COMPLETED' };

  const manager = {
    query: jest.fn().mockResolvedValue([]),
    getRepository: () => ({
      findOne: jest.fn().mockResolvedValue({
        requestHash: 'abc',
        response,
        expiredAt: new Date(Date.now() + 1000),
      }),
    }),
  } as any;

  expect(await service.lookup(manager, 'u', 'k', 'abc')).toEqual(response);

  expect(manager.query).toHaveBeenCalledWith(
    expect.stringContaining('pg_advisory_xact_lock'),
    ['u:k'],
  );
});

it('rejects mismatched payload and expired key', async () => {
  const holder = {
    requestHash: 'old',
    response: { id: 'once' },
    expiredAt: new Date(Date.now() + 1000),
  };

  const manager = {
    query: jest.fn(),
    getRepository: () => ({
      findOne: async () => holder,
    }),
  } as any;

  await expect(
    service.lookup(manager, 'u', 'k', 'new'),
  ).rejects.toBeInstanceOf(ConflictException);

  holder.expiredAt = new Date(0);

  await expect(
    service.lookup(manager, 'u', 'k', 'old'),
  ).rejects.toBeInstanceOf(ConflictException);
});

it('stores completed key with expiration', async () => {
  const save = jest.fn().mockResolvedValue(undefined);

  const manager = {
    getRepository: () => ({ save }),
  } as any;

  await service.save(manager, 'u', 'k', 'hash', { id: 'x' });

  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: 'u',
      key: 'k',
      requestHash: 'hash',
      response: { id: 'x' },
      status: 'completed',
      expiredAt: expect.any(Date),
    }),
  );
});