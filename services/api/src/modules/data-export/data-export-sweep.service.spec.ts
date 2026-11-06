import { PrismaService } from '../../prisma/prisma.service';
import { DirectUploadStorageService } from '../../storage/direct-upload-storage.service';
import { DataExportSweepService } from './data-export-sweep.service';

// B-060: the daily clean-up. Stale 'preparing' -> failed; expired 'ready' -> file deleted, then row (a file that
// cannot be deleted keeps its row for the next run); old 'failed' rows removed.

const NOW = new Date('2026-11-18T04:15:00.000Z');
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

function build(expired: Array<{ id: string; fileKey: string | null }> = []) {
  const prisma = {
    dataExportRequest: {
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      findMany: jest.fn().mockResolvedValue(expired),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const storage = { delete: jest.fn().mockResolvedValue(undefined) };
  const service = new DataExportSweepService(
    prisma as unknown as PrismaService,
    storage as unknown as DirectUploadStorageService,
    { now: () => NOW },
  );
  return { service, prisma, storage };
}

describe('DataExportSweepService.sweep', () => {
  it('marks a request still preparing after 60 minutes as failed', async () => {
    const { service, prisma } = build();
    const out = await service.sweep(NOW);
    expect(prisma.dataExportRequest.updateMany).toHaveBeenCalledWith({
      where: { status: 'preparing', createdAt: { lte: new Date(NOW.getTime() - 60 * MINUTE) } },
      data: { status: 'failed' },
    });
    expect(out.markedFailed).toBe(2);
  });

  it('finds ready requests that are past their expiry (and only those)', async () => {
    const { service, prisma } = build();
    await service.sweep(NOW);
    expect(prisma.dataExportRequest.findMany).toHaveBeenCalledWith({
      where: { status: 'ready', expiresAt: { lte: NOW } },
      select: { id: true, fileKey: true },
      orderBy: { expiresAt: 'asc' },
    });
  });

  it('deletes the stored file FIRST, then the row, for each expired request', async () => {
    const { service, prisma, storage } = build([
      { id: 'a', fileKey: 'data-export/u1/a.json' },
      { id: 'b', fileKey: 'data-export/u2/b.json' },
    ]);
    const out = await service.sweep(NOW);
    expect(storage.delete.mock.calls.map((c) => c[0])).toEqual(['data-export/u1/a.json', 'data-export/u2/b.json']);
    expect(prisma.dataExportRequest.deleteMany).toHaveBeenCalledWith({ where: { id: 'a' } });
    expect(prisma.dataExportRequest.deleteMany).toHaveBeenCalledWith({ where: { id: 'b' } });
    expect(storage.delete.mock.invocationCallOrder[0]).toBeLessThan(prisma.dataExportRequest.deleteMany.mock.invocationCallOrder[0]);
    expect(out.expiredRemoved).toBe(2);
    expect(out.expiredKept).toBe(0);
  });

  it('keeps the row (to retry tomorrow) when its file cannot be deleted, and carries on with the others', async () => {
    const { service, prisma, storage } = build([
      { id: 'a', fileKey: 'data-export/u1/a.json' },
      { id: 'b', fileKey: 'data-export/u2/b.json' },
    ]);
    storage.delete.mockRejectedValueOnce(new Error('storage down')).mockResolvedValue(undefined);
    const out = await service.sweep(NOW);
    expect(prisma.dataExportRequest.deleteMany).not.toHaveBeenCalledWith({ where: { id: 'a' } });
    expect(prisma.dataExportRequest.deleteMany).toHaveBeenCalledWith({ where: { id: 'b' } });
    expect(out.expiredKept).toBe(1);
    expect(out.expiredRemoved).toBe(1);
  });

  it('removes a row that somehow has no file key without calling storage', async () => {
    const { service, storage } = build([{ id: 'a', fileKey: null }]);
    const out = await service.sweep(NOW);
    expect(storage.delete).not.toHaveBeenCalled();
    expect(out.expiredRemoved).toBe(1);
  });

  it('removes failed rows (which have no file) once they are older than the 7-day retention', async () => {
    const { service, prisma } = build();
    const out = await service.sweep(NOW);
    expect(prisma.dataExportRequest.deleteMany).toHaveBeenCalledWith({
      where: { status: 'failed', fileKey: null, createdAt: { lte: new Date(NOW.getTime() - 7 * DAY) } },
    });
    expect(out.failedRowsRemoved).toBe(1);
  });

  it('the scheduled entry point never throws', async () => {
    const { service, prisma } = build();
    prisma.dataExportRequest.updateMany.mockRejectedValue(new Error('db down'));
    await expect(service.scheduledSweep()).resolves.toBeUndefined();
  });
});
