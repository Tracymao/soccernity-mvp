import { Module } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisModule } from '../../../redis/redis.module';
import { ClubsModule } from '../../clubs/clubs.module';
import { AuthFoundationModule } from '../auth-foundation.module';
import { EmailVerificationTokenStore } from './email-verification/email-verification-token.store';
import { RegistrationEmailService } from './email/registration-email.service';
import { RegistrationController } from './registration.controller';
import { RegistrationService } from './registration.service';

// Sprint 1 / PR B2 — POST /auth/register, POST /auth/verify-email
// (Build Plan Section 4.1), built against B1's AuthFoundationModule
// (PasswordService, TokenService, @AuthRateLimit()).
//
// Deliberately its own self-contained module — not "AuthModule" — so
// this PR doesn't collide with B3/B4/B6, which are being built
// concurrently in their own worktrees and will also need to wire
// endpoints into app.module.ts. Each of those PRs should do the same
// (its own scoped module), per this task's brief. A small, expected
// merge-order conflict in app.module.ts when these land sequentially is
// fine and not something to architect around.
// ClubsModule imported (sprint-2/auto-join-on-signup) so RegistrationService
// can inject ClubsService and implement auto-join on signup
// (RegisterDto.clubId) — Build Plan Section 6's Sprint 2 line, left unbuilt
// when club pages themselves shipped in PR #58. No circularity risk:
// ClubsModule imports AuthFoundationModule (not AuthRegistrationModule),
// same as this module already does directly.
@Module({
  imports: [AuthFoundationModule, RedisModule, ClubsModule],
  controllers: [RegistrationController],
  providers: [PrismaService, RegistrationService, EmailVerificationTokenStore, RegistrationEmailService],
})
export class AuthRegistrationModule {}
