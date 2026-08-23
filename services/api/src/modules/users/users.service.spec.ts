import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { encodeFeedCursor } from '../feed/cursor.util';
import { UsersService } from './users.service';

function buildPrismaMock() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    follow: {
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    guardian: {
      findUnique: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
  } as unknown as PrismaService;

  // Same interactive-transaction mock shape as feed.service.spec.ts's own
  // buildPrismaMock — see that file's comment for why the callback form
  // (not the array form) needs to actually run top-to-bottom with real
  // await/throw semantics for these tests to be meaningful.
  (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );

  return prisma;
}

const FULL_DB_ROW = {
  id: 'user-1',
  email: 'player@example.com',
  phone: '+441234567890',
  passwordHash: 'argon2id$super-secret-hash-should-never-leave-this-object',
  displayName: 'Old Name',
  dateOfBirth: new Date('2000-01-01'),
  isMinor: false,
  role: 'fan',
  verificationStatus: 'unverified',
  createdAt: new Date('2026-01-01'),
  clubAffiliationId: null,
};

// Mirrors what UsersService's Prisma `select` clause would actually
// return (passwordHash omitted at the query layer, not filtered out
// after the fact) — used instead of object-destructuring FULL_DB_ROW
// inline so there's no unused `passwordHash` binding for eslint to flag.
function withoutPasswordHash<T extends { passwordHash: unknown }>(row: T): Omit<T, 'passwordHash'> {
  const clone: Partial<T> = { ...row };
  delete clone.passwordHash;
  return clone as Omit<T, 'passwordHash'>;
}

describe('UsersService', () => {
  describe('getOwnProfile', () => {
    it('returns the profile without passwordHash, using a fresh Prisma select (not a stale/cached value)', async () => {
      const prisma = buildPrismaMock();
      // Simulate Prisma's `select` actually excluding passwordHash at the
      // query layer — the mock only returns what the real select clause
      // would ask for.
      const selected = withoutPasswordHash(FULL_DB_ROW);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(selected);

      const service = new UsersService(prisma);
      const result = await service.getOwnProfile('user-1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.isMinor).toBe(false);
      expect(result.verificationStatus).toBe('unverified');
    });

    it('the Prisma select clause itself never requests passwordHash', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...FULL_DB_ROW,
        passwordHash: undefined,
      });

      const service = new UsersService(prisma);
      await service.getOwnProfile('user-1');

      const callArgs = (prisma.user.findUnique as jest.Mock).mock.calls[0][0];
      expect(callArgs.select.passwordHash).toBeUndefined();
      expect(callArgs.select).not.toHaveProperty('passwordHash');
    });

    it('throws NotFoundException if the user no longer exists', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const service = new UsersService(prisma);

      await expect(service.getOwnProfile('ghost-user')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateOwnProfile', () => {
    it('forwards only displayName/phone to Prisma, even if given extra fields at the type level', async () => {
      const prisma = buildPrismaMock();
      const selected = withoutPasswordHash(FULL_DB_ROW);
      (prisma.user.update as jest.Mock).mockResolvedValue({
        ...selected,
        displayName: 'New Name',
      });

      const service = new UsersService(prisma);
      await service.updateOwnProfile('user-1', { displayName: 'New Name' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { displayName: 'New Name' },
        select: expect.not.objectContaining({ passwordHash: true }),
      });
    });

    it('never includes isMinor, role, or verificationStatus in the update payload passed to Prisma, even if smuggled onto the dto object', async () => {
      const prisma = buildPrismaMock();
      const selected = withoutPasswordHash(FULL_DB_ROW);
      (prisma.user.update as jest.Mock).mockResolvedValue(selected);

      const service = new UsersService(prisma);
      // Simulates a dto object that somehow has extra safeguarding-related
      // keys on it (e.g. if a future refactor loosened DTO validation) —
      // toUpdateData() must not read them.
      const dtoWithExtraFields = {
        displayName: 'New Name',
        isMinor: true,
        role: 'admin',
        verificationStatus: 'verified',
      } as never;

      await service.updateOwnProfile('user-1', dtoWithExtraFields);

      const callArgs = (prisma.user.update as jest.Mock).mock.calls[0][0];
      expect(callArgs.data).toEqual({ displayName: 'New Name' });
      expect(callArgs.data).not.toHaveProperty('isMinor');
      expect(callArgs.data).not.toHaveProperty('role');
      expect(callArgs.data).not.toHaveProperty('verificationStatus');
    });

    it('produces an empty update payload when no allowed fields are provided', async () => {
      const prisma = buildPrismaMock();
      const selected = withoutPasswordHash(FULL_DB_ROW);
      (prisma.user.update as jest.Mock).mockResolvedValue(selected);

      const service = new UsersService(prisma);
      await service.updateOwnProfile('user-1', {});

      const callArgs = (prisma.user.update as jest.Mock).mock.calls[0][0];
      expect(callArgs.data).toEqual({});
    });
  });

  describe('followUser / unfollowUser', () => {
    it('rejects a self-follow with BadRequestException, without querying Prisma at all', async () => {
      const prisma = buildPrismaMock();
      const service = new UsersService(prisma);

      await expect(service.followUser('user-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.follow.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when followeeId does not reference a real user', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new UsersService(prisma);

      await expect(service.followUser('user-1', 'ghost')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.follow.create).not.toHaveBeenCalled();
    });

    it('creates a Follow row and a recipient Notification (type: follow) transactionally', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'followee-1' });
      (prisma.follow.create as jest.Mock).mockResolvedValue({ id: 'follow-1' });
      const service = new UsersService(prisma);

      const result = await service.followUser('follower-1', 'followee-1');

      expect(prisma.follow.create).toHaveBeenCalledWith({
        data: { followerId: 'follower-1', followeeId: 'followee-1' },
      });
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: { userId: 'followee-1', type: 'follow', payloadRefId: 'follower-1' },
      });
      expect(result).toEqual({ following: true });
    });

    it('the Notification recipient is the followee, never the follower (actor)', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'followee-1' });
      (prisma.follow.create as jest.Mock).mockResolvedValue({ id: 'follow-1' });
      const service = new UsersService(prisma);

      await service.followUser('follower-1', 'followee-1');

      const callArgs = (prisma.notification.create as jest.Mock).mock.calls[0][0];
      expect(callArgs.data.userId).toBe('followee-1');
      expect(callArgs.data.userId).not.toBe('follower-1');
      // payloadRefId convention (users/README.md): the follower's own
      // userId, so the recipient's client can resolve "who followed me".
      expect(callArgs.data.payloadRefId).toBe('follower-1');
    });

    it('treats a duplicate follow (P2002) as idempotent success, without a duplicate Notification', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'followee-1' });
      const dupError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      (prisma.follow.create as jest.Mock).mockRejectedValue(dupError);
      const service = new UsersService(prisma);

      const result = await service.followUser('follower-1', 'followee-1');

      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(result).toEqual({ following: true });
    });

    it('creates exactly one Notification row across a follow followed by a duplicate (idempotent) follow', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'followee-1' });
      let following = false;
      (prisma.follow.create as jest.Mock).mockImplementation(() => {
        if (following) {
          return Promise.reject(
            new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
              code: 'P2002',
              clientVersion: '5.0.0',
            }),
          );
        }
        following = true;
        return Promise.resolve({ id: 'follow-1' });
      });
      const service = new UsersService(prisma);

      await service.followUser('follower-1', 'followee-1');
      await service.followUser('follower-1', 'followee-1'); // duplicate — P2002, idempotent

      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    });

    it('rethrows an unrelated Prisma error from followUser rather than swallowing it', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'followee-1' });
      const otherError = new Prisma.PrismaClientKnownRequestError('Something else', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      (prisma.follow.create as jest.Mock).mockRejectedValue(otherError);
      const service = new UsersService(prisma);

      await expect(service.followUser('follower-1', 'followee-1')).rejects.toBe(otherError);
    });

    it('rejects a self-unfollow with BadRequestException', async () => {
      const prisma = buildPrismaMock();
      const service = new UsersService(prisma);

      await expect(service.unfollowUser('user-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.follow.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException from unfollowUser when followeeId does not reference a real user', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new UsersService(prisma);

      await expect(service.unfollowUser('user-1', 'ghost')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.follow.delete).not.toHaveBeenCalled();
    });

    it('deletes the Follow row on unfollow', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'followee-1' });
      (prisma.follow.delete as jest.Mock).mockResolvedValue({ id: 'follow-1' });
      const service = new UsersService(prisma);

      const result = await service.unfollowUser('follower-1', 'followee-1');

      expect(prisma.follow.delete).toHaveBeenCalledWith({
        where: { followerId_followeeId: { followerId: 'follower-1', followeeId: 'followee-1' } },
      });
      expect(result).toEqual({ following: false });
    });

    it('is idempotent (no error) when unfollowing a user that was never followed (P2025)', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'followee-1' });
      const notFoundError = new Prisma.PrismaClientKnownRequestError('Record to delete does not exist', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      (prisma.follow.delete as jest.Mock).mockRejectedValue(notFoundError);
      const service = new UsersService(prisma);

      await expect(service.unfollowUser('follower-1', 'followee-1')).resolves.toEqual({ following: false });
    });

    it('rethrows an unrelated Prisma error from unfollowUser rather than swallowing it', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'followee-1' });
      const otherError = new Prisma.PrismaClientKnownRequestError('Something else', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      (prisma.follow.delete as jest.Mock).mockRejectedValue(otherError);
      const service = new UsersService(prisma);

      await expect(service.unfollowUser('follower-1', 'followee-1')).rejects.toBe(otherError);
    });
  });

  describe('getFollowers / getFollowing', () => {
    function buildFollowRow(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: 'follow-1',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        follower: { id: 'follower-1', displayName: 'Follower One' },
        followee: { id: 'followee-1', displayName: 'Followee One' },
        ...overrides,
      };
    }

    it('throws NotFoundException from getFollowers when :id does not reference a real user', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new UsersService(prisma);

      await expect(service.getFollowers('ghost', {})).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.follow.findMany).not.toHaveBeenCalled();
    });

    it('scopes getFollowers to Follow rows where followeeId = :id, ordered most-recent-first', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1' });
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([]);
      const service = new UsersService(prisma);

      await service.getFollowers('user-1', {});

      const callArgs = (prisma.follow.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where).toEqual({ followeeId: 'user-1' });
      expect(callArgs.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    });

    it('returns the embedded follower as the minimal {id, displayName} shape, no passwordHash/isMinor', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1' });
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([buildFollowRow()]);
      const service = new UsersService(prisma);

      const page = await service.getFollowers('user-1', {});

      expect(page.items).toEqual([{ id: 'follower-1', displayName: 'Follower One' }]);

      const callArgs = (prisma.follow.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.select.follower.select).not.toHaveProperty('passwordHash');
      expect(callArgs.select.follower.select).not.toHaveProperty('isMinor');
    });

    it('paginates getFollowers with a nextCursor when more rows exist than the limit', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1' });
      const rows = [
        buildFollowRow({ id: 'follow-3', createdAt: new Date('2026-08-03T00:00:00.000Z') }),
        buildFollowRow({ id: 'follow-2', createdAt: new Date('2026-08-02T00:00:00.000Z') }),
        buildFollowRow({ id: 'follow-1', createdAt: new Date('2026-08-01T00:00:00.000Z') }), // lookahead
      ];
      (prisma.follow.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new UsersService(prisma);

      const page = await service.getFollowers('user-1', { limit: 2 });

      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).toBe(
        encodeFeedCursor({ createdAt: new Date('2026-08-02T00:00:00.000Z'), id: 'follow-2' }),
      );
    });

    it('returns nextCursor: null when fewer rows exist than the limit', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1' });
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([buildFollowRow()]);
      const service = new UsersService(prisma);

      const page = await service.getFollowers('user-1', { limit: 10 });

      expect(page.items).toHaveLength(1);
      expect(page.nextCursor).toBeNull();
    });

    it('applies a cursor filter (createdAt < cursor OR createdAt = cursor AND id < cursor.id) to getFollowers', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1' });
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([]);
      const service = new UsersService(prisma);
      const cursor = encodeFeedCursor({ createdAt: new Date('2026-08-02T00:00:00.000Z'), id: 'follow-2' });

      await service.getFollowers('user-1', { cursor });

      const callArgs = (prisma.follow.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where).toEqual({
        followeeId: 'user-1',
        OR: [
          { createdAt: { lt: new Date('2026-08-02T00:00:00.000Z') } },
          { createdAt: new Date('2026-08-02T00:00:00.000Z'), id: { lt: 'follow-2' } },
        ],
      });
    });

    it('throws NotFoundException from getFollowing when :id does not reference a real user', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new UsersService(prisma);

      await expect(service.getFollowing('ghost', {})).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.follow.findMany).not.toHaveBeenCalled();
    });

    it('scopes getFollowing to Follow rows where followerId = :id, and returns the embedded followee', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1' });
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([buildFollowRow()]);
      const service = new UsersService(prisma);

      const page = await service.getFollowing('user-1', {});

      const callArgs = (prisma.follow.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where).toEqual({ followerId: 'user-1' });
      expect(page.items).toEqual([{ id: 'followee-1', displayName: 'Followee One' }]);
    });
  });

  // sprint-2/followers-scope-fix -- revisits Decision Log #31 (see
  // users.controller.ts's and users.service.ts's own updated comments,
  // and users/README.md's "followers/following restricted-pending gap"
  // section). A restricted-pending minor as the TARGET (:id) must be
  // invisible via both getFollowers and getFollowing, regardless of
  // caller -- this is the gap #31 never checked.
  describe('getFollowers / getFollowing restricted-pending target visibility', () => {
    it('getFollowers 404s when :id is a minor with no Guardian row at all', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'minor-1', isMinor: true });
      (prisma.guardian.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new UsersService(prisma);

      await expect(service.getFollowers('minor-1', {})).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.follow.findMany).not.toHaveBeenCalled();
    });

    it('getFollowers 404s when :id is a minor with consentStatus still pending', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'minor-1', isMinor: true });
      (prisma.guardian.findUnique as jest.Mock).mockResolvedValue({ consentStatus: 'pending' });
      const service = new UsersService(prisma);

      await expect(service.getFollowers('minor-1', {})).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.follow.findMany).not.toHaveBeenCalled();
    });

    it('getFollowers succeeds when :id is a minor with confirmed consent', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'minor-1', isMinor: true });
      (prisma.guardian.findUnique as jest.Mock).mockResolvedValue({ consentStatus: 'confirmed' });
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([]);
      const service = new UsersService(prisma);

      await expect(service.getFollowers('minor-1', {})).resolves.toEqual({ items: [], nextCursor: null });
      expect(prisma.follow.findMany).toHaveBeenCalled();
    });

    it('getFollowers succeeds and never queries Guardian when :id is not a minor', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'adult-1', isMinor: false });
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([]);
      const service = new UsersService(prisma);

      await expect(service.getFollowers('adult-1', {})).resolves.toEqual({ items: [], nextCursor: null });
      expect(prisma.guardian.findUnique).not.toHaveBeenCalled();
    });

    it('getFollowing 404s when :id is a minor with consentStatus still pending', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'minor-1', isMinor: true });
      (prisma.guardian.findUnique as jest.Mock).mockResolvedValue({ consentStatus: 'pending' });
      const service = new UsersService(prisma);

      await expect(service.getFollowing('minor-1', {})).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.follow.findMany).not.toHaveBeenCalled();
    });

    it('getFollowing succeeds when :id is a minor with confirmed consent', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'minor-1', isMinor: true });
      (prisma.guardian.findUnique as jest.Mock).mockResolvedValue({ consentStatus: 'confirmed' });
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([]);
      const service = new UsersService(prisma);

      await expect(service.getFollowing('minor-1', {})).resolves.toEqual({ items: [], nextCursor: null });
      expect(prisma.follow.findMany).toHaveBeenCalled();
    });

    it('Guardian is looked up by minorUserId with a fresh Postgres read, never trusted from a cached/stale value', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'minor-1', isMinor: true });
      (prisma.guardian.findUnique as jest.Mock).mockResolvedValue({ consentStatus: 'confirmed' });
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([]);
      const service = new UsersService(prisma);

      await service.getFollowers('minor-1', {});

      expect(prisma.guardian.findUnique).toHaveBeenCalledWith({
        where: { minorUserId: 'minor-1' },
        select: { consentStatus: true },
      });
    });

    it('restriction applies regardless of which existing user is asking -- getFollowers takes no caller param at all', async () => {
      // assertFollowGraphVisible is only ever passed the route's :id
      // (the target), never the caller -- this test documents that the
      // service method's signature structurally cannot special-case "but
      // the minor is asking about themselves," matching option (a)'s
      // "regardless of caller" requirement.
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'minor-1', isMinor: true });
      (prisma.guardian.findUnique as jest.Mock).mockResolvedValue({ consentStatus: 'pending' });
      const service = new UsersService(prisma);

      expect(service.getFollowers.length).toBe(2); // (userId, query) -- no caller/actor param
      await expect(service.getFollowers('minor-1', {})).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
