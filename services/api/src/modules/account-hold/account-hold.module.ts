import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { HoldService } from './hold.service';

// backend/w6-hold-rule-extension (B-044). Exports HoldService, the place and lift of the two admin holds
// (legal_hold, bad_faith). No controller: the HTTP endpoints and notifications are B-045, which will import
// this module. The rules that DECIDE whether an account is held live in account-hold.rules.ts (pure
// functions and reads, no provider), so AccountDeletionModule and AdminUsersModule use them without
// importing this module.
@Module({
  imports: [PrismaModule],
  providers: [HoldService],
  exports: [HoldService],
})
export class AccountHoldModule {}
