import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import {
  AUTH_THROTTLER_NAME,
  DEFAULT_AUTH_RATE_LIMIT,
  DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS,
} from './rate-limit.constants';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: AUTH_THROTTLER_NAME,
          ttl: Number(config.get('AUTH_RATE_LIMIT_WINDOW_MS')) || DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS,
          limit: Number(config.get('AUTH_RATE_LIMIT_MAX')) || DEFAULT_AUTH_RATE_LIMIT,
        },
      ],
    }),
  ],
  exports: [ThrottlerModule],
})
export class AuthRateLimitModule {}
