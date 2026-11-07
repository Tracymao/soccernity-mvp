import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// The ONE place PrismaService is provided.
//
// Before this module existed, about 40 feature modules each listed
// `PrismaService` in their own `providers`. Nest creates one instance of a
// provider PER MODULE that declares it, and PrismaService extends PrismaClient,
// so one app boot opened about 40 separate Prisma clients, each with its own
// connection pool (default size: 2 x CPUs + 1, so 9 on a 4-vCPU CI runner).
// With Postgres's default max_connections of 100 that was one new module away
// from "FATAL: sorry, too many clients already", which on 2026-11-07 failed
// e2e suites in CI and then left Jest hanging (the failed app never closed its
// pools). It also meant production opened far more connections than needed.
//
// Feature modules import this module instead of providing PrismaService, so
// the whole app shares a single client and a single pool. `src/prisma/
// prisma-single-instance.spec.ts` fails the build if a module goes back to
// providing it directly.
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
