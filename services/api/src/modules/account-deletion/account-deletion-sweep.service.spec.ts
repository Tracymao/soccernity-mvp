import { PrismaService } from '../../prisma/prisma.service';
import {
  AccountDeletionSweepService,
  DELETED_USER_DISPLAY_NAME,
  UNUSABLE_PASSWORD_HASH,
  deletedUserEmail,
} from './account-deletion-sweep.service';

// A report row involving the user as its subject, still open: held by the report rule (B-044).
const OPEN_SUBJECT_REPORT = {
  status: 'open',
  appealStatus: null,
  reviewedAt: null,
  appealReviewedAt: null,
  isReporter: false,
  isSubject: true,
};

function buildPrismaMock(opts: { held?: boolean } = {}) {
  const prisma = {
    // findUnique: anonymizeUser reads the avatar storage key before clearing it (B-035).
    user: { findMany: jest.fn(), findUnique: jest.fn().mockResolvedValue({ avatarKey: null }), update: jest.fn().mockResolvedValue({}) },
    guardian: { findUnique: jest.fn(), delete: jest.fn() },
    consentAuditRecord: { create: jest.fn(), deleteMany: jest.fn() },
    like: { deleteMany: jest.fn() },
    savedPost: { deleteMany: jest.fn() },
    follow: { deleteMany: jest.fn() },
    // B-039: Block rows (both directions) are removed with the user's other relationship rows.
    block: { deleteMany: jest.fn() },
    notification: { deleteMany: jest.fn() },
    // backend/w14-post-media-pipeline: the user's uploaded post media (none by default).
    postMedia: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
    matchSubscription: { deleteMany: jest.fn() },
    // B-092: a viewer's Final-week carousel impression rows go with their account.
    contestImpression: { deleteMany: jest.fn() },
    banterRoomMember: { deleteMany: jest.fn() },
    communityGroupMember: { deleteMany: jest.fn() },
    grassrootsTeam: { updateMany: jest.fn() },
    $executeRaw: jest.fn().mockResolvedValue(0),
    // B-044: admin holds (none by default) and the reports involving the user (findInvolvedReports).
    accountHold: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue(opts.held ? [OPEN_SUBJECT_REPORT] : []),
  } as unknown as PrismaService;
  (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );
  return prisma;
}

describe('AccountDeletionSweepService', () => {
  describe('anonymizeUser membership cleanup', () => {
    it('deletes Banter/Group/Club memberships and decrements each memberCount, inside the transaction', async () => {
      const prisma = buildPrismaMock();
      const service = new AccountDeletionSweepService(prisma);

      await service.anonymizeUser('user-1', false);

      expect(prisma.banterRoomMember.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(prisma.communityGroupMember.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      const sql = (prisma.$executeRaw as unknown as jest.Mock).mock.calls.map((c) => (c[0] as string[]).join('?'));
      expect(sql.some((q) => q.includes('UPDATE "BanterRoom"'))).toBe(true);
      expect(sql.some((q) => q.includes('UPDATE "CommunityGroup"'))).toBe(true);
      expect(sql.some((q) => q.includes('UPDATE "ClubPage"'))).toBe(true);
      expect(sql.some((q) => q.includes('DELETE FROM "_ClubMembership"'))).toBe(true);
      // counters are decremented BEFORE the membership rows disappear
      const clubUpdate = sql.findIndex((q) => q.includes('UPDATE "ClubPage"'));
      const clubDelete = sql.findIndex((q) => q.includes('DELETE FROM "_ClubMembership"'));
      expect(clubUpdate).toBeLessThan(clubDelete);
    });
  });

  // B-043 (Decision Log #375): anonymizedAt is what the 30-day purge counts from.
  describe('anonymizeUser anonymizedAt', () => {
    const updateData = (prisma: PrismaService) => (prisma.user.update as jest.Mock).mock.calls[0][0].data;

    it('stamps anonymizedAt with the supplied now, in the same user.update that sets accountStatus', async () => {
      const prisma = buildPrismaMock();
      const when = new Date('2026-10-01T10:00:00.000Z');

      await new AccountDeletionSweepService(prisma).anonymizeUser('user-1', false, when);

      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      expect(updateData(prisma)).toMatchObject({ accountStatus: 'deleted', anonymizedAt: when });
    });

    it('keeps the FIRST anonymizedAt when re-run on an already-anonymised row (the clock does not restart)', async () => {
      const prisma = buildPrismaMock();
      const first = new Date('2026-09-01T00:00:00.000Z');
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ avatarKey: null, coverKey: null, anonymizedAt: first });

      await new AccountDeletionSweepService(prisma).anonymizeUser('user-1', false, new Date('2026-10-01T00:00:00.000Z'));

      expect(updateData(prisma).anonymizedAt).toEqual(first);
    });

    it('the daily sweep passes its own now through, so anonymizedAt is the sweep time', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'user-1', isMinor: false }]);
      const now = new Date('2026-10-05T03:00:00.000Z');

      await new AccountDeletionSweepService(prisma).sweepPendingDeletions(now);

      expect(updateData(prisma).anonymizedAt).toEqual(now);
    });
  });

  // B-035: the avatar OBJECT is removed from storage after the commit, best effort.
  describe('anonymizeUser avatar object', () => {
    it('removes the stored avatar object by key after the transaction commits', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ avatarKey: 'avatars/user-1/abc.jpg' });
      const storage = { upload: jest.fn(), delete: jest.fn().mockResolvedValue(undefined) };
      const service = new AccountDeletionSweepService(prisma, storage);

      await service.anonymizeUser('user-1', false);

      expect(storage.delete).toHaveBeenCalledWith('avatars/user-1/abc.jpg');
      const upd = (prisma.user.update as jest.Mock).mock.invocationCallOrder[0];
      expect(storage.delete.mock.invocationCallOrder[0]).toBeGreaterThan(upd);
    });

    it('a storage failure never undoes or fails the anonymization', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ avatarKey: 'avatars/user-1/abc.jpg' });
      const storage = { upload: jest.fn(), delete: jest.fn().mockRejectedValue(new Error('503')) };
      const service = new AccountDeletionSweepService(prisma, storage);

      await expect(service.anonymizeUser('user-1', false)).resolves.toBeUndefined();
      expect(prisma.user.update).toHaveBeenCalled();
    });

    // B-196: the cover photo object goes the same way.
    it('removes the avatar object AND the cover photo object, each by its own key', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        avatarKey: 'avatars/user-1/abc.jpg',
        coverKey: 'covers/user-1/def.png',
      });
      const storage = { upload: jest.fn(), delete: jest.fn().mockResolvedValue(undefined) };

      await new AccountDeletionSweepService(prisma, storage).anonymizeUser('user-1', false);

      expect(storage.delete).toHaveBeenCalledWith('avatars/user-1/abc.jpg');
      expect(storage.delete).toHaveBeenCalledWith('covers/user-1/def.png');
      expect(storage.delete).toHaveBeenCalledTimes(2);
    });

    it('a failed avatar removal does not stop the cover removal, and never fails the anonymization', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        avatarKey: 'avatars/user-1/abc.jpg',
        coverKey: 'covers/user-1/def.png',
      });
      const storage = {
        upload: jest.fn(),
        delete: jest.fn().mockRejectedValueOnce(new Error('503')).mockResolvedValue(undefined),
      };

      await expect(new AccountDeletionSweepService(prisma, storage).anonymizeUser('user-1', false)).resolves.toBeUndefined();
      expect(storage.delete).toHaveBeenCalledWith('covers/user-1/def.png');
    });

    it('does not touch storage when the user had no avatar', async () => {
      const prisma = buildPrismaMock();
      const storage = { upload: jest.fn(), delete: jest.fn() };
      await new AccountDeletionSweepService(prisma, storage).anonymizeUser('user-1', false);
      expect(storage.delete).not.toHaveBeenCalled();
    });
  });

  // backend/w14-post-media-pipeline (Decision Log #419 item 9): the user's uploaded post and contest files
  // go with the account, even though #341 keeps their posts.
  describe('anonymizeUser post media', () => {
    // B-257 (Decision Log #430 item 2): an approved, published file has its PUBLIC object deleted; an unpublished
    // file's private object is deleted too, EXCEPT a rejected file's, which is kept (B-206, evidence handling OPEN).
    const published = new Date('2026-08-01T00:00:00Z');
    const rows = [
      {
        id: 'm1', postId: 'post-1', publicUrl: 'https://cdn.test/post-media/user-1/m1.jpg', status: 'approved', publishedAt: published,
        publicKey: 'post-media/user-1/m1.jpg', privateKey: null, quarantineKey: null,
      },
      { id: 'm2', postId: null, publicUrl: null, status: 'pending', publishedAt: null, publicKey: null, privateKey: null, quarantineKey: 'quarantine/user-1/m2' },
    ];

    it('deletes the rows, strips their URLs from surviving posts, and removes the objects after the commit', async () => {
      const prisma = buildPrismaMock();
      (prisma.postMedia.findMany as jest.Mock).mockResolvedValue(rows);
      const storage = { upload: jest.fn(), delete: jest.fn().mockResolvedValue(undefined) };

      await new AccountDeletionSweepService(prisma, storage).anonymizeUser('user-1', false);

      expect(prisma.postMedia.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { uploaderId: 'user-1' } }));
      expect(prisma.postMedia.deleteMany).toHaveBeenCalledWith({ where: { uploaderId: 'user-1' } });
      const sql = (prisma.$executeRaw as unknown as jest.Mock).mock.calls.map((c) => (c[0] as string[]).join('?'));
      expect(sql.some((q) => q.includes('array_remove("mediaUrls"'))).toBe(true);
      expect(storage.delete).toHaveBeenCalledWith('post-media/user-1/m1.jpg');
      expect(storage.delete).toHaveBeenCalledWith('quarantine/user-1/m2');
      const upd = (prisma.user.update as jest.Mock).mock.invocationCallOrder[0];
      expect(storage.delete.mock.invocationCallOrder[0]).toBeGreaterThan(upd);
    });

    it('never deletes the private object of a REJECTED file, but does delete a pending file private object', async () => {
      const prisma = buildPrismaMock();
      (prisma.postMedia.findMany as jest.Mock).mockResolvedValue([
        { id: 'r', postId: null, publicUrl: null, status: 'rejected', publishedAt: null, publicKey: 'post-media/user-1/r.jpg', privateKey: 'private-media/user-1/r.jpg', quarantineKey: null },
        { id: 'p', postId: null, publicUrl: null, status: 'pending', publishedAt: null, publicKey: 'post-media/user-1/p.jpg', privateKey: 'private-media/user-1/p.jpg', quarantineKey: null },
      ]);
      const storage = { upload: jest.fn(), delete: jest.fn().mockResolvedValue(undefined) };
      await new AccountDeletionSweepService(prisma, storage).anonymizeUser('user-1', false);
      expect(storage.delete.mock.calls.map((c) => c[0])).toEqual(['private-media/user-1/p.jpg']);
      expect(prisma.postMedia.deleteMany).toHaveBeenCalledWith({ where: { uploaderId: 'user-1' } });
    });

    it('a user with no uploaded media triggers no media deletion at all', async () => {
      const prisma = buildPrismaMock();
      const storage = { upload: jest.fn(), delete: jest.fn() };
      await new AccountDeletionSweepService(prisma, storage).anonymizeUser('user-1', false);
      expect(prisma.postMedia.deleteMany).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('a storage failure removing the files never fails the anonymization', async () => {
      const prisma = buildPrismaMock();
      (prisma.postMedia.findMany as jest.Mock).mockResolvedValue(rows);
      const storage = { upload: jest.fn(), delete: jest.fn().mockRejectedValue(new Error('503')) };
      await expect(new AccountDeletionSweepService(prisma, storage).anonymizeUser('user-1', false)).resolves.toBeUndefined();
      expect(prisma.user.update).toHaveBeenCalled();
    });
  });

  // B-044 (Decision Log #376): what a REPORT-held account keeps and loses.
  describe('minimiseHeldUser', () => {
    const CLEARED_FIELDS = {
      passwordHash: UNUSABLE_PASSWORD_HASH,
      phone: null,
      bio: null,
      preferredClub: null,
      profileCountry: null,
      clubAffiliationId: null,
      representedClubId: null,
      avatarUrl: null,
      avatarKey: null,
      avatarStatus: null,
      avatarRejectionReason: null,
      coverUrl: null,
      coverKey: null,
      coverStatus: null,
      coverRejectionReason: null,
    };
    // Evidence and safeguarding data: none of these may appear in the update at all.
    const KEPT_FIELDS = [
      'id',
      'email',
      'displayName',
      'username',
      'dateOfBirth',
      'isMinor',
      'isUnder16',
      'declaredCountry',
      'derivedCountry',
      'countryDerivationMethod',
      'countryDerivedAt',
      'accountStatus',
      'pendingDeletionAt',
      'anonymizedAt',
    ];

    it('clears every non-evidence field by name, in ONE user.update, and touches nothing it must keep', async () => {
      const prisma = buildPrismaMock();
      await new AccountDeletionSweepService(prisma).minimiseHeldUser('user-1');

      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      const call = (prisma.user.update as jest.Mock).mock.calls[0][0];
      expect(call.where).toEqual({ id: 'user-1' });
      expect(call.data).toEqual(CLEARED_FIELDS);
      for (const kept of KEPT_FIELDS) expect(call.data).not.toHaveProperty(kept);
    });

    it('runs in one transaction and deletes the behavioural rows (with the counters kept honest)', async () => {
      const prisma = buildPrismaMock();
      await new AccountDeletionSweepService(prisma).minimiseHeldUser('user-1');

      expect((prisma as unknown as { $transaction: jest.Mock }).$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.like.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(prisma.savedPost.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(prisma.follow.deleteMany).toHaveBeenCalledWith({
        where: { OR: [{ followerId: 'user-1' }, { followeeId: 'user-1' }] },
      });
      expect(prisma.block.deleteMany).toHaveBeenCalledWith({
        where: { OR: [{ blockerId: 'user-1' }, { blockedId: 'user-1' }] },
      });
      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(prisma.contestImpression.deleteMany).toHaveBeenCalledWith({ where: { viewerId: 'user-1' } });
      expect(prisma.matchSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(prisma.banterRoomMember.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(prisma.communityGroupMember.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      const sql = (prisma.$executeRaw as unknown as jest.Mock).mock.calls.map((c) => (c[0] as string[]).join('?'));
      for (const needle of ['UPDATE "Post"', 'UPDATE "BanterRoom"', 'UPDATE "CommunityGroup"', 'UPDATE "ClubPage"', 'DELETE FROM "_ClubMembership"']) {
        expect(sql.some((q) => q.includes(needle))).toBe(true);
      }
    });

    it('KEEPS the evidence tables and the consent proof: no Guardian, ConsentAuditRecord, PostMedia or team writes', async () => {
      const prisma = buildPrismaMock();
      await new AccountDeletionSweepService(prisma).minimiseHeldUser('user-1');

      expect(prisma.guardian.findUnique).not.toHaveBeenCalled();
      expect(prisma.guardian.delete).not.toHaveBeenCalled();
      expect(prisma.consentAuditRecord.create).not.toHaveBeenCalled();
      expect(prisma.postMedia.findMany).not.toHaveBeenCalled();
      expect(prisma.postMedia.deleteMany).not.toHaveBeenCalled();
      expect(prisma.grassrootsTeam.updateMany).not.toHaveBeenCalled();
    });

    it('is idempotent: a second run writes the same values and fails on nothing', async () => {
      const prisma = buildPrismaMock();
      const service = new AccountDeletionSweepService(prisma);

      await service.minimiseHeldUser('user-1');
      await service.minimiseHeldUser('user-1');

      const calls = (prisma.user.update as jest.Mock).mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[1][0].data).toEqual(calls[0][0].data);
    });

    it('removes the avatar and cover objects from storage after the commit, and a storage failure does not fail it', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ avatarKey: 'avatars/u1.png', coverKey: 'covers/u1.png' });
      const storage = { upload: jest.fn(), delete: jest.fn().mockRejectedValueOnce(new Error('503')).mockResolvedValue(undefined) };

      await expect(new AccountDeletionSweepService(prisma, storage).minimiseHeldUser('user-1')).resolves.toBeUndefined();

      expect(storage.delete).toHaveBeenCalledWith('avatars/u1.png');
      expect(storage.delete).toHaveBeenCalledWith('covers/u1.png');
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('listStalledHolds', () => {
    const now = new Date('2026-12-01T00:00:00.000Z');

    it('queries pending_deletion users past grace + threshold and keeps only those with an open investigation', async () => {
      const prisma = buildPrismaMock({ held: true });
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: 'u1', displayName: 'A', email: 'a@x.com', pendingDeletionAt: new Date('2026-06-01T00:00:00.000Z') },
      ]);
      const service = new AccountDeletionSweepService(prisma);

      const out = await service.listStalledHolds(90, now);

      // cutoff = now - (30 + 90) days
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { accountStatus: 'pending_deletion', pendingDeletionAt: { lte: new Date('2026-08-03T00:00:00.000Z') } },
        }),
      );
      expect(out).toHaveLength(1);
      // heldSince = 2026-06-01 + 30d = 2026-07-01; 153 days before 2026-12-01
      expect(out[0]).toMatchObject({ userId: 'u1', daysHeld: 153, holdType: 'open_report' });
      expect(out[0].heldSince).toEqual(new Date('2026-07-01T00:00:00.000Z'));
    });

    it('omits candidates with no open investigation and never mutates anything', async () => {
      const prisma = buildPrismaMock({ held: false });
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: 'u1', displayName: 'A', email: 'a@x.com', pendingDeletionAt: new Date('2026-01-01T00:00:00.000Z') },
      ]);
      const service = new AccountDeletionSweepService(prisma);

      expect(await service.listStalledHolds(90, now)).toEqual([]);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('reports WHY each account is held (holdType), strongest first, keeping every existing field', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: 'legal', displayName: 'L', email: 'l@x.com', pendingDeletionAt: new Date('2026-01-01T00:00:00.000Z') },
        { id: 'bad', displayName: 'B', email: 'b@x.com', pendingDeletionAt: new Date('2026-01-01T00:00:00.000Z') },
        { id: 'post', displayName: 'P', email: 'p@x.com', pendingDeletionAt: new Date('2026-01-01T00:00:00.000Z') },
        { id: 'win', displayName: 'W', email: 'w@x.com', pendingDeletionAt: new Date('2026-01-01T00:00:00.000Z') },
        { id: 'free', displayName: 'F', email: 'f@x.com', pendingDeletionAt: new Date('2026-01-01T00:00:00.000Z') },
      ]);
      (prisma.accountHold.findMany as jest.Mock).mockImplementation(async ({ where }: { where: { userId: string } }) => {
        if (where.userId === 'legal') return [{ id: 'h1', type: 'legal_hold', reportId: 'r', expiresAt: null }];
        if (where.userId === 'bad') return [{ id: 'h2', type: 'bad_faith', reportId: 'r', expiresAt: new Date('2027-06-01T00:00:00.000Z') }];
        return [];
      });
      // dismissed 2026-11-01: closure 2026-11-01, post-closure until 2027-05-01 -> still held on 2026-12-01
      const closed = { status: 'reviewed', appealStatus: null, reviewedAt: new Date('2026-11-01T00:00:00.000Z'), appealReviewedAt: null, isReporter: false, isSubject: true };
      // actioned 2026-11-20, no appeal: window (30d) runs to 2026-12-20 -> appeal_window on 2026-12-01
      const windowOpen = { status: 'actioned', appealStatus: null, reviewedAt: new Date('2026-11-20T00:00:00.000Z'), appealReviewedAt: null, isReporter: false, isSubject: true };
      (prisma.$queryRaw as unknown as jest.Mock).mockImplementation(async (_s: unknown, userId: string) => {
        if (userId === 'post') return [closed];
        if (userId === 'win') return [windowOpen];
        return [];
      });

      const out = await new AccountDeletionSweepService(prisma).listStalledHolds(90, now);

      expect(out.map((o) => [o.userId, o.holdType])).toEqual([
        ['legal', 'legal_hold'],
        ['bad', 'bad_faith'],
        ['post', 'post_closure'],
        ['win', 'appeal_window'],
      ]);
      // B-045: the marker is true only for an admin-placed hold (the ones a Lift control can end).
      expect(out.map((o) => [o.userId, o.isAdminHold])).toEqual([
        ['legal', true],
        ['bad', true],
        ['post', false],
        ['win', false],
      ]);
      expect(out[0]).toEqual(
        expect.objectContaining({ userId: 'legal', displayName: 'L', email: 'l@x.com', heldSince: expect.any(Date), daysHeld: expect.any(Number) }),
      );
      // backend/b045-held-list-hold-ids: ids to lift an admin hold; both null for a report-derived hold.
      expect(out.map((o) => [o.userId, o.holdId, o.reportId])).toEqual([
        ['legal', 'h1', 'r'],
        ['bad', 'h2', 'r'],
        ['post', null, null],
        ['win', null, null],
      ]);
    });

    describe('hold ids (backend/b045-held-list-hold-ids)', () => {
      const pendingAt = new Date('2026-01-01T00:00:00.000Z');
      const row = (id: string) => ({ id, displayName: id, email: `${id}@x.com`, pendingDeletionAt: pendingAt });

      it('a legal hold: holdId and reportId of that hold', async () => {
        const prisma = buildPrismaMock();
        (prisma.user.findMany as jest.Mock).mockResolvedValue([row('u')]);
        (prisma.accountHold.findMany as jest.Mock).mockResolvedValue([
          { id: 'legal-1', type: 'legal_hold', reportId: 'rep-1', expiresAt: null },
        ]);
        const [item] = await new AccountDeletionSweepService(prisma).listStalledHolds(90, now);
        expect(item).toMatchObject({ holdType: 'legal_hold', isAdminHold: true, holdId: 'legal-1', reportId: 'rep-1' });
      });

      it('a bad-faith hold: holdId and reportId of that hold', async () => {
        const prisma = buildPrismaMock();
        (prisma.user.findMany as jest.Mock).mockResolvedValue([row('u')]);
        (prisma.accountHold.findMany as jest.Mock).mockResolvedValue([
          { id: 'bad-1', type: 'bad_faith', reportId: 'rep-2', expiresAt: new Date('2027-06-01T00:00:00.000Z') },
        ]);
        const [item] = await new AccountDeletionSweepService(prisma).listStalledHolds(90, now);
        expect(item).toMatchObject({ holdType: 'bad_faith', isAdminHold: true, holdId: 'bad-1', reportId: 'rep-2' });
      });

      it('an admin hold with no report keeps reportId null but still has a holdId', async () => {
        const prisma = buildPrismaMock();
        (prisma.user.findMany as jest.Mock).mockResolvedValue([row('u')]);
        (prisma.accountHold.findMany as jest.Mock).mockResolvedValue([
          { id: 'legal-2', type: 'legal_hold', reportId: null, expiresAt: null },
        ]);
        const [item] = await new AccountDeletionSweepService(prisma).listStalledHolds(90, now);
        expect(item).toMatchObject({ isAdminHold: true, holdId: 'legal-2', reportId: null });
      });

      it('a report-derived hold: both ids null, even when the user once had a lifted admin hold', async () => {
        const prisma = buildPrismaMock({ held: true });
        (prisma.user.findMany as jest.Mock).mockResolvedValue([row('u')]);
        // the active-hold query filters lifted/expired in SQL, so a lifted hold never comes back
        (prisma.accountHold.findMany as jest.Mock).mockResolvedValue([]);
        const [item] = await new AccountDeletionSweepService(prisma).listStalledHolds(90, now);
        expect(item).toMatchObject({ holdType: 'open_report', isAdminHold: false, holdId: null, reportId: null });
      });

      it('several admin holds: the ids come from the strongest one (legal before bad faith), the same one holdType comes from', async () => {
        const prisma = buildPrismaMock();
        (prisma.user.findMany as jest.Mock).mockResolvedValue([row('u')]);
        (prisma.accountHold.findMany as jest.Mock).mockResolvedValue([
          { id: 'bad-9', type: 'bad_faith', reportId: 'rep-bad', expiresAt: new Date('2027-06-01T00:00:00.000Z') },
          { id: 'legal-9', type: 'legal_hold', reportId: 'rep-legal', expiresAt: null },
        ]);
        const [item] = await new AccountDeletionSweepService(prisma).listStalledHolds(90, now);
        expect(item).toMatchObject({ holdType: 'legal_hold', holdId: 'legal-9', reportId: 'rep-legal' });
      });

      it('an admin hold beats an open report on the same account, and its ids are returned', async () => {
        const prisma = buildPrismaMock({ held: true });
        (prisma.user.findMany as jest.Mock).mockResolvedValue([row('u')]);
        (prisma.accountHold.findMany as jest.Mock).mockResolvedValue([
          { id: 'bad-3', type: 'bad_faith', reportId: 'rep-3', expiresAt: new Date('2027-06-01T00:00:00.000Z') },
        ]);
        const [item] = await new AccountDeletionSweepService(prisma).listStalledHolds(90, now);
        expect(item).toMatchObject({ holdType: 'bad_faith', isAdminHold: true, holdId: 'bad-3', reportId: 'rep-3' });
      });

      it('changes nothing else about an item: same keys plus the two ids, same order', async () => {
        const prisma = buildPrismaMock();
        (prisma.user.findMany as jest.Mock).mockResolvedValue([row('b'), row('a')]);
        (prisma.accountHold.findMany as jest.Mock).mockResolvedValue([
          { id: 'h', type: 'legal_hold', reportId: 'r', expiresAt: null },
        ]);
        const out = await new AccountDeletionSweepService(prisma).listStalledHolds(90, now);
        expect(out.map((o) => o.userId)).toEqual(['b', 'a']);
        expect(Object.keys(out[0]).sort()).toEqual(
          ['daysHeld', 'displayName', 'email', 'heldSince', 'holdId', 'holdType', 'isAdminHold', 'reportId', 'userId'].sort(),
        );
        expect(out[0].heldSince).toEqual(new Date('2026-01-31T00:00:00.000Z'));
        expect(out[0].daysHeld).toBe(304);
      });
    });
  });

  describe('sweepPendingDeletions', () => {
    it('queries only accountStatus=pending_deletion rows with pendingDeletionAt at or before a 30-day-ago cutoff', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      const service = new AccountDeletionSweepService(prisma);

      await service.sweepPendingDeletions(new Date('2026-08-24T00:00:00.000Z'));

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          accountStatus: 'pending_deletion',
          pendingDeletionAt: { lte: new Date('2026-07-25T00:00:00.000Z') },
        },
        select: { id: true, isMinor: true },
      });
    });

    it('anonymizes a due, non-held user in place: one user.update, never a delete', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'user-1', isMinor: false }]);
      const service = new AccountDeletionSweepService(prisma);

      const result = await service.sweepPendingDeletions();

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          email: deletedUserEmail('user-1'),
          phone: null,
          displayName: DELETED_USER_DISPLAY_NAME,
          username: null,
          passwordHash: UNUSABLE_PASSWORD_HASH,
          dateOfBirth: null,
          clubAffiliationId: null,
          // B-023: the four country fields are personal data and are cleared too.
          declaredCountry: null,
          derivedCountry: null,
          countryDerivationMethod: null,
          countryDerivedAt: null,
          // B-038 / B-035: profile content, the optional profile country and the avatar reference.
          bio: null,
          preferredClub: null,
          profileCountry: null,
          avatarUrl: null,
          avatarKey: null,
          avatarStatus: null,
          avatarRejectionReason: null,
          // B-196: the cover photo reference is cleared too.
          coverUrl: null,
          coverKey: null,
          coverStatus: null,
          coverRejectionReason: null,
          accountStatus: 'deleted',
          pendingDeletionAt: null,
          // B-043 (#375): the purge clock starts here.
          anonymizedAt: expect.any(Date),
        },
      });
      expect((prisma.user as unknown as { delete?: unknown }).delete).toBeUndefined();
      // Decision Log #349: the guardian lookup is no longer gated on isMinor
      // (a user who turned 18 may still hold a Guardian row).
      expect(prisma.guardian.findUnique).toHaveBeenCalled();
      expect(result).toEqual({ anonymizedUserIds: ['user-1'], heldUserIds: [], minimisedUserIds: [] });
    });

    it('deletes the ephemeral rows (likes, saves, follows both directions, notifications), nulls team organiser, and never touches content tables', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'user-1', isMinor: false }]);
      const service = new AccountDeletionSweepService(prisma);

      await service.sweepPendingDeletions();

      expect(prisma.like.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(prisma.savedPost.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(prisma.follow.deleteMany).toHaveBeenCalledWith({
        where: { OR: [{ followerId: 'user-1' }, { followeeId: 'user-1' }] },
      });
      expect(prisma.block.deleteMany).toHaveBeenCalledWith({
        where: { OR: [{ blockerId: 'user-1' }, { blockedId: 'user-1' }] },
      });
      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(prisma.matchSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(prisma.contestImpression.deleteMany).toHaveBeenCalledWith({ where: { viewerId: 'user-1' } });
      expect(prisma.grassrootsTeam.updateMany).toHaveBeenCalledWith({
        where: { createdById: 'user-1' },
        data: { createdById: null },
      });
      // likeCount decrement runs (raw) before the Like rows are deleted
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(5); // likeCount + 3 memberCount decrements + club membership delete
      const raw = (prisma.$executeRaw as jest.Mock).mock.invocationCallOrder[0];
      const del = (prisma.like.deleteMany as jest.Mock).mock.invocationCallOrder[0];
      expect(raw).toBeLessThan(del);
    });

    it('minor with a confirmed Guardian row: snapshots a ConsentAuditRecord, deletes Guardian, then anonymizes the User', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'minor-1', isMinor: true }]);
      (prisma.guardian.findUnique as jest.Mock).mockResolvedValue({
        consentStatus: 'confirmed',
        consentTimestamp: new Date('2026-01-01T00:00:00.000Z'),
        consentScreenVersion: 'v1',
        consentDeviceType: 'mobile',
        consentVerificationMethod: 'email_link_plus_card_charge',
        consentVerificationAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const service = new AccountDeletionSweepService(prisma);

      const result = await service.sweepPendingDeletions();

      expect(prisma.consentAuditRecord.create).toHaveBeenCalledWith({
        data: {
          minorUserId: 'minor-1',
          consentStatus: 'confirmed',
          consentConfirmedAt: new Date('2026-01-01T00:00:00.000Z'),
          consentScreenVersion: 'v1',
          deviceType: 'mobile',
          verificationMethod: 'email_link_plus_card_charge',
          verificationAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      });
      expect(prisma.guardian.delete).toHaveBeenCalledWith({ where: { minorUserId: 'minor-1' } });
      const o = (m: unknown) => (m as jest.Mock).mock.invocationCallOrder[0];
      expect(o(prisma.consentAuditRecord.create)).toBeLessThan(o(prisma.guardian.delete));
      expect(o(prisma.guardian.delete)).toBeLessThan(o(prisma.user.update));
      expect(result.anonymizedUserIds).toEqual(['minor-1']);
    });

    it('minor with a still-pending Guardian row: snapshot has consentConfirmedAt: null', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'minor-1', isMinor: true }]);
      (prisma.guardian.findUnique as jest.Mock).mockResolvedValue({
        consentStatus: 'pending',
        consentTimestamp: null,
        consentScreenVersion: null,
        consentDeviceType: null,
        consentVerificationMethod: null,
        consentVerificationAt: null,
      });
      const service = new AccountDeletionSweepService(prisma);

      await service.sweepPendingDeletions();

      expect(prisma.consentAuditRecord.create).toHaveBeenCalledWith({
        data: {
          minorUserId: 'minor-1',
          consentStatus: 'pending',
          consentConfirmedAt: null,
          consentScreenVersion: null,
          deviceType: null,
          verificationMethod: null,
          verificationAt: null,
        },
      });
    });

    it('minor with NO Guardian row: no snapshot, no Guardian delete, User still anonymized', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'minor-1', isMinor: true }]);
      (prisma.guardian.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new AccountDeletionSweepService(prisma);

      const result = await service.sweepPendingDeletions();

      expect(prisma.consentAuditRecord.create).not.toHaveBeenCalled();
      expect(prisma.guardian.delete).not.toHaveBeenCalled();
      expect(result.anonymizedUserIds).toEqual(['minor-1']);
    });

    it('REPORT HOLD: a due user with an open involving report is not anonymised -- it is MINIMISED instead (B-044)', async () => {
      const prisma = buildPrismaMock({ held: true });
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'held-1', isMinor: true }]);
      const service = new AccountDeletionSweepService(prisma);

      const result = await service.sweepPendingDeletions();

      expect(result).toEqual({ anonymizedUserIds: [], heldUserIds: ['held-1'], minimisedUserIds: ['held-1'] });
      // exactly one update, and it is the minimisation: no accountStatus change, no anonymisation
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      const data = (prisma.user.update as jest.Mock).mock.calls[0][0].data;
      expect(data).not.toHaveProperty('accountStatus');
      expect(data).not.toHaveProperty('anonymizedAt');
      expect(prisma.guardian.delete).not.toHaveBeenCalled();
      expect(prisma.consentAuditRecord.create).not.toHaveBeenCalled();
    });

    it('ADMIN HOLD (legal_hold): skipped in FULL -- no transaction, no writes, not minimised', async () => {
      const prisma = buildPrismaMock({ held: true });
      (prisma.accountHold.findMany as jest.Mock).mockResolvedValue([
        { id: 'h1', type: 'legal_hold', reportId: 'r1', expiresAt: null },
      ]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'held-1', isMinor: true }]);
      const service = new AccountDeletionSweepService(prisma);

      const result = await service.sweepPendingDeletions();

      expect(result).toEqual({ anonymizedUserIds: [], heldUserIds: ['held-1'], minimisedUserIds: [] });
      expect((prisma as unknown as { $transaction: jest.Mock }).$transaction).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.like.deleteMany).not.toHaveBeenCalled();
    });

    it('ADMIN HOLD (bad_faith): skipped in full too, and an admin hold wins over a report hold', async () => {
      const prisma = buildPrismaMock({ held: true });
      (prisma.accountHold.findMany as jest.Mock).mockResolvedValue([
        { id: 'h2', type: 'bad_faith', reportId: 'r1', expiresAt: new Date('2027-01-01T00:00:00.000Z') },
      ]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'reporter-1', isMinor: false }]);

      const result = await new AccountDeletionSweepService(prisma).sweepPendingDeletions(new Date('2026-12-01T00:00:00.000Z'));

      expect(result.minimisedUserIds).toEqual([]);
      expect(result.heldUserIds).toEqual(['reporter-1']);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('asks for admin holds that are not lifted and not expired AS OF the sweep time', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'u1', isMinor: false }]);
      const now = new Date('2026-12-01T00:00:00.000Z');

      await new AccountDeletionSweepService(prisma).sweepPendingDeletions(now);

      expect(prisma.accountHold.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1', liftedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }),
      );
    });

    it('when the last hold has ended the account is anonymised normally on the next run', async () => {
      const prisma = buildPrismaMock(); // no admin hold rows, no involved reports
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'u1', isMinor: false }]);

      const result = await new AccountDeletionSweepService(prisma).sweepPendingDeletions();

      expect(result).toEqual({ anonymizedUserIds: ['u1'], heldUserIds: [], minimisedUserIds: [] });
      expect((prisma.user.update as jest.Mock).mock.calls[0][0].data).toMatchObject({ accountStatus: 'deleted' });
    });

    it('a rejecting anonymization propagates (transaction rolled back) rather than being swallowed', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'user-1', isMinor: false }]);
      const boom = new Error('boom');
      (prisma.user.update as jest.Mock).mockRejectedValue(boom);
      const service = new AccountDeletionSweepService(prisma);

      await expect(service.sweepPendingDeletions()).rejects.toBe(boom);
    });

    it('returns empty results when nothing is due', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      const service = new AccountDeletionSweepService(prisma);

      expect(await service.sweepPendingDeletions()).toEqual({ anonymizedUserIds: [], heldUserIds: [], minimisedUserIds: [] });
    });
  });

  describe('purgeExpiredConsentAuditRecords', () => {
    it('deletes ConsentAuditRecord rows with createdAt at or before a 6-calendar-month-ago cutoff', async () => {
      const prisma = buildPrismaMock();
      (prisma.consentAuditRecord.deleteMany as jest.Mock).mockResolvedValue({ count: 3 });
      const service = new AccountDeletionSweepService(prisma);
      const now = new Date('2026-08-24T00:00:00.000Z');

      const result = await service.purgeExpiredConsentAuditRecords(now);

      expect(prisma.consentAuditRecord.deleteMany).toHaveBeenCalledWith({
        where: { createdAt: { lte: new Date('2026-02-24T00:00:00.000Z') } },
      });
      expect(result).toEqual({ purgedCount: 3 });
    });

    it('does not touch User or Guardian at all — this timer is independent of any account-deletion state', async () => {
      const prisma = buildPrismaMock();
      (prisma.consentAuditRecord.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      const service = new AccountDeletionSweepService(prisma);

      await service.purgeExpiredConsentAuditRecords();

      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.guardian.findUnique).not.toHaveBeenCalled();
      expect(prisma.guardian.delete).not.toHaveBeenCalled();
    });
  });

  describe('runDailySweep', () => {
    it('runs both sweepPendingDeletions and purgeExpiredConsentAuditRecords', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.consentAuditRecord.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      const service = new AccountDeletionSweepService(prisma);
      const sweepSpy = jest.spyOn(service, 'sweepPendingDeletions');
      const purgeSpy = jest.spyOn(service, 'purgeExpiredConsentAuditRecords');

      await service.runDailySweep();

      expect(sweepSpy).toHaveBeenCalledTimes(1);
      expect(purgeSpy).toHaveBeenCalledTimes(1);
    });
  });
});
