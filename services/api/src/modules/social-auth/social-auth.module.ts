import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { AuthModule } from '../auth/auth.module';
import { RegistrationEmailService } from '../auth/registration/email/registration-email.service';
import { AuthRegistrationModule } from '../auth/registration/registration.module';
import { HttpSocialAuthClient } from './http-social-auth.client';
import { SocialAuthClient } from './social-auth.client';
import { SocialAuthController } from './social-auth.controller';
import { SocialAuthService } from './social-auth.service';
import { SocialAuthStateStore, SocialRegistrationStore } from './social-auth.stores';

// B-084 (Decision Log #378, #468): Google and Facebook sign-in, built behind configuration. See README.md.
//
// Reuses, never copies: AuthService.signInVerifiedUser (status checks, two-factor challenge, session), and
// RegistrationService.register (age checks, guardian flow, country, club join). The real provider client is bound
// here; the unit and e2e specs override SocialAuthClient with an in-memory fake, so no test reaches the network.
@Module({
  imports: [PrismaModule, ConfigModule, RedisModule, AuthFoundationModule, AuthModule, AuthRegistrationModule],
  controllers: [SocialAuthController],
  providers: [
    RegistrationEmailService,
    { provide: SocialAuthClient, useClass: HttpSocialAuthClient },
    SocialAuthStateStore,
    SocialRegistrationStore,
    SocialAuthService,
  ],
})
export class SocialAuthModule {}
