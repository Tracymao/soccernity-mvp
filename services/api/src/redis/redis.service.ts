import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

// Thin wrapper around the ioredis client, mirroring the PrismaService
// pattern (src/prisma/prisma.service.ts) — extends the real client so
// callers get its full method surface, and handles teardown on module
// destroy. Constructed via a factory provider in RedisModule so the
// connection URL comes from ConfigService rather than reading
// process.env directly here.
@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor(url: string) {
    super(url, {
      // Fail fast rather than queuing commands forever against a Redis
      // instance that never comes up — matches the "real DB check, not a
      // hardcoded 200" spirit of the Sprint 0 health check.
      maxRetriesPerRequest: 3,
    });
  }

  onModuleDestroy() {
    this.disconnect();
  }
}
