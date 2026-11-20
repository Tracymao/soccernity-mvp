import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

// Sprint 1 infra addition (Build Plan Section 5.7): the refresh-token store
// needs a persistent, revocable place to live. Redis is already an approved
// part of the stack (Section 5) and docker-compose.yml / .env.example
// already provision REDIS_URL — this just wires a NestJS-shaped client
// around it. No new infrastructure decision here, just reuse of an
// existing one.
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: RedisService,
      useFactory: (config: ConfigService) =>
        new RedisService(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379'),
      inject: [ConfigService],
    },
  ],
  exports: [RedisService],
})
export class RedisModule {}
