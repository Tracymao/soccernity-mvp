import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HoldService } from './hold.service';

// backend/w6-hold-rule-extension (B-044). Exports HoldService, the place and lift of the two admin holds
// (legal_hold, bad_faith). No controller: the HTTP endpoints and notifications are B-045, which will import
// this module. The rules that DECIDE whether an account is held live in account-hold.rules.ts (pure
// functions and reads, no provider), so AccountDeletionModule and AdminUsersModule use them without
// importing this module.
@Module({
  providers: [HoldService, PrismaService],
  exports: [HoldService],
})
export class AccountHoldModule {}
