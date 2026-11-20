import { ForbiddenException, GoneException, HttpException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { DobEncryptionService } from '../../crypto/dob-encryption.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DirectUploadStorageService } from '../../storage/direct-upload-storage.service';
import { PasswordService } from '../auth/password/password.service';
import { DataExportService } from './data-export.service';

// B-060. Every branch of the request, the background build, the latest-status read and the download.

const NOW = new Date('2026-11-18T10:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const clock = { now: () => NOW };

function codeOf(e: unknown): string | undefined {
  return ((e as HttpException).getResponse() as { code?: string }).code;
}

function build(opts: { user?: unknown; passwordOk?: boolean; recent?: unknown; latest?: unknown; row?: unknown } = {}) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    dataExportRequest: {
      findFirst: jest.fn().mockResolvedValue(opts.recent ?? null),
      create: jest.fn().mockResolvedValue({ id: 'req-1' }),
    },
  };
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(opts.user === undefined ? { passwordHash: 'hash' } : opts.user) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    dataExportRequest: {
      findFirst: jest.fn().mockResolvedValue(opts.latest ?? opts.row ?? null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const passwords = { verify: jest.fn().mockResolvedValue(opts.passwordOk ?? true) };
  const storage = {
    upload: jest.fn().mockResolvedValue('https://x/y'),
    delete: jest.fn().mockResolvedValue(undefined),
    downloadToFile: jest.fn(async (_key: string, dest: string) => fs.writeFile(dest, '{"ok":true}')),
  };
  const dob = { decryptNullable: jest.fn().mockReturnValue(null) };
  const service = new DataExportService(
    prisma as unknown as PrismaService,
    passwords as unknown as PasswordService,
    storage as unknown as DirectUploadStorageService,
    dob as unknown as DobEncryptionService,
    clock,
  );
  return { service, prisma, tx, passwords, storage };
}

// What generate() reads to build the file: an empty account is enough here (the builder has its own spec).
function withEmptyAccount(prisma: ReturnType<typeof build>['prisma']) {
  const empty = jest.fn().mockResolvedValue([]);
  Object.assign(prisma, {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'u1', email: 'a@b.c', phone: null, displayName: 'N', username: 'n', dateOfBirth: null, isMinor: false,
        isUnder16: false, role: 'fan', verificationStatus: 'verified', createdAt: NOW, bio: null, preferredClub: null,
        profileCountry: null, avatarUrl: null, avatarStatus: null, coverUrl: null, coverStatus: null,
        isTeamOrganiser: false, representedClub: null,
      }),
    },
    post: { findMany: empty }, comment: { findMany: empty }, follow: { findMany: empty }, message: { findMany: empty },
  });
}

describe('DataExportService.requestExport', () => {
  it('refuses when the account no longer exists (a token can outlive its account)', async () => {
    const { service, passwords } = build({ user: null });
    await expect(service.requestExport('u1', 'pw')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(passwords.verify).not.toHaveBeenCalled();
  });

  it('a wrong password is a 403 coded wrong_password, nothing is created, and the 24-hour rule is not consulted', async () => {
    const { service, tx, prisma } = build({ passwordOk: false });
    const err = await service.requestExport('u1', 'bad').catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getStatus()).toBe(403);
    expect(codeOf(err)).toBe('wrong_password');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.dataExportRequest.create).not.toHaveBeenCalled();
  });

  it('creates a preparing request, answers at once, and starts the build in the background', async () => {
    const { service, tx, prisma } = build();
    const generate = jest.spyOn(service, 'generate').mockResolvedValue(undefined);
    const out = await service.requestExport('u1', 'pw');
    expect(out).toEqual({ id: 'req-1', status: 'preparing' });
    expect(tx.dataExportRequest.create).toHaveBeenCalledWith({
      data: { userId: 'u1', status: 'preparing', createdAt: NOW },
      select: { id: true },
    });
    expect(generate).toHaveBeenCalledWith('req-1', 'u1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('takes a per-account advisory lock before checking, so two simultaneous requests cannot both pass', async () => {
    const { service, tx } = build();
    jest.spyOn(service, 'generate').mockResolvedValue(undefined);
    await service.requestExport('u1', 'pw');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const order = [tx.$executeRaw.mock.invocationCallOrder[0], tx.dataExportRequest.findFirst.mock.invocationCallOrder[0]];
    expect(order[0]).toBeLessThan(order[1]);
  });

  it('counts only a preparing or ready request from the last 24 hours (a failed one does not)', async () => {
    const { service, tx } = build();
    jest.spyOn(service, 'generate').mockResolvedValue(undefined);
    await service.requestExport('u1', 'pw');
    expect(tx.dataExportRequest.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', status: { in: ['preparing', 'ready'] }, createdAt: { gt: new Date(NOW.getTime() - DAY) } },
      select: { id: true },
    });
  });

  it('a second request inside 24 hours is a 429 coded too_many_requests with no number or time in the body', async () => {
    const { service, tx } = build({ recent: { id: 'old' } });
    const generate = jest.spyOn(service, 'generate').mockResolvedValue(undefined);
    const err = await service.requestExport('u1', 'pw').catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(429);
    expect(codeOf(err)).toBe('too_many_requests');
    // The Figma frame prints no figure, so neither does the body message.
    expect((err.getResponse() as { message: string }).message).not.toMatch(/\d|hour|minute|day/i);
    expect(tx.dataExportRequest.create).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
});

describe('DataExportService.generate', () => {
  it('uploads the JSON under the private data-export/ prefix and marks the request ready with a 7-day expiry', async () => {
    const { service, prisma, storage } = build();
    withEmptyAccount(prisma);
    await service.generate('req-1', 'u1');
    const [buffer, key, contentType] = storage.upload.mock.calls[0];
    expect(key).toBe('data-export/u1/req-1.json');
    expect(key.startsWith('post-media/')).toBe(false);
    expect(key.startsWith('profile-media/')).toBe(false);
    expect(contentType).toBe('application/json');
    const file = JSON.parse((buffer as Buffer).toString('utf8'));
    expect(file.format).toBe('soccernity-data-export');
    expect(prisma.dataExportRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'req-1', status: 'preparing' },
      data: { status: 'ready', readyAt: NOW, fileKey: 'data-export/u1/req-1.json', expiresAt: new Date(NOW.getTime() + 7 * DAY) },
    });
  });

  it('marks the request failed (and does not upload) when the file cannot be built', async () => {
    const { service, prisma, storage } = build();
    prisma.user.findUnique.mockResolvedValue(null); // the account is gone
    await service.generate('req-1', 'u1');
    expect(storage.upload).not.toHaveBeenCalled();
    expect(prisma.dataExportRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'req-1', status: 'preparing' },
      data: { status: 'failed' },
    });
  });

  it('marks it failed and removes the half-written file when the upload or the final update fails', async () => {
    const { service, prisma, storage } = build();
    withEmptyAccount(prisma);
    prisma.dataExportRequest.updateMany.mockRejectedValueOnce(new Error('db down')).mockResolvedValue({ count: 1 });
    await service.generate('req-1', 'u1');
    expect(storage.delete).toHaveBeenCalledWith('data-export/u1/req-1.json');
    expect(prisma.dataExportRequest.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'req-1', status: 'preparing' },
      data: { status: 'failed' },
    });
  });

  it('a storage outage is a failed request, not an exception', async () => {
    const { service, prisma, storage } = build();
    withEmptyAccount(prisma);
    storage.upload.mockRejectedValue(new Error('503'));
    await expect(service.generate('req-1', 'u1')).resolves.toBeUndefined();
    expect(prisma.dataExportRequest.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'req-1', status: 'preparing' },
      data: { status: 'failed' },
    });
  });

  it('removes the file again if the request row vanished or was already failed while the file was being built', async () => {
    const { service, prisma, storage } = build();
    withEmptyAccount(prisma);
    prisma.dataExportRequest.updateMany.mockResolvedValue({ count: 0 });
    await service.generate('req-1', 'u1');
    expect(storage.delete).toHaveBeenCalledWith('data-export/u1/req-1.json');
  });

  it('survives even the failure bookkeeping failing (the stale sweep will catch the row)', async () => {
    const { service, prisma, storage } = build();
    withEmptyAccount(prisma);
    storage.upload.mockRejectedValue(new Error('x'));
    prisma.dataExportRequest.updateMany.mockRejectedValue(new Error('db down'));
    await expect(service.generate('req-1', 'u1')).resolves.toBeUndefined();
  });
});

describe('DataExportService.getLatest', () => {
  const row = (over: Record<string, unknown>) => ({
    id: 'r1', status: 'ready', createdAt: new Date('2026-11-17T10:00:00.000Z'), expiresAt: new Date(NOW.getTime() + DAY), ...over,
  });

  it('none when the account never asked', async () => {
    const { service } = build();
    expect(await service.getLatest('u1')).toEqual({ status: 'none' });
  });

  it('reads the newest request of this account only', async () => {
    const { service, prisma } = build();
    await service.getLatest('u1');
    expect(prisma.dataExportRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    );
  });

  it('preparing and failed carry no expiry', async () => {
    expect(await build({ latest: row({ status: 'preparing', expiresAt: null }) }).service.getLatest('u1')).toEqual({
      status: 'preparing', id: 'r1', requestedAt: '2026-11-17T10:00:00.000Z',
    });
    expect(await build({ latest: row({ status: 'failed', expiresAt: null }) }).service.getLatest('u1')).toEqual({
      status: 'failed', id: 'r1', requestedAt: '2026-11-17T10:00:00.000Z',
    });
  });

  it('ready carries the expiry', async () => {
    expect(await build({ latest: row({}) }).service.getLatest('u1')).toEqual({
      status: 'ready', id: 'r1', requestedAt: '2026-11-17T10:00:00.000Z', expiresAt: new Date(NOW.getTime() + DAY).toISOString(),
    });
  });

  it('a ready request past its expiry reads as none (until the sweep removes the row)', async () => {
    expect(await build({ latest: row({ expiresAt: new Date(NOW.getTime() - 1) }) }).service.getLatest('u1')).toEqual({ status: 'none' });
    expect(await build({ latest: row({ expiresAt: NOW }) }).service.getLatest('u1')).toEqual({ status: 'none' });
  });
});

describe('DataExportService.openDownload', () => {
  const ready = { status: 'ready', fileKey: 'data-export/u1/r1.json', expiresAt: new Date(NOW.getTime() + DAY) };

  it('looks the request up by id AND owner, so another account\'s id is the same 404 as an unknown id', async () => {
    const { service, prisma } = build({ row: null });
    const err = await service.openDownload('u2', 'r1').catch((e) => e);
    expect(err).toBeInstanceOf(NotFoundException);
    expect(codeOf(err)).toBe('data_export_not_found');
    expect(prisma.dataExportRequest.findFirst).toHaveBeenCalledWith({
      where: { id: 'r1', userId: 'u2' },
      select: { status: true, fileKey: true, expiresAt: true },
    });
  });

  it.each([['preparing'], ['failed']])('a %s request cannot be downloaded: 409 data_export_not_ready', async (status) => {
    const { service, storage } = build({ row: { status, fileKey: null, expiresAt: null } });
    const err = await service.openDownload('u1', 'r1').catch((e) => e);
    expect(err.getStatus()).toBe(409);
    expect(codeOf(err)).toBe('data_export_not_ready');
    expect(storage.downloadToFile).not.toHaveBeenCalled();
  });

  it('past the expiry it is 410 data_export_expired and the file is not read', async () => {
    const { service, storage } = build({ row: { ...ready, expiresAt: new Date(NOW.getTime() - 1) } });
    const err = await service.openDownload('u1', 'r1').catch((e) => e);
    expect(err).toBeInstanceOf(GoneException);
    expect(codeOf(err)).toBe('data_export_expired');
    expect(storage.downloadToFile).not.toHaveBeenCalled();
  });

  it('streams the stored file and removes the temporary copy when the stream closes', async () => {
    const { service, storage } = build({ row: ready });
    const { stream, fileName } = await service.openDownload('u1', 'r1');
    expect(fileName).toBe('soccernity-data-export.json');
    const dest = storage.downloadToFile.mock.calls[0][1] as string;
    expect(storage.downloadToFile.mock.calls[0][0]).toBe('data-export/u1/r1.json');
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).toString('utf8')).toBe('{"ok":true}');
    await new Promise((r) => setTimeout(r, 50));
    await expect(fs.stat(dest)).rejects.toThrow();
  });

  it('removes the temporary directory and rethrows when the storage read fails', async () => {
    const { service, storage } = build({ row: ready });
    storage.downloadToFile.mockImplementation(async (_k: string, dest: string) => {
      await fs.writeFile(dest, 'partial');
      throw new Error('storage down');
    });
    await expect(service.openDownload('u1', 'r1')).rejects.toThrow('storage down');
    const dest = storage.downloadToFile.mock.calls[0][1] as string;
    await expect(fs.stat(dest)).rejects.toThrow();
  });
});
