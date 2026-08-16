import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisModule } from '../../../redis/redis.module';
import { AuthFoundationModule } from '../auth-foundation.module';
import { PasswordResetEmailService } from './email/password-reset-email.service';
import { PasswordResetController } from './password-reset.controller';
import { PasswordResetService } from './password-reset.service';
import { ResetTokenStore } from './reset-token.store';

// Sprint 1 / PR B4 (Build Plan Section 4.1): POST /auth/forgot-password
// and POST /auth/reset-password. Self-contained on purpose — B2 (register/
// login), B3 (refresh/logout/verify-email) and B6 are concurrent PRs in
// the same parallel wave, all building out pieces of what will eventually
// be one unified AuthModule under app.module.ts's single commented-out
// `// AuthModule` placeholder. Rather than guess at that shared shape,
// this PR wires its own module directly for now — a normal merge-order
// conflict at app.module.ts is expected and left for whoever merges last
// / the orchestrating session to reconcile, not architected around here.
//
// Imports AuthFoundationModule (B1) for PasswordService and TokenService
// via DI rather than constructing them itself.
@Module({
  imports: [ConfigModule, RedisModule, AuthFoundationModule],
  controllers: [PasswordResetController],
  providers: [PasswordResetService, ResetTokenStore, PasswordResetEmailService, PrismaService],
})
export class PasswordResetModule {}
