
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../security/roles.guard';
import { Roles } from '../security/roles.decorator';
import { UserRole } from './entities/user.entity';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TELLER, UserRole.ADMIN)
@Controller('staff')
export class StaffController {
  constructor(
    private readonly usersService: UsersService,
  ) {}

  @Get('customers')
  getCustomers() {
    return this.usersService.listStaffCustomers();
  }
}
