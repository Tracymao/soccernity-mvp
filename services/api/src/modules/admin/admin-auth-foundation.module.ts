import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { RedisModule } from '../../redis/redis.module';
import { PasswordService } from '../auth/password/password.service';
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard';
import { AdminRefreshTokenStore } from './token/admin-refresh-token.store';
import { AdminTokenService } from './token/admin-token.service';

// Sprint 2 / sprint-2/admin-console-account-entity (Decision Log #54) —
// Admin Console auth infrastructure, mirroring
// services/api/src/modules/auth/auth-foundation.module.ts's own role for
// the User side, but a deliberately SEPARATE module, not an extension of
// it. This module's own JwtModule.registerAsync() is configured from
// ADMIN_JWT_SECRET, never JWT_SECRET — registering JwtModule a second
// time here, inside this module's own encapsulated injector, gives
// AdminTokenService its own independently-configured JwtService instance
// (NestJS modules are singletons deduplicated by class reference, but
// JwtModule.registerAsync() here is a fresh dynamic-module registration
// scoped to THIS module, distinct from AuthFoundationModule's own,
// unrelated registration — the two never share a JwtService). See
// admin-token.service.ts's header comment for the full "why genuinely
// separate, not shared" reasoning, proven end-to-end by
// admin-auth-isolation.e2e-spec.ts.
//
// Deliberately does NOT import AuthFoundationModule — importing it would
// expose TokenService / RefreshTokenStore / JwtAuthGuard /
// GuardianConsentGuard (all User-typed, all irrelevant to the Admin
// Console) into this module's own provider graph, creating exactly the
// kind of accidental cross-wiring risk this whole module exists to avoid.
// What IS reused from services/api/src/modules/auth/ are two genuinely
// generic, stateless utility CLASSES with zero User-specific assumptions
// — PasswordService (plain argon2id wrapper, no dependencies) is
// registered here as its own separate provider instance (safe, since it
// carries no state), and RedisModule (an app-wide, non-User-typed Redis
// client factory already imported by three other modules in this
// codebase — see auth-foundation.module.ts, password-reset.module.ts,
// registration.module.ts — and deduplicated to one shared RedisService
// singleton by Nest's own module resolution, the same way it already is
// across those three).
@Module({
  imports: [
    ConfigModule,
    RedisModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('ADMIN_JWT_SECRET'),
      }),
    }),
  ],
  providers: [PasswordService, AdminTokenService, AdminRefreshTokenStore, AdminJwtAuthGuard],
  exports: [PasswordService, AdminTokenService, AdminRefreshTokenStore, AdminJwtAuthGuard],
})
export class AdminAuthFoundationModule {}
