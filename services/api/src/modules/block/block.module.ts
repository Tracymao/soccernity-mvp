import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { BlockController } from './block.controller';
import { BlockService } from './block.service';

// backend/w5-profile-block -- the Block write side (see BlockService). The
// read-side enforcement is NOT a provider here: it is the pure helpers in
// block.util.ts, called from the services that serve each surface, so no other
// module has to import this one.
@Module({
  imports: [AuthFoundationModule],
  controllers: [BlockController],
  providers: [BlockService, PrismaService],
})
export class BlockModule {}
