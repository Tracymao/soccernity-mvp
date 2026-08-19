import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';

// Sprint 2 — Section 4.4 (Club & Banter Service), club subset only:
// GET /clubs, GET /clubs/:id, POST /clubs/:id/join. Imports
// AuthFoundationModule so JwtAuthGuard resolves via DI, same pattern
// FeedModule/UsersModule already established.
@Module({
  imports: [AuthFoundationModule],
  controllers: [ClubsController],
  providers: [ClubsService, PrismaService],
})
export class ClubsModule {}
