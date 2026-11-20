import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { encodeBlockCursor } from './block.cursor';
import { BlockService } from './block.service';

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' });
}

function buildPrisma() {
  const prisma = {
    user: { findUnique: jest.fn() },
    block: { create: jest.fn(), deleteMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn().mockResolvedValue([]) },
    follow: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  } as unknown as PrismaService;
  (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

const visibleUser = { id: 't', isMinor: false, accountStatus: 'active', guardian: null };

describe('BlockService (B-039)', () => {
  let prisma: PrismaService;
  let service: BlockService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = () => prisma as any;
  beforeEach(() => {
    prisma = buildPrisma();
    service = new BlockService(prisma);
  });

  describe('blockUser', () => {
    it('writes the block and removes follows in BOTH directions in one transaction', async () => {
      p().user.findUnique.mockResolvedValue(visibleUser);
      const res = await service.blockUser('me', 't', { reason: '  spam  ' });
      expect(res).toEqual({ userId: 't', blocked: true });
      expect(p().$transaction).toHaveBeenCalledTimes(1);
      expect(p().block.create).toHaveBeenCalledWith({ data: { blockerId: 'me', blockedId: 't', reason: 'spam' } });
      expect(p().follow.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { followerId: 'me', followeeId: 't' },
            { followerId: 't', followeeId: 'me' },
          ],
        },
      });
    });

    it('stores no reason when blank or absent (null, never an empty string)', async () => {
      p().user.findUnique.mockResolvedValue(visibleUser);
      await service.blockUser('me', 't', { reason: '   ' });
      await service.blockUser('me', 't', {});
      expect(p().block.create.mock.calls.map((c: unknown[]) => (c[0] as { data: { reason: unknown } }).data.reason)).toEqual([null, null]);
    });

    it('rejects blocking yourself with 400 before any read', async () => {
      await expect(service.blockUser('me', 'me', {})).rejects.toBeInstanceOf(BadRequestException);
      expect(p().user.findUnique).not.toHaveBeenCalled();
    });

    it.each([
      ['a missing user', null],
      ['a non-active account', { ...visibleUser, accountStatus: 'deactivated' }],
      ['a restricted-pending minor', { ...visibleUser, isMinor: true, guardian: { consentStatus: 'pending' } }],
      ['a declined minor', { ...visibleUser, isMinor: true, guardian: { consentStatus: 'declined' } }],
    ])('is a 404 for %s, creating nothing (cannot be used to learn an account exists)', async (_n, row) => {
      p().user.findUnique.mockResolvedValue(row);
      await expect(service.blockUser('me', 't', {})).rejects.toBeInstanceOf(NotFoundException);
      expect(p().block.create).not.toHaveBeenCalled();
    });

    it('allows blocking a minor whose guardian consent is confirmed', async () => {
      p().user.findUnique.mockResolvedValue({ ...visibleUser, isMinor: true, guardian: { consentStatus: 'confirmed' } });
      await expect(service.blockUser('me', 't', {})).resolves.toEqual({ userId: 't', blocked: true });
    });

    it('is idempotent: a duplicate (P2002) is a 200 and does not rethrow, the first reason stands', async () => {
      p().user.findUnique.mockResolvedValue(visibleUser);
      p().block.create.mockRejectedValue(p2002());
      await expect(service.blockUser('me', 't', { reason: 'new reason' })).resolves.toEqual({ userId: 't', blocked: true });
    });

    it('rethrows an unrelated database error', async () => {
      p().user.findUnique.mockResolvedValue(visibleUser);
      p().block.create.mockRejectedValue(new Error('boom'));
      await expect(service.blockUser('me', 't', {})).rejects.toThrow('boom');
    });
  });

  describe('unblockUser', () => {
    it('deletes only the caller-made block, and never restores follows', async () => {
      const res = await service.unblockUser('me', 't');
      expect(res).toEqual({ userId: 't', blocked: false });
      expect(p().block.deleteMany).toHaveBeenCalledWith({ where: { blockerId: 'me', blockedId: 't' } });
      expect(p().follow).not.toHaveProperty('create');
    });
    it('is a 200 no-op when nothing was blocked (no existence signal)', async () => {
      p().block.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.unblockUser('me', 'ghost')).resolves.toEqual({ userId: 'ghost', blocked: false });
    });
    it('rejects unblocking yourself with 400', async () => {
      await expect(service.unblockUser('me', 'me')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('listBlocked', () => {
    const row = (sequence: number, id: string, username: string | null, reason: string | null) => ({
      sequence,
      reason,
      blocked: { id, username, displayName: 'Real Name' },
    });

    it("lists the blocker's own blocks newest-first with publicName and reason, no date, no real name", async () => {
      p().block.findMany.mockResolvedValue([row(3, 'a', 'ada_9', 'rude'), row(2, 'b', null, null)]);
      const page = await service.listBlocked('me', {});
      expect(p().block.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { blockerId: 'me' }, orderBy: { sequence: 'desc' }, take: 21 }),
      );
      expect(page).toEqual({
        items: [
          { id: 'a', publicName: 'ada_9', reason: 'rude' },
          { id: 'b', publicName: 'Soccernity member', reason: null },
        ],
        nextCursor: null,
      });
      expect(JSON.stringify(page)).not.toContain('Real Name');
      expect(JSON.stringify(page)).not.toMatch(/createdAt|blockedAt|date/i);
    });

    it('paginates by sequence only: trims the lookahead row and cursors on the last kept sequence', async () => {
      p().block.findMany.mockResolvedValue([row(3, 'a', 'a_a', null), row(2, 'b', 'b_b', null), row(1, 'c', 'c_c', null)]);
      const page = await service.listBlocked('me', { limit: 2 });
      expect(page.items.map((i) => i.id)).toEqual(['a', 'b']);
      expect(page.nextCursor).toBe(encodeBlockCursor(2));
    });

    it('applies the cursor as sequence < last', async () => {
      await service.listBlocked('me', { cursor: encodeBlockCursor(5) });
      expect(p().block.findMany.mock.calls[0][0].where).toEqual({ blockerId: 'me', sequence: { lt: 5 } });
    });

    it('rejects a malformed cursor with 400 before querying', async () => {
      await expect(service.listBlocked('me', { cursor: 'junk' })).rejects.toBeInstanceOf(BadRequestException);
      expect(p().block.findMany).not.toHaveBeenCalled();
    });
  });
});
