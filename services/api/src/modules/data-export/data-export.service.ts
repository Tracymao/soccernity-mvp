import {
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { createReadStream, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { DobEncryptionService } from '../../crypto/dob-encryption.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DirectUploadStorageService } from '../../storage/direct-upload-storage.service';
import { PasswordService } from '../auth/password/password.service';
import { buildDataExportFile } from './data-export-file.builder';
import {
  DATA_EXPORT_EXPIRED_CODE,
  DATA_EXPORT_FILE_NAME,
  DATA_EXPORT_NOT_FOUND_CODE,
  DATA_EXPORT_NOT_READY_CODE,
  DATA_EXPORT_REQUEST_INTERVAL_HOURS,
  DATA_EXPORT_RETENTION_DAYS,
  DATA_EXPORT_STORAGE_PREFIX,
  DATA_EXPORT_TOO_MANY_REQUESTS_CODE,
  DATA_EXPORT_WRONG_PASSWORD_CODE,
  DataExportLatestStatus,
} from './data-export.constants';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface DataExportStarted {
  id: string;
  status: 'preparing';
}

export interface DataExportLatest {
  status: DataExportLatestStatus;
  id?: string;
  requestedAt?: string;
  /** Only when status is 'ready': after this the download stops working. */
  expiresAt?: string;
}

export interface DataExportDownload {
  stream: Readable;
  fileName: string;
}

// backend/b060-data-export (B-060; Decision Log #472 adopted default (g)). The account holder's own data download.
//
// FLOW: POST /users/me/data-export re-confirms the password, records a 'preparing' row (one per account per 24
// hours), and returns at once. The JSON file is then built in the background of the same process (the way
// notifyInBackground works elsewhere: a detached promise that never throws; no queue service). When it is
// written the row becomes 'ready' (with the file key and the expiry) or 'failed'. A request lost to a restart
// stays 'preparing'; the daily sweep (data-export-sweep.service.ts) marks it failed so the person can ask again.
//
// The file lives in PRIVATE storage and is read back only by this service for its owner (openDownload).
@Injectable()
export class DataExportService {
  private readonly logger = new Logger(DataExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly storage: DirectUploadStorageService,
    private readonly dob: DobEncryptionService,
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  // ---- POST /users/me/data-export -------------------------------------------------------------------------

  async requestExport(userId: string, password: string): Promise<DataExportStarted> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user) {
      // A valid token can outlive its account for a few minutes (same case change-password handles).
      throw new UnauthorizedException('Invalid credentials');
    }
    // The password is checked FIRST, so a wrong password never reveals whether a request is already in the
    // 24-hour window. A wrong password is a 403 with a code (not a 401: a 401 makes the web client refresh the
    // session and replay the request, which would be a second wrong attempt).
    if (!(await this.passwords.verify(user.passwordHash, password))) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        error: 'Forbidden',
        code: DATA_EXPORT_WRONG_PASSWORD_CODE,
        message: 'Incorrect password',
      });
    }

    const now = this.clock.now();
    const windowStart = new Date(now.getTime() - DATA_EXPORT_REQUEST_INTERVAL_HOURS * HOUR_MS);

    // The advisory lock (per account) makes the check-then-create atomic: two simultaneous requests cannot both
    // pass the 24-hour check. A request that FAILED does not count (the person may try again).
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`data-export:${userId}`}))`;
      const recent = await tx.dataExportRequest.findFirst({
        where: { userId, status: { in: ['preparing', 'ready'] }, createdAt: { gt: windowStart } },
        select: { id: true },
      });
      if (recent) return null;
      return tx.dataExportRequest.create({ data: { userId, status: 'preparing', createdAt: now }, select: { id: true } });
    });

    if (!created) {
      // No number in the body: the Figma frame prints none.
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          code: DATA_EXPORT_TOO_MANY_REQUESTS_CODE,
          message: 'You have asked for your data recently. Please try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Detached: the response does not wait for it, and it never throws (it records its own failure).
    void this.generate(created.id, userId);
    return { id: created.id, status: 'preparing' };
  }

  // Builds the file and moves the row to 'ready' or 'failed'. Public so tests (and nothing else) can await it.
  async generate(requestId: string, userId: string): Promise<void> {
    let key: string | null = null;
    try {
      const now = this.clock.now();
      const file = await buildDataExportFile(this.prisma, this.dob, userId, now);
      key = `${DATA_EXPORT_STORAGE_PREFIX}${userId}/${requestId}.json`;
      await this.storage.upload(Buffer.from(JSON.stringify(file), 'utf8'), key, 'application/json');
      const readyAt = this.clock.now();
      const expiresAt = new Date(readyAt.getTime() + DATA_EXPORT_RETENTION_DAYS * DAY_MS);
      // Guarded on 'preparing': if the row was removed meanwhile (the account was anonymised) or already marked
      // failed by the sweep, nothing is updated and the file just written is removed again.
      const updated = await this.prisma.dataExportRequest.updateMany({
        where: { id: requestId, status: 'preparing' },
        data: { status: 'ready', readyAt, fileKey: key, expiresAt },
      });
      if (updated.count === 0) {
        await this.deleteObjectQuietly(key);
      }
    } catch (err) {
      // Never log the content or the key's owner beyond the request id.
      this.logger.error(`Data export ${requestId} failed: ${err instanceof Error ? err.name : 'error'}`);
      if (key) await this.deleteObjectQuietly(key);
      try {
        await this.prisma.dataExportRequest.updateMany({
          where: { id: requestId, status: 'preparing' },
          data: { status: 'failed' },
        });
      } catch {
        // The row will be picked up by the stale-preparing sweep.
      }
    }
  }

  // ---- GET /users/me/data-export/latest -------------------------------------------------------------------

  async getLatest(userId: string): Promise<DataExportLatest> {
    const row = await this.prisma.dataExportRequest.findFirst({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, status: true, createdAt: true, expiresAt: true },
    });
    if (!row) return { status: 'none' };
    if (row.status === 'ready') {
      // Past its expiry the download no longer works; until the sweep removes the row it reads as 'none'.
      if (!row.expiresAt || row.expiresAt <= this.clock.now()) return { status: 'none' };
      return {
        status: 'ready',
        id: row.id,
        requestedAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      };
    }
    return { status: row.status as 'preparing' | 'failed', id: row.id, requestedAt: row.createdAt.toISOString() };
  }

  // ---- GET /users/me/data-export/:id/download -------------------------------------------------------------

  // Owner only: another account's request id is the SAME 404 as an id that does not exist. The file is copied
  // from private storage to a temporary file and streamed; the temporary directory is removed when the stream
  // closes (or on an error).
  async openDownload(userId: string, requestId: string): Promise<DataExportDownload> {
    const row = await this.prisma.dataExportRequest.findFirst({
      where: { id: requestId, userId },
      select: { status: true, fileKey: true, expiresAt: true },
    });
    if (!row) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        code: DATA_EXPORT_NOT_FOUND_CODE,
        message: 'Data export not found',
      });
    }
    if (row.status !== 'ready' || !row.fileKey || !row.expiresAt) {
      throw new HttpException(
        {
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          code: DATA_EXPORT_NOT_READY_CODE,
          message: 'Your data is not ready to download.',
        },
        HttpStatus.CONFLICT,
      );
    }
    if (row.expiresAt <= this.clock.now()) {
      throw new GoneException({
        statusCode: HttpStatus.GONE,
        error: 'Gone',
        code: DATA_EXPORT_EXPIRED_CODE,
        message: 'This download has expired. Ask for your data again.',
      });
    }

    const dir = await fs.mkdtemp(join(tmpdir(), 'soccernity-export-'));
    const filePath = join(dir, 'export.json');
    const cleanup = () => fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    try {
      await this.storage.downloadToFile(row.fileKey, filePath);
    } catch (err) {
      await cleanup();
      throw err;
    }
    const stream = createReadStream(filePath);
    stream.once('close', () => void cleanup());
    stream.once('error', () => void cleanup());
    return { stream, fileName: DATA_EXPORT_FILE_NAME };
  }

  private async deleteObjectQuietly(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch {
      this.logger.warn('A data export file could not be removed from storage; the expiry sweep will retry the row.');
    }
  }
}
