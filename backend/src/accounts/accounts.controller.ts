import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/auth-request';
import { EmailDto } from './dto/account.dto';
import { Audit } from '../audit/audit.decorator';

@UseGuards(JwtAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get('me')
  async getMyAccount(@Req() request: AuthenticatedRequest) {
    const account = await this.accounts.requireAccount(request.user.userId);
    return {
      id: account.id,
      accountNumber: account.accountNumber,
      balance: account.balance,
      holdAmount: account.holdAmount,
      currency: account.currency,
      status: account.status,
      tier: account.tier,
      createdAt: account.createdAt,
    };
  }

  @Patch('me/email')
  @Audit('change_email', 'user')
  changeEmail(@Req() request: AuthenticatedRequest, @Body() dto: EmailDto) {
    return this.accounts.changeEmail(request.user.userId, dto.email);
  }

  @Get('me/history')
  history(@Req() request: AuthenticatedRequest) {
    return this.accounts.history(request.user.userId);
  }
}
