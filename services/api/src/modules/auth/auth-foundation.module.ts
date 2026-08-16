import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { RedisModule } from '../../redis/redis.module';
import { PasswordService } from './password/password.service';
import { AuthRateLimitModule } from './rate-limit/rate-limit.module';
import { RefreshTokenStore } from './token/refresh-token.store';
import { TokenService } from './token/token.service';

// Sprint 1 / PR B1 — auth infrastructure only (Build Plan Section 5.7).
// No controllers here on purpose: /auth/register, /auth/login, /auth/
// refresh, /auth/logout etc. (Section 4.1) are separate follow-up PRs
// (B2-B4). Import AuthFoundationModule into the AuthModule those PRs
// build, and inject PasswordService / TokenService into its controllers;
// apply @AuthRateLimit() (rate-limit/auth-rate-limit.decorator.ts) to the
// login and register handlers specifically.
//
// JWT_SECRET must be a real generated value before any deployment, not
// the .env.example placeholder (Section 5.7) — that's an ops/deploy-time
// concern (also gated on Decision Log #9, hosting), not something this
// module can enforce at build time.
@Module({
  imports: [
    ConfigModule,
    RedisModule,
    AuthRateLimitModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        // Per-token expiresIn is set explicitly by TokenService on every
        // sign() call (access vs refresh-adjacent use), so no default
        // signOptions.expiresIn here.
      }),
    }),
  ],
  providers: [PasswordService, TokenService, RefreshTokenStore],
  exports: [PasswordService, TokenService, RefreshTokenStore],
})
export class AuthFoundationModule {}
