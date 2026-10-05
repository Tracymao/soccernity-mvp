import { buildTestDobEncryption } from '../../crypto/test-dob-encryption';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { encodeFeedSequenceCursor } from '../feed/cursor.util';
import { UsersService } from './users.service';

function buildPrismaMock() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
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
    // sprint-2/contest-data-model-backend (Decision Log #219): followUser
    // now writes a baseline-engagement PointsLedgerEntry for the follower
    // inside its transaction callback (via awardPoints).
    pointsLedgerEntry: {
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
  username: null as string | null,
  dateOfBirth: buildTestDobEncryption().encrypt(new Date('2000-01-01')),
  isMinor: false,
  role: 'fan',
  verificationStatus: 'unverified',
  createdAt: new Date('2026-01-01'),
  clubAffiliationId: null,
  // backend/team-organiser-flag — read-only, set only by
  // GrassrootsService.createTeam.
  isTeamOrganiser: false,
  isUnder16: false,
  guardian: null as { email: string } | null,
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

      const service = new UsersService(prisma, buildTestDobEncryption());
      const result = await service.getOwnProfile('user-1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.isMinor).toBe(false);
      expect(result.verificationStatus).toBe('unverified');
    });

    const yearsAgo = (n: number) => {
      const d = new Date();
      d.setFullYear(d.getFullYear() - n);
      return d;
    };
    const dobEnc = buildTestDobEncryption();

    it.each([
      ['an under-16', 12, true],
      ['a 16-17 minor', 17, false],
    ])('exposes the labelled guardianContact to the owner for %s', async (_l, age, under16) => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(
        withoutPasswordHash({
          ...FULL_DB_ROW,
          dateOfBirth: dobEnc.encrypt(yearsAgo(age)),
          isMinor: true,
          isUnder16: under16,
          guardian: { email: 'parent@example.com' },
        }),
      );
      const result = await new UsersService(prisma, dobEnc).getOwnProfile('user-1');

      expect(result.guardianContact).toEqual({ label: 'Guardian contact', email: 'parent@example.com' });
      expect(result).not.toHaveProperty('guardian');
    });

    it('does NOT expose guardianContact for an adult even if a Guardian row survives', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(
        withoutPasswordHash({ ...FULL_DB_ROW, isMinor: false, guardian: { email: 'parent@example.com' } }),
      );
      const result = await new UsersService(prisma, dobEnc).getOwnProfile('user-1');

      expect(result.guardianContact).toBeNull();
      expect(JSON.stringify(result)).not.toContain('parent@example.com');
    });

    it('hides guardianContact on the 18th birthday even before the age sweep has flipped isMinor', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(
        withoutPasswordHash({
          ...FULL_DB_ROW,
          dateOfBirth: dobEnc.encrypt(yearsAgo(18)),
          isMinor: true,
          guardian: { email: 'parent@example.com' },
        }),
      );
      const result = await new UsersService(prisma, dobEnc).getOwnProfile('user-1');

      expect(result.guardianContact).toBeNull();
    });

    it('the Prisma select clause itself never requests passwordHash', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...FULL_DB_ROW,
        passwordHash: undefined,
      });

      const service = new UsersService(prisma, buildTestDobEncryption());
      await service.getOwnProfile('user-1');

      const callArgs = (prisma.user.findUnique as jest.Mock).mock.calls[0][0];
      expect(callArgs.select.passwordHash).toBeUndefined();
      expect(callArgs.select).not.toHaveProperty('passwordHash');
    });

    it('throws NotFoundException if the user no longer exists', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const service = new UsersService(prisma, buildTestDobEncryption());

      await expect(service.getOwnProfile('ghost-user')).rejects.toThrow(NotFoundException);
    });

    it('includes isTeamOrganiser in both the Prisma select and the response — read-only, set only by GrassrootsService.createTeam', async () => {
      const prisma = buildPrismaMock();
      const selected = withoutPasswordHash({ ...FULL_DB_ROW, isTeamOrganiser: true });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(selected);

      const service = new UsersService(prisma, buildTestDobEncryption());
      const result = await service.getOwnProfile('user-1');

      const callArgs = (prisma.user.findUnique as jest.Mock).mock.calls[0][0];
      expect(callArgs.select.isTeamOrganiser).toBe(true);
      expect(result.isTeamOrganiser).toBe(true);
    });
  });

  describe('getPublicProfile', () => {
    const dobEnc = buildTestDobEncryption();
    const yearsAgo = (n: number) => {
      const d = new Date();
      d.setFullYear(d.getFullYear() - n);
      return d;
    };
    const row = (over: Record<string, unknown> = {}) => ({
      id: 'minor-1',
      displayName: 'Young Player',
      dateOfBirth: dobEnc.encrypt(yearsAgo(14)),
      isMinor: true,
      accountStatus: 'active',
      guardian: { email: 'parent@example.com', consentStatus: 'confirmed' },
      ...over,
    });
    const run = async (r: unknown) => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(r);
      return new UsersService(prisma, dobEnc).getPublicProfile('minor-1');
    };

    it('shows a minor guardianContact to any viewer, and nothing else about them', async () => {
      const result = await run(row());
      expect(result).toEqual({
        id: 'minor-1',
        publicName: 'Young Player',
        guardianContact: { label: 'Guardian contact', email: 'parent@example.com' },
      });
    });

    it('also shows it for a 16-17 minor', async () => {
      const result = await run(row({ dateOfBirth: dobEnc.encrypt(yearsAgo(17)) }));
      expect(result.guardianContact?.email).toBe('parent@example.com');
    });

    it('returns null guardianContact for an adult, even with a surviving Guardian row', async () => {
      const result = await run(row({ isMinor: false, dateOfBirth: dobEnc.encrypt(yearsAgo(30)) }));
      expect(result.guardianContact).toBeNull();
      expect(JSON.stringify(result)).not.toContain('parent@example.com');
    });

    it('stops showing it once the minor turns 18, even if isMinor has not been flipped yet', async () => {
      const result = await run(row({ dateOfBirth: dobEnc.encrypt(yearsAgo(18)) }));
      expect(result.guardianContact).toBeNull();
    });

    it('404s for a restricted-pending minor, a non-active account, and a missing user', async () => {
      await expect(run(row({ guardian: { email: 'p@example.com', consentStatus: 'pending' } }))).rejects.toThrow(
        NotFoundException,
      );
      await expect(run(row({ accountStatus: 'deactivated' }))).rejects.toThrow(NotFoundException);
      await expect(run(null)).rejects.toThrow(NotFoundException);
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

      const service = new UsersService(prisma, buildTestDobEncryption());
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

      const service = new UsersService(prisma, buildTestDobEncryption());
      // Simulates a dto object that somehow has extra safeguarding-related
      // keys on it (e.g. if a future refactor loosened DTO validation) —
      // toUpdateData() must not read them.
      const dtoWithExtraFields = {
        displayName: 'New Name',
        isMinor: true,
        role: 'admin',
        verificationStatus: 'verified',
        // backend/team-organiser-flag — settable ONLY by
        // GrassrootsService.createTeam, never via this endpoint.
        isTeamOrganiser: true,
      } as never;

      await service.updateOwnProfile('user-1', dtoWithExtraFields);

      const callArgs = (prisma.user.update as jest.Mock).mock.calls[0][0];
      expect(callArgs.data).toEqual({ displayName: 'New Name' });
      expect(callArgs.data).not.toHaveProperty('isMinor');
      expect(callArgs.data).not.toHaveProperty('role');
      expect(callArgs.data).not.toHaveProperty('isTeamOrganiser');
      expect(callArgs.data).not.toHaveProperty('verificationStatus');
    });

    it('produces an empty update payload when no allowed fields are provided', async () => {
      const prisma = buildPrismaMock();
      const selected = withoutPasswordHash(FULL_DB_ROW);
      (prisma.user.update as jest.Mock).mockResolvedValue(selected);

      const service = new UsersService(prisma, buildTestDobEncryption());
      await service.updateOwnProfile('user-1', {});

      const callArgs = (prisma.user.update as jest.Mock).mock.calls[0][0];
      expect(callArgs.data).toEqual({});
    });
  });

  describe('followUser / unfollowUser', () => {
    it('rejects a self-follow with BadRequestException, without querying Prisma at all', async () => {
      const prisma = buildPrismaMock();
      const service = new UsersService(prisma, buildTestDobEncryption());

      await expect(service.followUser('user-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.follow.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when followeeId does not reference a real user', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new UsersService(prisma, buildTestDobEncryption());

      await expect(service.followUser('user-1', 'ghost')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.follow.create).not.toHaveBeenCalled();
    });

    it('creates a Follow row and a recipient Notification (type: follow) transactionally', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'followee-1' });
      (prisma.follow.create as jest.Mock).mockResolvedValue({ id: 'follow-1' });
      const service = new UsersService(prisma, buildTestDobEncryption());

      const result = await service.followUser('follower-1', 'followee-1');

      expect(prisma.follow.create).toHaveBeenCalledWith({
        data: { followerId: 'follower-1', followeeId: 'followee-1' },
      });
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: { userId: 'followee-1', type: 'follow', payloadRefId: 'follower-1' },
      });
      // Decision Log #219: the FOLLOWER (action-taker) earns a
      // baseline-engagement point, keyed on the followee id.
      expect((prisma as unknown as { pointsLedgerEntry: { create: jest.Mock } }).pointsLedgerEntry.create).toHaveBeenCalledWith({
        data: {
          userId: 'follower-1',
          source: 'engagement_follow',
          refId: 'followee-1',
          points: 1,
          clubId: null,
          occurredAt: expect.any(Date),
        },
      });
      expect(result).toEqual({ following: true });
    });

    it('does not award a points row on a duplicate (idempotent) follow', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'followee-1' });
      const dup = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      (prisma.follow.create as jest.Mock).mockRejectedValue(dup);
      const service = new UsersService(prisma, buildTestDobEncryption());

      await service.followUser('follower-1', 'followee-1');

      // tx.follow.create threw before awardPoints was reached — the whole
      // callback rolled back.
      expect((prisma as unknown as { pointsLedgerEntry: { create: jest.Mock } }).pointsLedgerEntry.create).not.toHaveBeenCalled();
    });

    it('the Notification recipient is the followee, never the follower (actor)', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'followee-1' });
      (prisma.follow.create as jest.Mock).mockResolvedValue({ id: 'follow-1' });
      const service = new UsersService(prisma, buildTestDobEncryption());

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
      const service = new UsersService(prisma, buildTestDobEncryption());

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
      const service = new UsersService(prisma, buildTestDobEncryption());

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
      const service = new UsersService(prisma, buildTestDobEncryption());

      await expect(service.followUser('follower-1', 'followee-1')).rejects.toBe(otherError);
    });

    it('rejects a self-unfollow with BadRequestException', async () => {
      const prisma = buildPrismaMock();
      const service = new UsersService(prisma, buildTestDobEncryption());

      await expect(service.unfollowUser('user-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.follow.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException from unfollowUser when followeeId does not reference a real user', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new UsersService(prisma, buildTestDobEncryption());

      await expect(service.unfollowUser('user-1', 'ghost')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.follow.delete).not.toHaveBeenCalled();
    });

    it('deletes the Follow row on unfollow', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'followee-1' });
      (prisma.follow.delete as jest.Mock).mockResolvedValue({ id: 'follow-1' });
      const service = new UsersService(prisma, buildTestDobEncryption());

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
      const service = new UsersService(prisma, buildTestDobEncryption());

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
      const service = new UsersService(prisma, buildTestDobEncryption());

      await expect(service.unfollowUser('follower-1', 'followee-1')).rejects.toBe(otherError);
    });
  });

  describe('getFollowers / getFollowing', () => {
    function buildFollowRow(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        sequence: 1,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        follower: { id: 'follower-1', displayName: 'Follower One' },
        followee: { id: 'followee-1', displayName: 'Followee One' },
        ...overrides,
      };
    }

    it('throws NotFoundException from getFollowers when :id does not reference a real user', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new UsersService(prisma, buildTestDobEncryption());

      await expect(service.getFollowers('ghost', {})).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.follow.findMany).not.toHaveBeenCalled();
    });

    it('scopes getFollowers to Follow rows where followeeId = :id, ordered most-recent-first', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1', accountStatus: 'active' });
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([]);
      const service = new UsersService(prisma, buildTestDobEncryption());

      await service.getFollowers('user-1', {});

      const callArgs = (prisma.follow.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where).toEqual({ followeeId: 'user-1', follower: { is: { accountStatus: 'active' } } });
      expect(callArgs.orderBy).toEqual([{ createdAt: 'desc' }, { sequence: 'desc' }]);
    });

    it('returns the embedded follower as the minimal {id, displayName} shape, no passwordHash/isMinor', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1', accountStatus: 'active' });
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([buildFollowRow()]);
      const service = new UsersService(prisma, buildTestDobEncryption());

      const page = await service.getFollowers('user-1', {});

      expect(page.items).toEqual([{ id: 'follower-1', publicName: 'Follower One' }]);

      const callArgs = (prisma.follow.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.select.follower.select).not.toHaveProperty('passwordHash');
      expect(callArgs.select.follower.select).not.toHaveProperty('isMinor');
    });

    it('paginates getFollowers with a nextCursor when more rows exist than the limit', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1', accountStatus: 'active' });
      const rows = [
        buildFollowRow({ sequence: 3, createdAt: new Date('2026-08-03T00:00:00.000Z') }),
        buildFollowRow({ sequence: 2, createdAt: new Date('2026-08-02T00:00:00.000Z') }),
        buildFollowRow({ sequence: 1, createdAt: new Date('2026-08-01T00:00:00.000Z') }), // lookahead
      ];
      (prisma.follow.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new UsersService(prisma, buildTestDobEncryption());

      const page = await service.getFollowers('user-1', { limit: 2 });

      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).toBe(
        encodeFeedSequenceCursor({ createdAt: new Date('2026-08-02T00:00:00.000Z'), sequence: 2 }),
      );
    });

    it('returns nextCursor: null when fewer rows exist than the limit', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1', accountStatus: 'active' });
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([buildFollowRow()]);
      const service = new UsersService(prisma, buildTestDobEncryption());

      const page = await service.getFollowers('user-1', { limit: 10 });

      expect(page.items).toHaveLength(1);
      expect(page.nextCursor).toBeNull();
    });

    it('applies a cursor filter (createdAt < cursor OR createdAt = cursor AND sequence < cursor.sequence) to getFollowers', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1', accountStatus: 'active' });
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([]);
      const service = new UsersService(prisma, buildTestDobEncryption());
      const cursor = encodeFeedSequenceCursor({ createdAt: new Date('2026-08-02T00:00:00.000Z'), sequence: 2 });

      await service.getFollowers('user-1', { cursor });

      const callArgs = (prisma.follow.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where).toEqual({
        followeeId: 'user-1',
        follower: { is: { accountStatus: 'active' } },
        OR: [
          { createdAt: { lt: new Date('2026-08-02T00:00:00.000Z') } },
          { createdAt: new Date('2026-08-02T00:00:00.000Z'), sequence: { lt: 2 } },
        ],
      });
    });

    it('throws NotFoundException from getFollowing when :id does not reference a real user', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new UsersService(prisma, buildTestDobEncryption());

      await expect(service.getFollowing('ghost', {})).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.follow.findMany).not.toHaveBeenCalled();
    });

    it('scopes getFollowing to Follow rows where followerId = :id, and returns the embedded followee', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1', accountStatus: 'active' });
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([buildFollowRow()]);
      const service = new UsersService(prisma, buildTestDobEncryption());

      const page = await service.getFollowing('user-1', {});

      const callArgs = (prisma.follow.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where).toEqual({ followerId: 'user-1', followee: { is: { accountStatus: 'active' } } });
      expect(page.items).toEqual([{ id: 'followee-1', publicName: 'Followee One' }]);
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
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'minor-1', isMinor: true, accountStatus: 'active' });
      (prisma.guardian.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new UsersService(prisma, buildTestDobEncryption());

      await expect(service.getFollowers('minor-1', {})).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.follow.findMany).not.toHaveBeenCalled();
    });

    it('getFollowers 404s when :id is a minor with consentStatus still pending', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'minor-1', isMinor: true, accountStatus: 'active' });
      (prisma.guardian.findUnique as jest.Mock).mockResolvedValue({ consentStatus: 'pending' });
      const service = new UsersService(prisma, buildTestDobEncryption());

      await expect(service.getFollowers('minor-1', {})).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.follow.findMany).not.toHaveBeenCalled();
    });

    it('getFollowers succeeds when :id is a minor with confirmed consent', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'minor-1', isMinor: true, accountStatus: 'active' });
      (prisma.guardian.findUnique as jest.Mock).mockResolvedValue({ consentStatus: 'confirmed' });
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([]);
      const service = new UsersService(prisma, buildTestDobEncryption());

      await expect(service.getFollowers('minor-1', {})).resolves.toEqual({ items: [], nextCursor: null });
      expect(prisma.follow.findMany).toHaveBeenCalled();
    });

    it('getFollowers succeeds and never queries Guardian when :id is not a minor', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'adult-1', isMinor: false, accountStatus: 'active' });
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([]);
      const service = new UsersService(prisma, buildTestDobEncryption());

      await expect(service.getFollowers('adult-1', {})).resolves.toEqual({ items: [], nextCursor: null });
      expect(prisma.guardian.findUnique).not.toHaveBeenCalled();
    });

    it('getFollowing 404s when :id is a minor with consentStatus still pending', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'minor-1', isMinor: true, accountStatus: 'active' });
      (prisma.guardian.findUnique as jest.Mock).mockResolvedValue({ consentStatus: 'pending' });
      const service = new UsersService(prisma, buildTestDobEncryption());

      await expect(service.getFollowing('minor-1', {})).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.follow.findMany).not.toHaveBeenCalled();
    });

    it('getFollowing succeeds when :id is a minor with confirmed consent', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'minor-1', isMinor: true, accountStatus: 'active' });
      (prisma.guardian.findUnique as jest.Mock).mockResolvedValue({ consentStatus: 'confirmed' });
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([]);
      const service = new UsersService(prisma, buildTestDobEncryption());

      await expect(service.getFollowing('minor-1', {})).resolves.toEqual({ items: [], nextCursor: null });
      expect(prisma.follow.findMany).toHaveBeenCalled();
    });

    it('Guardian is looked up by minorUserId with a fresh Postgres read, never trusted from a cached/stale value', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'minor-1', isMinor: true, accountStatus: 'active' });
      (prisma.guardian.findUnique as jest.Mock).mockResolvedValue({ consentStatus: 'confirmed' });
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([]);
      const service = new UsersService(prisma, buildTestDobEncryption());

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
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'minor-1', isMinor: true, accountStatus: 'active' });
      (prisma.guardian.findUnique as jest.Mock).mockResolvedValue({ consentStatus: 'pending' });
      const service = new UsersService(prisma, buildTestDobEncryption());

      expect(service.getFollowers.length).toBe(2); // (userId, query) -- no caller/actor param
      await expect(service.getFollowers('minor-1', {})).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // sprint-2/account-deactivation-backend (Decision Log #221). A
  // deactivated / pending_deletion TARGET's follower/following graph is
  // hidden entirely (404, same as a non-existent user), and any
  // follower/followee who has since deactivated is filtered out of an
  // active target's list.
  describe('getFollowers / getFollowing deactivated-account visibility', () => {
    it('getFollowers 404s when :id is a deactivated account, before any Guardian or follow lookup', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'gone-1',
        isMinor: false,
        accountStatus: 'deactivated',
      });
      const service = new UsersService(prisma, buildTestDobEncryption());

      await expect(service.getFollowers('gone-1', {})).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.guardian.findUnique).not.toHaveBeenCalled();
      expect(prisma.follow.findMany).not.toHaveBeenCalled();
    });

    it('getFollowing 404s when :id is a pending_deletion account', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'gone-2',
        isMinor: false,
        accountStatus: 'pending_deletion',
      });
      const service = new UsersService(prisma, buildTestDobEncryption());

      await expect(service.getFollowing('gone-2', {})).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.follow.findMany).not.toHaveBeenCalled();
    });

    it('filters deactivated followers out of an active target\'s follower list via the query', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        isMinor: false,
        accountStatus: 'active',
      });
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([]);
      const service = new UsersService(prisma, buildTestDobEncryption());

      await service.getFollowers('user-1', {});

      const callArgs = (prisma.follow.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where.follower).toEqual({ is: { accountStatus: 'active' } });
    });
  });

  describe('getSuggestedUsers', () => {
    function suggestedRow(overrides: Partial<Record<string, unknown>> = {}) {
      return { id: 'user-2', displayName: 'Suggested Person', ...overrides };
    }

    it('excludes the caller themselves, restricted-pending minors excluded/deactivated accounts, and already-followed users, ordered most-recently-joined-first', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      const service = new UsersService(prisma, buildTestDobEncryption());

      await service.getSuggestedUsers('caller-1', 10);

      const callArgs = (prisma.user.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where).toEqual({
        id: { not: 'caller-1' },
        accountStatus: 'active',
        OR: [{ isMinor: false }, { guardian: { consentStatus: 'confirmed' } }],
        followedBy: { none: { followerId: 'caller-1' } },
      });
      expect(callArgs.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
      expect(callArgs.take).toBe(10);
    });

    it('returns the minimal {id, displayName} shape, no passwordHash/isMinor/email', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([suggestedRow()]);
      const service = new UsersService(prisma, buildTestDobEncryption());

      const result = await service.getSuggestedUsers('caller-1', 10);

      expect(result.items).toEqual([{ id: 'user-2', publicName: 'Suggested Person' }]);

      const callArgs = (prisma.user.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.select).not.toHaveProperty('passwordHash');
      expect(callArgs.select).not.toHaveProperty('isMinor');
      expect(callArgs.select).not.toHaveProperty('email');
      expect(callArgs.select).toEqual({ id: true, username: true, displayName: true });
    });

    it('passes limit straight through as a plain top-N cut — no nextCursor/pagination shape', async () => {
      const prisma = buildPrismaMock();
      const rows = [suggestedRow({ id: 'user-2' }), suggestedRow({ id: 'user-3' })];
      (prisma.user.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new UsersService(prisma, buildTestDobEncryption());

      const result = await service.getSuggestedUsers('caller-1', 2);

      expect(result).toEqual({
        items: [
          { id: 'user-2', publicName: 'Suggested Person' },
          { id: 'user-3', publicName: 'Suggested Person' },
        ],
      });
      expect(result).not.toHaveProperty('nextCursor');
      const callArgs = (prisma.user.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.take).toBe(2);
    });

    it('returns an empty list when the query finds nothing, without throwing', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      const service = new UsersService(prisma, buildTestDobEncryption());

      const result = await service.getSuggestedUsers('caller-1', 10);

      expect(result).toEqual({ items: [] });
    });
  });

  describe('username / public name (profile/username-column-and-display-convention)', () => {
    it("getOwnProfile exposes both the owner's username and the resolved publicName (username wins)", async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(
        withoutPasswordHash({ ...FULL_DB_ROW, username: 'goalie_9' }),
      );
      const result = await new UsersService(prisma, buildTestDobEncryption()).getOwnProfile('user-1');
      expect(result.username).toBe('goalie_9');
      expect(result.publicName).toBe('goalie_9');
      expect(result.displayName).toBe('Old Name');
    });

    it('getOwnProfile falls back to displayName as publicName when no username is set', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(withoutPasswordHash(FULL_DB_ROW));
      const result = await new UsersService(prisma, buildTestDobEncryption()).getOwnProfile('user-1');
      expect(result.username).toBeNull();
      expect(result.publicName).toBe('Old Name');
    });

    it('getPublicProfile returns the username as publicName and never leaks the real displayName', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'u9',
        username: 'goalie_9',
        displayName: 'Ada Obi',
        dateOfBirth: null,
        isMinor: false,
        accountStatus: 'active',
        guardian: null,
      });
      const result = await new UsersService(prisma, buildTestDobEncryption()).getPublicProfile('u9');
      expect(result.publicName).toBe('goalie_9');
      expect(JSON.stringify(result)).not.toContain('Ada Obi');
      expect(result).not.toHaveProperty('displayName');
    });

    it('follower entries show the username when set, the displayName otherwise, and never both', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1', accountStatus: 'active' });
      const base = { sequence: 1, createdAt: new Date('2026-01-01') };
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([
        { ...base, sequence: 2, follower: { id: 'a', username: 'goalie_9', displayName: 'Ada Obi' } },
        { ...base, sequence: 1, follower: { id: 'b', username: null, displayName: 'Ben Cole' } },
      ]);
      const page = await new UsersService(prisma, buildTestDobEncryption()).getFollowers('user-1', {});
      expect(page.items).toEqual([
        { id: 'a', publicName: 'goalie_9' },
        { id: 'b', publicName: 'Ben Cole' },
      ]);
    });

    it('updateOwnProfile stores the username lowercased so uniqueness is case-insensitive', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.update as jest.Mock).mockResolvedValue(
        withoutPasswordHash({ ...FULL_DB_ROW, username: 'goalie_9' }),
      );
      await new UsersService(prisma, buildTestDobEncryption()).updateOwnProfile('user-1', { username: 'Goalie_9' });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { username: 'goalie_9' } }),
      );
    });

    it('updateOwnProfile clears the username with null (returning to displayName)', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.update as jest.Mock).mockResolvedValue(withoutPasswordHash(FULL_DB_ROW));
      const result = await new UsersService(prisma, buildTestDobEncryption()).updateOwnProfile('user-1', {
        username: null,
      });
      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { username: null } }));
      expect(result.publicName).toBe('Old Name');
    });

    it('updateOwnProfile leaves the username untouched when the field is omitted', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.update as jest.Mock).mockResolvedValue(withoutPasswordHash(FULL_DB_ROW));
      await new UsersService(prisma, buildTestDobEncryption()).updateOwnProfile('user-1', { displayName: 'X' });
      const data = (prisma.user.update as jest.Mock).mock.calls[0][0].data;
      expect(data).not.toHaveProperty('username');
    });

    it('updateOwnProfile turns a unique-constraint race on username into a 409, not a 500', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.update as jest.Mock).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'x' }),
      );
      await expect(
        new UsersService(prisma, buildTestDobEncryption()).updateOwnProfile('user-1', { username: 'taken_name' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('updateOwnProfile rethrows an unrelated Prisma error', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.update as jest.Mock).mockRejectedValue(new Error('db down'));
      await expect(
        new UsersService(prisma, buildTestDobEncryption()).updateOwnProfile('user-1', { username: 'abc' }),
      ).rejects.toThrow('db down');
    });
  });
});
