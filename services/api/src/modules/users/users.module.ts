import { Module } from '@nestjs/common';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageModule } from '../../storage/storage.module';
import { UserAvatarController } from './user-avatar.controller';
import { UserAvatarService } from './user-avatar.service';
import { UsersController } from './users.controller';
import { UsernamePolicyService } from './username-policy.service';
import { UsersService } from './users.service';

// Sprint 1 / PR B6 — Section 4.2 (User Service), self-profile scope only for now.
// See users.controller.ts for the exact routes and the spec-vs-brief
// discrepancy this PR flags.
//
// Imports AuthFoundationModule so JwtAuthGuard (and TokenService, which
// the guard depends on) resolve via DI — this is the pattern every future
// module protecting a route should follow, per
// auth-foundation.module.ts's own doc comment.
//
// backend/w5-profile-block (B-035): StorageModule + UserAvatarController/Service
// for the profile picture (POST/DELETE /users/:id/avatar), on the same
// StorageService the admin media upload uses.
@Module({
  imports: [AuthFoundationModule, StorageModule],
  controllers: [UsersController, UserAvatarController],
  providers: [UsersService, UsernamePolicyService, UserAvatarService, PrismaService],
})
export class UsersModule {}
