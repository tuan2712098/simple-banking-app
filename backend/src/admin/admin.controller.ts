import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/auth-request';
import { Roles } from '../security/roles.decorator';
import { RolesGuard } from '../security/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { UserStatusDto } from './dto/admin.dto';
import { AccountStatusDto, AccountTierDto } from '../accounts/dto/account.dto';
import { UsersService } from '../users/users.service';
import { AccountsService } from '../accounts/accounts.service';
import { TransactionsService } from '../transactions/transactions.service';
import { AuditService } from '../audit/audit.service';
import { Audit } from '../audit/audit.decorator';
import { ReviewStatus } from '../transactions/entities/transaction.entity';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly users: UsersService,
    private readonly accounts: AccountsService,
    private readonly transactions: TransactionsService,
    private readonly audit: AuditService,
  ) {}

  @Get('users')
  usersList() {
    return this.users.list();
  }

  @Patch('users/:id/status')
  @Audit('change_user_status', 'user')
  updateUserStatus(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UserStatusDto) {
    return this.users.setStatus(id, dto.status);
  }

  @Patch('accounts/:id/status')
  @Audit('change_account_status', 'account')
  updateAccountStatus(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: AccountStatusDto) {
    return this.accounts.setStatus(id, dto.status);
  }

  @Patch('accounts/:id/tier')
  @Audit('change_account_tier', 'account')
  updateAccountTier(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: AccountTierDto) {
    return this.accounts.setTier(id, dto.tier);
  }

  @Delete('accounts/:id')
  @Audit('soft_delete_account', 'account')
  deleteAccount(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.accounts.deleteAccount(id);
  }

  @Delete('users/:id')
  @Audit('soft_delete_user', 'user')
  deleteUser(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.users.remove(id);
  }

  @Get('audit-logs')
  async logs(@Query('page') page = '1', @Query('limit') limit = '20') {
    const result = await this.audit.list(Math.max(Number(page) || 1, 1), Math.max(Number(limit) || 20, 1));
    return { data: result[0], total: result[1] };
  }

  @Get('transactions')
  transactionsList() {
    return this.transactions.listAll();
  }

  @Get('flagged-transactions')
  flagged() {
    return this.transactions.listFlagged();
  }

  @Patch('flagged-transactions/:id/approve')
  @Audit('approve_review', 'transaction')
  approve(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.transactions.review(id, ReviewStatus.APPROVED);
  }

  @Patch('flagged-transactions/:id/reject')
  @Audit('reject_review', 'transaction')
  reject(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.transactions.review(id, ReviewStatus.REJECTED);
  }

  @Post('transactions/:id/approve-large')
  @Audit('approve_large_transfer', 'transaction')
  approveLarge(@Req() request: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.transactions.approveLarge(id, request.user.userId);
  }

  @Post('transactions/:id/reverse')
  @Audit('reverse_transfer', 'transaction')
  reverse(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.transactions.reverse(id);
  }
}
