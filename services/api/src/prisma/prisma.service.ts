import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Minimal PrismaService — Sprint 0 infra (health check) needs a real DB
// connection to verify against. Feature modules (Sprint 1+) should inject
// this rather than instantiating their own PrismaClient.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
