import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { DirectUploadStorageService } from '../../storage/direct-upload-storage.service';
import { DATA_EXPORT_RETENTION_DAYS, DATA_EXPORT_STALE_PREPARING_MINUTES } from './data-export.constants';

export interface DataExportSweepResult {
  markedFailed: number;
  expiredRemoved: number;
  expiredKept: number;
  failedRowsRemoved: number;
}

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

// backend/b060-data-export (B-060; Decision Log #472 (g)). The daily clean-up for "Download my data":
//   1. a request still 'preparing' after DATA_EXPORT_STALE_PREPARING_MINUTES was lost (the process stopped
//      while building it) -> 'failed', so the person can ask again;
//   2. a 'ready' request past expiresAt: its stored file is deleted, then the row. If the file cannot be deleted
//      the row is KEPT so the next run retries (an orphaned personal file must not be forgotten);
//   3. a 'failed' request older than the retention period: the row is removed (it has no file).
// Daily at 04:15, after the 04:00 media sweep; reads the app clock like the other sweeps. Not exposed over HTTP.
@Injectable()
export class DataExportSweepService {
  private readonly logger = new Logger(DataExportSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DirectUploadStorageService,
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  @Cron('0 15 4 * * *')
  async scheduledSweep(): Promise<void> {
    try {
      const result = await this.sweep();
      this.logger.log(
        `Data export sweep: ${result.markedFailed} stale marked failed, ${result.expiredRemoved} expired removed, ` +
          `${result.expiredKept} kept for retry, ${result.failedRowsRemoved} failed rows removed.`,
      );
    } catch (err) {
      this.logger.error(`Data export sweep failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async sweep(now: Date = this.clock.now()): Promise<DataExportSweepResult> {
    const staleBefore = new Date(now.getTime() - DATA_EXPORT_STALE_PREPARING_MINUTES * MINUTE_MS);
    const marked = await this.prisma.dataExportRequest.updateMany({
      where: { status: 'preparing', createdAt: { lte: staleBefore } },
      data: { status: 'failed' },
    });

    let expiredRemoved = 0;
    let expiredKept = 0;
    const expired = await this.prisma.dataExportRequest.findMany({
      where: { status: 'ready', expiresAt: { lte: now } },
      select: { id: true, fileKey: true },
      orderBy: { expiresAt: 'asc' },
    });
    for (const row of expired) {
      try {
        if (row.fileKey) await this.storage.delete(row.fileKey);
        await this.prisma.dataExportRequest.deleteMany({ where: { id: row.id } });
        expiredRemoved += 1;
      } catch {
        expiredKept += 1;
        this.logger.warn(`Data export ${row.id}: the stored file could not be removed; the row is kept and retried.`);
      }
    }

    const failedBefore = new Date(now.getTime() - DATA_EXPORT_RETENTION_DAYS * DAY_MS);
    const failedRemoved = await this.prisma.dataExportRequest.deleteMany({
      where: { status: 'failed', fileKey: null, createdAt: { lte: failedBefore } },
    });

    return {
      markedFailed: marked.count,
      expiredRemoved,
      expiredKept,
      failedRowsRemoved: failedRemoved.count,
    };
  }
}
