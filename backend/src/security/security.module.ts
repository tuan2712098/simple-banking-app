import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshSession } from './entities/refresh-session.entity';
import { SecurityService } from './security.service';
import { RolesGuard } from './roles.guard';
import { UserThrottleGuard } from './user-throttle.guard';

@Module({
  imports: [TypeOrmModule.forFeature([RefreshSession])],
  providers: [SecurityService, RolesGuard, UserThrottleGuard],
  exports: [SecurityService, RolesGuard, UserThrottleGuard],
})
export class SecurityModule {}
