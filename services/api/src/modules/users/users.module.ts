import { Module } from '@nestjs/common';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// Sprint 1 / PR B6 — Section 4.2 (User Service), self-profile scope only.
// See users.controller.ts for the exact routes and the spec-vs-brief
// discrepancy this PR flags.
//
// Imports AuthFoundationModule so JwtAuthGuard (and TokenService, which
// the guard depends on) resolve via DI — this is the pattern every future
// module protecting a route should follow, per
// auth-foundation.module.ts's own doc comment.
@Module({
  imports: [AuthFoundationModule],
  controllers: [UsersController],
  providers: [UsersService, PrismaService],
})
export class UsersModule {}
