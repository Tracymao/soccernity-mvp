import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthFoundationModule } from './auth-foundation.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

// Sprint 1 / PR B3 — login, refresh, logout (Build Plan Section 4.1 /
// 5.7). Self-contained on purpose: app.module.ts's `// AuthModule`
// placeholder is being contended for by B2/B4/B6 in this same parallel
// wave, so this module doesn't try to pre-resolve that merge — it just
// needs `AuthModule` (this class) imported into app.module.ts once PRs
// land, same as every other Sprint 1 backend PR in the wave.
//
// PrismaService is provided directly here (not from a shared
// PrismaModule) because no such shared module exists yet — HealthModule
// (src/health/health.module.ts) does the same thing today. If a future PR
// introduces a global PrismaModule, this provider should be dropped in
// favour of importing that instead.
@Module({
  imports: [AuthFoundationModule],
  controllers: [AuthController],
  providers: [AuthService, PrismaService],
})
export class AuthModule {}
