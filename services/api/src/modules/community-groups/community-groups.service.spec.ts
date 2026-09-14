import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CommunityGroupsService } from './community-groups.service';
import { encodeCommunityGroupCursor, encodeCommunityGroupMemberCursor } from './cursor.util';

// Mocked-Prisma unit tests, following banter.service.spec.ts /
// clubs.service.spec.ts. The real CommunityGroupMember table, its
// @@unique constraint, the nameNormalized @@unique constraint, the
// onDelete: Cascade FKs, and the real transactional memberCount behavior
// are proven in test/community-groups.e2e-spec.ts against Postgres —
// this file covers the branching logic a mock can prove.

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'x',
  });
}
function p2025(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('not found', {
    code: 'P2025',
    clientVersion: 'x',
  });
}

function buildPrismaMock() {
  const prisma = {
    communityGroup: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    communityGroupMember: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;

  // Same interactive-transaction mock shape as banter.service.spec.ts /
  // clubs.service.spec.ts: invoke the callback with the same mock object
  // standing in for `tx`.
  (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn(
    (fn: (tx: unknown) => unknown) => fn(prisma),
  );

  return prisma;
}

function group(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'group-1',
    name: 'Lagos Strikers',
    city: 'Lagos',
    positionPlayed: null,
    careerTrack: null,
    createdById: 'user-1',
    memberCount: 3,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    ...overrides,
  };
}

describe('CommunityGroupsService', () => {
  describe('createGroup', () => {
    it('creates the group with createdById = caller, a derived nameNormalized, auto-joins the creator, and starts memberCount at 1', async () => {
      const prisma = buildPrismaMock();
      (prisma.communityGroup.create as jest.Mock).mockResolvedValue(
        group({ id: 'group-9', memberCount: 1, name: '  Lagos Strikers  ' }),
      );
      (prisma.communityGroupMember.create as jest.Mock).mockResolvedValue({});

      const service = new CommunityGroupsService(prisma);
      const result = await service.createGroup('user-1', {
        name: '  Lagos Strikers  ',
        city: 'Lagos',
      });

      expect(prisma.communityGroup.create).toHaveBeenCalledWith({
        data: {
          name: '  Lagos Strikers  ',
          nameNormalized: 'lagos strikers',
          city: 'Lagos',
          positionPlayed: null,
          careerTrack: null,
          createdById: 'user-1',
          memberCount: 1,
        },
        select: expect.objectContaining({ id: true, name: true, memberCount: true }),
      });
      expect(prisma.communityGroupMember.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', communityGroupId: 'group-9' },
      });
      expect(result.joined).toBe(true);
      expect((prisma as unknown as { $transaction: jest.Mock }).$transaction).toHaveBeenCalled();
    });

    it('rejects a duplicate normalized name with a 409, not a raw 500', async () => {
      const prisma = buildPrismaMock();
      (prisma.communityGroup.create as jest.Mock).mockRejectedValue(p2002());

      const service = new CommunityGroupsService(prisma);
      await expect(
        service.createGroup('user-1', { name: 'Lagos Strikers', city: 'Lagos' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows a non-P2002 error', async () => {
      const prisma = buildPrismaMock();
      (prisma.communityGroup.create as jest.Mock).mockRejectedValue(new Error('boom'));
      const service = new CommunityGroupsService(prisma);
      await expect(
        service.createGroup('user-1', { name: 'X', city: 'Lagos' }),
      ).rejects.toThrow('boom');
    });
  });

  describe('listGroups', () => {
    it('orders newest-first (createdAt desc, id desc), never selects `members`, and attaches per-caller joined', async () => {
      const prisma = buildPrismaMock();
      const rows = [
        group({ id: 'group-2', createdAt: new Date('2026-09-02T00:00:00.000Z') }),
        group({ id: 'group-1', createdAt: new Date('2026-09-01T00:00:00.000Z') }),
      ];
      (prisma.communityGroup.findMany as jest.Mock).mockResolvedValueOnce(rows);
      (prisma.communityGroupMember.findMany as jest.Mock).mockResolvedValueOnce([
        { communityGroupId: 'group-1' },
      ]);

      const service = new CommunityGroupsService(prisma);
      const result = await service.listGroups({}, 'viewer-1');

      const callArgs = (prisma.communityGroup.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
      expect(callArgs.select).not.toHaveProperty('members');
      expect(result.items).toEqual([
        { ...rows[0], joined: false },
        { ...rows[1], joined: true },
      ]);
      expect(result.nextCursor).toBeNull();
    });

    it('ANDs city/positionPlayed/careerTrack filters and the (createdAt,id) cursor', async () => {
      const prisma = buildPrismaMock();
      (prisma.communityGroup.findMany as jest.Mock).mockResolvedValueOnce([]);
      const at = new Date('2026-09-01T00:00:00.000Z');
      const cursor = encodeCommunityGroupCursor({ createdAt: at, id: 'group-5' });

      const service = new CommunityGroupsService(prisma);
      await service.listGroups(
        { city: 'Lagos', positionPlayed: 'Striker', careerTrack: 'Coaching', cursor },
        'viewer-1',
      );

      const where = (prisma.communityGroup.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where).toEqual({
        AND: [
          { city: 'Lagos' },
          { positionPlayed: 'Striker' },
          { careerTrack: 'Coaching' },
          { OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: 'group-5' } }] },
        ],
      });
    });

    it('builds a nextCursor from the last kept row when a lookahead row exists', async () => {
      const prisma = buildPrismaMock();
      const first = group({ id: 'group-2', createdAt: new Date('2026-09-02T00:00:00.000Z') });
      const lookahead = group({ id: 'group-1', createdAt: new Date('2026-09-01T00:00:00.000Z') });
      (prisma.communityGroup.findMany as jest.Mock).mockResolvedValueOnce([first, lookahead]);
      (prisma.communityGroupMember.findMany as jest.Mock).mockResolvedValueOnce([]);

      const service = new CommunityGroupsService(prisma);
      const result = await service.listGroups({ limit: 1 }, 'viewer-1');

      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBe(
        encodeCommunityGroupCursor({ createdAt: first.createdAt, id: first.id }),
      );
    });

    it('rejects a malformed cursor with a 400-class error', async () => {
      const prisma = buildPrismaMock();
      const service = new CommunityGroupsService(prisma);
      await expect(service.listGroups({ cursor: 'not-base64-json' }, 'viewer-1')).rejects.toThrow();
    });

    it('empty result set issues zero membership-lookup queries', async () => {
      const prisma = buildPrismaMock();
      (prisma.communityGroup.findMany as jest.Mock).mockResolvedValueOnce([]);
      const service = new CommunityGroupsService(prisma);
      await service.listGroups({}, 'viewer-1');
      expect(prisma.communityGroupMember.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getGroupById', () => {
    it('404s for an unknown id', async () => {
      const prisma = buildPrismaMock();
      (prisma.communityGroup.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new CommunityGroupsService(prisma);
      await expect(service.getGroupById('nope', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns joined:true when a membership row exists for the caller, false otherwise', async () => {
      const prisma = buildPrismaMock();
      (prisma.communityGroup.findUnique as jest.Mock).mockResolvedValue(group());
      (prisma.communityGroupMember.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'm-1' });
      const service = new CommunityGroupsService(prisma);
      expect((await service.getGroupById('group-1', 'user-1')).joined).toBe(true);

      (prisma.communityGroupMember.findUnique as jest.Mock).mockResolvedValueOnce(null);
      expect((await service.getGroupById('group-1', 'user-2')).joined).toBe(false);
    });
  });

  describe('joinGroup', () => {
    it('404s for an unknown group, writing nothing', async () => {
      const prisma = buildPrismaMock();
      (prisma.communityGroup.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new CommunityGroupsService(prisma);
      await expect(service.joinGroup('user-1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.communityGroupMember.create).not.toHaveBeenCalled();
    });

    it('creates the member row and increments memberCount in one transaction', async () => {
      const prisma = buildPrismaMock();
      (prisma.communityGroup.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'group-1' }) // assertGroupExists
        .mockResolvedValueOnce({ memberCount: 4 }); // currentMemberCount
      (prisma.communityGroupMember.create as jest.Mock).mockResolvedValue({});
      (prisma.communityGroup.update as jest.Mock).mockResolvedValue({});

      const service = new CommunityGroupsService(prisma);
      const result = await service.joinGroup('user-1', 'group-1');

      expect(prisma.communityGroupMember.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', communityGroupId: 'group-1' },
      });
      expect(prisma.communityGroup.update).toHaveBeenCalledWith({
        where: { id: 'group-1' },
        data: { memberCount: { increment: 1 } },
      });
      expect(result).toEqual({ groupId: 'group-1', joined: true, memberCount: 4 });
    });

    it('is idempotent — a P2002 on the member create is swallowed and memberCount is NOT touched again', async () => {
      const prisma = buildPrismaMock();
      (prisma.communityGroup.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'group-1' })
        .mockResolvedValueOnce({ memberCount: 1 });
      (prisma.communityGroupMember.create as jest.Mock).mockRejectedValue(p2002());

      const service = new CommunityGroupsService(prisma);
      const result = await service.joinGroup('user-1', 'group-1');

      expect(prisma.communityGroup.update).not.toHaveBeenCalled();
      expect(result).toEqual({ groupId: 'group-1', joined: true, memberCount: 1 });
    });

    it('rethrows a non-P2002 error', async () => {
      const prisma = buildPrismaMock();
      (prisma.communityGroup.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'group-1' });
      (prisma.communityGroupMember.create as jest.Mock).mockRejectedValue(new Error('boom'));
      const service = new CommunityGroupsService(prisma);
      await expect(service.joinGroup('user-1', 'group-1')).rejects.toThrow('boom');
    });
  });

  describe('leaveGroup', () => {
    it('is a no-op success when the caller was never a member (never opens a transaction, never a 404)', async () => {
      const prisma = buildPrismaMock();
      (prisma.communityGroup.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'group-1' })
        .mockResolvedValueOnce({ memberCount: 2 });
      (prisma.communityGroupMember.findUnique as jest.Mock).mockResolvedValue(null);

      const service = new CommunityGroupsService(prisma);
      const result = await service.leaveGroup('user-1', 'group-1');

      expect((prisma as unknown as { $transaction: jest.Mock }).$transaction).not.toHaveBeenCalled();
      expect(result).toEqual({ groupId: 'group-1', joined: false, memberCount: 2 });
    });

    it('deletes the member row and decrements memberCount with a gt:0 floor guard', async () => {
      const prisma = buildPrismaMock();
      (prisma.communityGroup.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'group-1' })
        .mockResolvedValueOnce({ memberCount: 1 });
      (prisma.communityGroupMember.findUnique as jest.Mock).mockResolvedValue({ id: 'm-1' });
      (prisma.communityGroupMember.delete as jest.Mock).mockResolvedValue({});
      (prisma.communityGroup.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const service = new CommunityGroupsService(prisma);
      const result = await service.leaveGroup('user-1', 'group-1');

      expect(prisma.communityGroup.updateMany).toHaveBeenCalledWith({
        where: { id: 'group-1', memberCount: { gt: 0 } },
        data: { memberCount: { decrement: 1 } },
      });
      expect(result).toEqual({ groupId: 'group-1', joined: false, memberCount: 1 });
    });

    it('swallows a P2025 concurrent-delete race', async () => {
      const prisma = buildPrismaMock();
      (prisma.communityGroup.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'group-1' })
        .mockResolvedValueOnce({ memberCount: 0 });
      (prisma.communityGroupMember.findUnique as jest.Mock).mockResolvedValue({ id: 'm-1' });
      (prisma.communityGroupMember.delete as jest.Mock).mockRejectedValue(p2025());

      const service = new CommunityGroupsService(prisma);
      const result = await service.leaveGroup('user-1', 'group-1');
      expect(result).toEqual({ groupId: 'group-1', joined: false, memberCount: 0 });
    });

    it('404s for an unknown group', async () => {
      const prisma = buildPrismaMock();
      (prisma.communityGroup.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new CommunityGroupsService(prisma);
      await expect(service.leaveGroup('user-1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getGroupMembers', () => {
    it('404s for an unknown group', async () => {
      const prisma = buildPrismaMock();
      (prisma.communityGroup.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new CommunityGroupsService(prisma);
      await expect(service.getGroupMembers('nope', {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('filters by membership + the restricted-pending/inactive-account visibility rule, orders alphabetically by displayName', async () => {
      const prisma = buildPrismaMock();
      (prisma.communityGroup.findUnique as jest.Mock).mockResolvedValue({ id: 'group-1' });
      (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'u-1', displayName: 'Alice' },
      ]);

      const service = new CommunityGroupsService(prisma);
      await service.getGroupMembers('group-1', {});

      const args = (prisma.user.findMany as jest.Mock).mock.calls[0][0];
      expect(args.where).toEqual({
        AND: [
          { communityGroupMemberships: { some: { communityGroupId: 'group-1' } } },
          {
            accountStatus: 'active',
            OR: [{ isMinor: false }, { guardian: { consentStatus: 'confirmed' } }],
          },
        ],
      });
      expect(args.orderBy).toEqual([{ displayName: 'asc' }, { id: 'asc' }]);
    });

    it('builds a nextCursor from the last kept row when a lookahead row exists', async () => {
      const prisma = buildPrismaMock();
      (prisma.communityGroup.findUnique as jest.Mock).mockResolvedValue({ id: 'group-1' });
      (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'u-1', displayName: 'Alice' },
        { id: 'u-2', displayName: 'Bob' }, // lookahead
      ]);

      const service = new CommunityGroupsService(prisma);
      const result = await service.getGroupMembers('group-1', { limit: 1 });

      expect(result.items).toEqual([{ id: 'u-1', displayName: 'Alice' }]);
      expect(result.nextCursor).toBe(
        encodeCommunityGroupMemberCursor({ name: 'Alice', id: 'u-1' }),
      );
    });
  });
});
