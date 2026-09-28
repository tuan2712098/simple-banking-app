import { UnauthorizedException } from '@nestjs/common';
import { SecurityService } from './security.service';

it('hashes refresh token before storing', async () => {
  const save = jest.fn().mockResolvedValue({});
  const service = new SecurityService({ save, create: (item: unknown) => item } as any);
  const token = await service.issue('user', '127.0.0.1', 'Jest');
  expect(token.length).toBeGreaterThan(30);
  expect(save.mock.calls[0][0].tokenHash).not.toBe(token);
  expect(save.mock.calls[0][0].tokenHash).toHaveLength(64);
});

it('rejects revoked refresh token', async () => {
  const service = new SecurityService({ findOne: async () => ({ revokedAt: new Date(), expiresAt: new Date(Date.now() + 1000) }) } as any);
  await expect(service.rotate('token', '127.0.0.1', 'Jest')).rejects.toBeInstanceOf(UnauthorizedException);
});
