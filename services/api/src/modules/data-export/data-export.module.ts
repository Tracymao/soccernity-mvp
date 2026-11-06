import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoModule } from '../../crypto/crypto.module';
import { StorageModule } from '../../storage/storage.module';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { DataExportController } from './data-export.controller';
import { DataExportSweepService } from './data-export-sweep.service';
import { DataExportService } from './data-export.service';

// backend/b060-data-export (B-060; Decision Log #472 (g)). AuthFoundationModule: JwtAuthGuard and PasswordService.
// StorageModule: the private file. CryptoModule: the date of birth is stored encrypted and decrypted for its owner.
// APP_CLOCK comes from the global ClockModule; ScheduleModule is registered once in app.module.ts.
@Module({
  imports: [AuthFoundationModule, StorageModule, CryptoModule],
  controllers: [DataExportController],
  providers: [DataExportService, DataExportSweepService, PrismaService],
})
export class DataExportModule {}
