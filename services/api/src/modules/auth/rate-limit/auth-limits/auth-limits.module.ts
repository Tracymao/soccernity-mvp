import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '../../../../redis/redis.module';
import { AuthLimitsInterceptor } from './auth-limits.interceptor';
import { AuthLimitsService } from './auth-limits.service';
import { AuthLimitsStore } from './auth-limits.store';

// Re-exported by AuthFoundationModule so every module that hosts one of the three @AuthLimit() routes
// (auth, registration, password-reset) can resolve the interceptor without importing this directly.
@Module({
  imports: [ConfigModule, RedisModule],
  providers: [AuthLimitsStore, AuthLimitsService, AuthLimitsInterceptor],
  exports: [AuthLimitsStore, AuthLimitsService, AuthLimitsInterceptor],
})
export class AuthLimitsModule {}
