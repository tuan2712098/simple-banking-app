import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { UserStatus } from '../users/entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly users: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; version: number }) {
    const user = await this.users.findById(payload.sub);
    if (!user || user.status !== UserStatus.ACTIVE || (user.lockedUntil !== null && user.lockedUntil > new Date()) || user.tokenVersion !== payload.version) {
      throw new UnauthorizedException('Session expired');
    }
    return { userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion };
  }
}
