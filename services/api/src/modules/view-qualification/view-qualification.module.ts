import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisModule } from '../../redis/redis.module';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { PointsModule } from '../points/points.module';
import { ViewQualificationController } from './view-qualification.controller';
import { ViewQualificationService } from './view-qualification.service';

// backend/w12-points (B-093). Server-validated view heartbeats. See README.md.
@Module({
  imports: [AuthFoundationModule, PointsModule, RedisModule],
  controllers: [ViewQualificationController],
  providers: [ViewQualificationService, PrismaService],
})
export class ViewQualificationModule {}
