import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Response, Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthenticatedRequest } from '../common/auth-request';
import { Audit } from '../audit/audit.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private cookie(res: Response, token: string) {
    res.cookie('refreshToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  @Post('register')
  @Audit('register', 'user')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { refreshToken, ...result } = await this.auth.register(dto, req.ip || '', req.get('user-agent') || '');
    this.cookie(res, refreshToken);
    return result;
  }

  @Post('login')
  @Audit('login', 'user')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { refreshToken, ...result } = await this.auth.login(dto, req.ip || '', req.get('user-agent') || '');
    this.cookie(res, refreshToken);
    return result;
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.headers.cookie?.split(';').map((x) => x.trim()).find((x) => x.startsWith('refreshToken='))?.slice(13) || '';
    const { refreshToken, ...result } = await this.auth.refresh(raw, req.ip || '', req.get('user-agent') || '');
    this.cookie(res, refreshToken);
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Audit('logout', 'user')
  @Post('logout')
  async logout(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.logout(req.user.userId);
    res.clearCookie('refreshToken', { path: '/auth' });
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Audit('change_password', 'user')
  @Post('change-password')
  changePassword(@Req() req: AuthenticatedRequest, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(req.user.userId, dto.currentPassword, dto.newPassword);
  }
}
