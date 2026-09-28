import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../users/entities/user.entity';

it('does not let a customer use admin endpoints', () => {
  const reflector = { getAllAndOverride: () => [UserRole.ADMIN] } as unknown as Reflector;
  const guard = new RolesGuard(reflector);
  const context = { getHandler: () => ({}), getClass: () => ({}), switchToHttp: () => ({ getRequest: () => ({ user: { role: UserRole.CUSTOMER } }) }) } as any;
  expect(() => guard.canActivate(context)).toThrow();
  const tellerContext = { getHandler: () => ({}), getClass: () => ({}), switchToHttp: () => ({ getRequest: () => ({ user: { role: UserRole.TELLER } }) }) } as any;
  expect(() => guard.canActivate(tellerContext)).toThrow();
});

it('accepts allowed admin and public endpoints', () => {
  const reflector = { getAllAndOverride: () => [UserRole.ADMIN] } as unknown as Reflector;
  const guard = new RolesGuard(reflector);
  const context = { getHandler: () => ({}), getClass: () => ({}), switchToHttp: () => ({ getRequest: () => ({ user: { role: UserRole.ADMIN } }) }) } as any;
  expect(guard.canActivate(context)).toBe(true);
  const publicGuard = new RolesGuard({ getAllAndOverride: () => undefined } as unknown as Reflector);
  expect(publicGuard.canActivate(context)).toBe(true);
});
