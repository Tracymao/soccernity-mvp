import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Sprint 0 infra requirement (MVP Build Plan Section 5) — a real DB check,
// not a hardcoded 200. Runs a trivial query against the live Postgres
// connection on every request rather than caching a last-known-good state.
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'connected' };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          database: 'disconnected',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
