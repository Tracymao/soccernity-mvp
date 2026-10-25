import { buildTestDobEncryption } from '../../crypto/test-dob-encryption';
import { BadRequestException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { policyStub } from './test-username-policy';
import { UsersService } from './users.service';

// backend/w5-profile-block: profile content (bio, preferred club, the optional
// profile country, avatar), the other-user public profile, and Block's effect on
// follow and the follower lists. Real-database proof lives in
// test/profile-block.e2e-spec.ts.

const dobEnc = buildTestDobEncryption();

function buildPrisma() {
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    follow: { create: jest.fn(), delete: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) },
    block: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    guardian: { findUnique: jest.fn() },
    notification: { create: jest.fn() },
    pointsLedgerEntry: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  } as unknown as PrismaService;
  (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = (prisma: PrismaService) => prisma as any;

const OWN_ROW = {
  id: 'u1',
  email: 'a@example.com',
  phone: null,
  displayName: 'Real Name',
  username: 'goalie_9',
  dateOfBirth: null,
  isMinor: false,
  isUnder16: false,
  role: 'fan',
  verificationStatus: 'verified',
  createdAt: new Date('2026-01-01'),
  clubAffiliationId: null,
  isTeamOrganiser: false,
  guardian: null,
  representedClub: null,
  bio: null,
  preferredClub: null,
  profileCountry: null,
  avatarUrl: null,
  avatarKey: null,
  avatarStatus: null,
};

function service(prisma: PrismaService) {
  return new UsersService(prisma, dobEnc, policyStub());
}

describe('UsersService — profile content (B-038, B-081)', () => {
  // B-214: the owner's own GET /users/:id is the one place the reason is returned.
  it('the owner profile carries the rejection reason of a REJECTED avatar and cover, and null otherwise', async () => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue({
      ...OWN_ROW,
      avatarUrl: 'https://cdn/a.jpg', avatarKey: 'avatars/u1/a.jpg', avatarStatus: 'rejected', avatarRejectionReason: 'Not a clear photo of you',
      coverUrl: 'https://cdn/c.jpg', coverKey: 'covers/u1/c.jpg', coverStatus: 'pending', coverRejectionReason: null,
    });
    const me = await service(prisma).getOwnProfile('u1');
    expect(me.avatar).toEqual({ url: 'https://cdn/a.jpg', status: 'rejected', rejectionReason: 'Not a clear photo of you' });
    expect(me.cover).toEqual({ url: 'https://cdn/c.jpg', status: 'pending', rejectionReason: null });
    expect(p(prisma).user.findUnique.mock.calls[0][0].select).toMatchObject({ avatarRejectionReason: true, coverRejectionReason: true });
    // The flat columns are folded into avatar/cover, not returned beside them.
    expect(me).not.toHaveProperty('avatarRejectionReason');
    expect(me).not.toHaveProperty('coverRejectionReason');
  });

  it('a reason on a row that is not rejected is never returned (the API does not trust a stale column)', async () => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue({
      ...OWN_ROW,
      avatarUrl: 'https://cdn/a.jpg', avatarKey: 'k', avatarStatus: 'pending', avatarRejectionReason: 'stale',
    });
    expect((await service(prisma).getOwnProfile('u1')).avatar?.rejectionReason).toBeNull();
  });

  it('the owner profile carries bio, preferredClub, profileCountry and the avatar WITHOUT its storage key', async () => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue({
      ...OWN_ROW,
      bio: 'Left back',
      preferredClub: 'Ikoyi Rovers',
      profileCountry: 'NG',
      avatarUrl: 'https://cdn/x.jpg',
      avatarKey: 'avatars/u1/x.jpg',
      avatarStatus: 'pending',
    });
    const me = await service(prisma).getOwnProfile('u1');
    expect(me).toMatchObject({ bio: 'Left back', preferredClub: 'Ikoyi Rovers', profileCountry: 'NG' });
    expect(me.avatar).toEqual({ url: 'https://cdn/x.jpg', status: 'pending', rejectionReason: null });
    expect(JSON.stringify(me)).not.toContain('avatars/u1/x.jpg');
    expect(me).not.toHaveProperty('avatarKey');
    // The select asks for the safeguarding country NOWHERE.
    const select = p(prisma).user.findUnique.mock.calls[0][0].select;
    expect(select).not.toHaveProperty('declaredCountry');
    expect(select).not.toHaveProperty('derivedCountry');
  });

  it('avatar is null when none is stored', async () => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue(OWN_ROW);
    expect((await service(prisma).getOwnProfile('u1')).avatar).toBeNull();
  });

  describe('updateOwnProfile', () => {
    function setup() {
      const prisma = buildPrisma();
      p(prisma).user.update.mockResolvedValue(OWN_ROW);
      return prisma;
    }
    const written = (prisma: PrismaService) => p(prisma).user.update.mock.calls[0][0].data;

    it('writes bio, preferredClub and the profile country trimmed / upper-cased', async () => {
      const prisma = setup();
      await service(prisma).updateOwnProfile('u1', { bio: '  Left back, Lagos  ', preferredClub: ' Ikoyi Rovers ', profileCountry: 'ng' });
      expect(written(prisma)).toEqual({ bio: 'Left back, Lagos', preferredClub: 'Ikoyi Rovers', profileCountry: 'NG' });
    });

    it('null or blank CLEARS each field (they may be removed, unlike the username)', async () => {
      const prisma = setup();
      await service(prisma).updateOwnProfile('u1', { bio: null, preferredClub: '   ', profileCountry: null });
      expect(written(prisma)).toEqual({ bio: null, preferredClub: null, profileCountry: null });
    });

    it('never writes the safeguarding country from this endpoint', async () => {
      const prisma = setup();
      await service(prisma).updateOwnProfile('u1', { profileCountry: 'FR' });
      const data = written(prisma);
      expect(data).toEqual({ profileCountry: 'FR' });
      expect(data).not.toHaveProperty('declaredCountry');
      expect(data).not.toHaveProperty('derivedCountry');
    });

    it('refuses a code that is not on the ISO list (400, coded) and writes nothing', async () => {
      const prisma = setup();
      await expect(service(prisma).updateOwnProfile('u1', { profileCountry: 'ZZ' })).rejects.toBeInstanceOf(BadRequestException);
      expect(p(prisma).user.update).not.toHaveBeenCalled();
    });

    it('a field that is not in the request is not touched', async () => {
      const prisma = setup();
      await service(prisma).updateOwnProfile('u1', { displayName: 'New Name' });
      expect(written(prisma)).toEqual({ displayName: 'New Name' });
    });

    describe('sensitive-content screen (#394 A3): "please rephrase", nothing saved', () => {
      it.each([
        ['bio', { bio: 'I am a Muslim and I have diabetes' }, 'bio'],
        ['preferredClub', { preferredClub: 'Gay Pride FC' }, 'preferredClub'],
      ])('refuses a flagged %s with a coded 422 naming the field, never the text', async (_n, dto, field) => {
        const prisma = setup();
        const err = await service(prisma).updateOwnProfile('u1', dto).catch((e) => e);
        expect(err).toBeInstanceOf(UnprocessableEntityException);
        const body = err.getResponse();
        expect(body).toMatchObject({ code: 'sensitive_content_rephrase_required' });
        expect(body.flaggedFields.map((f: { field: string }) => f.field)).toEqual([field]);
        expect(JSON.stringify(body)).not.toMatch(/Muslim|diabetes|Gay Pride/);
        expect(p(prisma).user.update).not.toHaveBeenCalled();
      });

      it('a flagged field blocks the WHOLE request, including the other fields', async () => {
        const prisma = setup();
        await expect(
          service(prisma).updateOwnProfile('u1', { displayName: 'Fine Name', bio: 'I have cancer' }),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);
        expect(p(prisma).user.update).not.toHaveBeenCalled();
      });

      it('has NO confirm path: confirmSensitive is not part of the request and nothing is logged for moderation', async () => {
        const prisma = setup();
        await expect(service(prisma).updateOwnProfile('u1', { bio: 'I have cancer' })).rejects.toBeInstanceOf(UnprocessableEntityException);
        expect(p(prisma).$transaction).not.toHaveBeenCalled();
      });

      it('a clean bio passes', async () => {
        const prisma = setup();
        await expect(service(prisma).updateOwnProfile('u1', { bio: 'Striker. Love a good tackle.' })).resolves.toBeDefined();
      });
    });
  });
});

describe('UsersService — other-user public profile (B-082 backend leg, B-039)', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 't1',
    username: 'ada_9',
    displayName: 'Ada Obi',
    dateOfBirth: null,
    isMinor: false,
    accountStatus: 'active',
    guardian: null,
    bio: 'Winger',
    profileCountry: 'NG',
    avatarUrl: 'https://cdn/a.jpg',
    avatarStatus: 'approved',
    ...over,
  });
  const get = async (prisma: PrismaService, target = 't1', viewer = 'v1') => service(prisma).getPublicProfile(target, viewer);

  it('returns bio, the profile country and an APPROVED avatar, never the real name, the preferred club or a safeguarding field', async () => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue(row());
    const res = await get(prisma);
    expect(res).toMatchObject({ publicName: 'ada_9', bio: 'Winger', country: 'NG', avatarUrl: 'https://cdn/a.jpg', isFollowing: false, viewerHasBlocked: false });
    expect(JSON.stringify(res)).not.toContain('Ada Obi');
    for (const k of ['preferredClub', 'declaredCountry', 'derivedCountry', 'avatarKey', 'avatarStatus']) expect(res).not.toHaveProperty(k);
    const select = p(prisma).user.findUnique.mock.calls[0][0].select;
    for (const k of ['preferredClub', 'declaredCountry', 'derivedCountry', 'avatarKey']) expect(select).not.toHaveProperty(k);
  });

  // B-214 (Decision Log #412 item 2): the moderator's reason is shown to the owner alone.
  it('never selects either rejection reason for another user, and never returns one', async () => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue(
      row({ avatarStatus: 'rejected', avatarRejectionReason: 'Not a clear photo of you', coverUrl: 'https://cdn/c.jpg', coverStatus: 'rejected', coverRejectionReason: 'Contains text' }),
    );
    const res = await get(prisma);
    const select = p(prisma).user.findUnique.mock.calls[0][0].select;
    expect(select).not.toHaveProperty('avatarRejectionReason');
    expect(select).not.toHaveProperty('coverRejectionReason');
    expect(JSON.stringify(res)).not.toContain('Not a clear photo of you');
    expect(JSON.stringify(res)).not.toContain('Contains text');
    expect(JSON.stringify(res)).not.toContain('RejectionReason');
  });

  it.each(['pending', 'rejected'])('never serves an avatar whose status is %s (nothing sets approved yet, B-036)', async (status) => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue(row({ avatarStatus: status }));
    expect((await get(prisma)).avatarUrl).toBeNull();
  });

  it('country is null when the user did not fill it in -- a minor included: the safeguarding country is never a fallback', async () => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue(
      row({ profileCountry: null, isMinor: true, guardian: { email: 'g@example.com', consentStatus: 'confirmed' }, dateOfBirth: dobEnc.encrypt(new Date(Date.now() - 14 * 365.25 * 86400000)) }),
    );
    const res = await get(prisma);
    expect(res.country).toBeNull();
    expect(res.guardianContact).not.toBeNull();
  });

  it('a minor who DID enter a country shows it', async () => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue(row({ profileCountry: 'GB', isMinor: true, guardian: { email: 'g@example.com', consentStatus: 'confirmed' } }));
    expect((await get(prisma)).country).toBe('GB');
  });

  it('reports isFollowing and viewerHasBlocked for the viewer', async () => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue(row());
    p(prisma).follow.findUnique.mockResolvedValue({ id: 'f' });
    p(prisma).block.findMany.mockResolvedValue([{ blockerId: 'v1', blockedId: 't1' }]);
    expect(await get(prisma)).toMatchObject({ isFollowing: true, viewerHasBlocked: true });
  });

  it('own profile skips the block and follow reads', async () => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue(row({ id: 'v1' }));
    expect(await get(prisma, 'v1', 'v1')).toMatchObject({ isFollowing: false, viewerHasBlocked: false });
    expect(p(prisma).block.findMany).not.toHaveBeenCalled();
    expect(p(prisma).follow.findUnique).not.toHaveBeenCalled();
  });

  describe('Block: "not found", identical to a profile that does not exist (#404 item 8, #406 item 12)', () => {
    it('a user the target has blocked gets the SAME 404 (class, status, body) as a missing profile', async () => {
      const blocked = buildPrisma();
      p(blocked).user.findUnique.mockResolvedValue(row());
      p(blocked).block.findMany.mockResolvedValue([{ blockerId: 't1', blockedId: 'v1' }]);
      const a = await get(blocked).catch((e) => e);

      const missing = buildPrisma();
      p(missing).user.findUnique.mockResolvedValue(null);
      const b = await get(missing).catch((e) => e);

      expect(a).toBeInstanceOf(NotFoundException);
      expect(a.getStatus()).toBe(b.getStatus());
      expect(a.getResponse()).toEqual(b.getResponse());
    });

    it('does the same reads for a blocked profile as for a missing one (block read is unconditional for another user)', async () => {
      const prisma = buildPrisma();
      p(prisma).user.findUnique.mockResolvedValue(null);
      await get(prisma).catch(() => undefined);
      expect(p(prisma).block.findMany).toHaveBeenCalledTimes(1);
      expect(p(prisma).user.findUnique).toHaveBeenCalledTimes(1);
    });

    it('applies on top of the age rules: a restricted-pending target is still the plain 404 whatever the block says', async () => {
      const prisma = buildPrisma();
      p(prisma).user.findUnique.mockResolvedValue(row({ isMinor: true, guardian: { email: 'g@x.com', consentStatus: 'pending' } }));
      p(prisma).block.findMany.mockResolvedValue([{ blockerId: 'v1', blockedId: 't1' }]);
      await expect(get(prisma)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("the viewer's OWN block does not hide the profile (they must reach it to unblock)", async () => {
      const prisma = buildPrisma();
      p(prisma).user.findUnique.mockResolvedValue(row());
      p(prisma).block.findMany.mockResolvedValue([{ blockerId: 'v1', blockedId: 't1' }]);
      await expect(get(prisma)).resolves.toMatchObject({ viewerHasBlocked: true });
    });
  });
});

describe('UsersService — Block and follow (B-039)', () => {
  it('a follower the followee has blocked gets the SAME 404 as a non-existent user, nothing written', async () => {
    const blocked = buildPrisma();
    p(blocked).user.findUnique.mockResolvedValue({ id: 'e' });
    p(blocked).block.findMany.mockResolvedValue([{ blockerId: 'e', blockedId: 'f' }]);
    const a = await service(blocked).followUser('f', 'e').catch((x) => x);

    const missing = buildPrisma();
    p(missing).user.findUnique.mockResolvedValue(null);
    const b = await service(missing).followUser('f', 'ghost').catch((x) => x);

    expect(a).toBeInstanceOf(NotFoundException);
    expect(a.getStatus()).toBe(b.getStatus());
    expect(a.getResponse()).toEqual(b.getResponse());
    expect(p(blocked).follow.create).not.toHaveBeenCalled();
    expect(p(blocked).notification.create).not.toHaveBeenCalled();
  });

  it('the BLOCKER following the person they blocked gets an explicit 403 with a code, nothing written', async () => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue({ id: 'e' });
    p(prisma).block.findMany.mockResolvedValue([{ blockerId: 'f', blockedId: 'e' }]);
    const err = await service(prisma).followUser('f', 'e').catch((x) => x);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({ code: 'you_blocked_this_user' });
    expect(p(prisma).follow.create).not.toHaveBeenCalled();
  });

  it('with no block, follow works as before', async () => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue({ id: 'e' });
    await expect(service(prisma).followUser('f', 'e')).resolves.toEqual({ following: true });
    expect(p(prisma).follow.create).toHaveBeenCalled();
  });

  describe('follower / following lists', () => {
    const target = { id: 'tgt', isMinor: false, accountStatus: 'active' };

    it("a viewer the TARGET has blocked gets the same 404 as a missing user for the target's followers and following", async () => {
      const prisma = buildPrisma();
      p(prisma).user.findUnique.mockResolvedValue(target);
      p(prisma).block.findFirst.mockResolvedValue({ id: 'b' });
      await expect(service(prisma).getFollowers('tgt', {}, 'viewer')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service(prisma).getFollowing('tgt', {}, 'viewer')).rejects.toBeInstanceOf(NotFoundException);
      expect(p(prisma).block.findFirst).toHaveBeenCalledWith({ where: { blockerId: 'tgt', blockedId: 'viewer' }, select: { id: true } });
      expect(p(prisma).follow.findMany).not.toHaveBeenCalled();
    });

    it('entries blocked in either direction with the viewer are filtered out of the list', async () => {
      const prisma = buildPrisma();
      p(prisma).user.findUnique.mockResolvedValue(target);
      await service(prisma).getFollowers('tgt', {}, 'viewer');
      await service(prisma).getFollowing('tgt', {}, 'viewer');
      const notBlocked = { blockedBy: { none: { blockerId: 'viewer' } }, blocksMade: { none: { blockedId: 'viewer' } } };
      const [f1, f2] = p(prisma).follow.findMany.mock.calls.map((c: unknown[]) => (c[0] as { where: Record<string, unknown> }).where);
      expect(f1.follower).toEqual({ is: { accountStatus: 'active', ...notBlocked } });
      expect(f2.followee).toEqual({ is: { accountStatus: 'active', ...notBlocked } });
    });

    it('viewing your OWN graph does not read the block table for the target check', async () => {
      const prisma = buildPrisma();
      p(prisma).user.findUnique.mockResolvedValue(target);
      await service(prisma).getFollowers('viewer', {}, 'viewer');
      expect(p(prisma).block.findFirst).not.toHaveBeenCalled();
    });
  });
});
