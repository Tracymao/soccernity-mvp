import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { buildTestDobEncryption } from '../../crypto/test-dob-encryption';
import { PrismaService } from '../../prisma/prisma.service';
import { policyStub } from './test-username-policy';
import { PROFILE_VISIBILITY_NOT_AVAILABLE_CODE } from './profile-visibility.util';
import { UsersService } from './users.service';

// B-060 (Public profile toggle): UsersService rules with a mocked Prisma. Real-database proof of the whole
// matrix (every post-returning route) is test/profile-visibility.e2e-spec.ts.
function buildPrisma() {
  return {
    user: { findUnique: jest.fn(), update: jest.fn() },
    follow: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    block: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    guardian: { findUnique: jest.fn() },
  } as unknown as PrismaService;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = (prisma: PrismaService) => prisma as any;
const service = (prisma: PrismaService) => new UsersService(prisma, buildTestDobEncryption(), policyStub());

const row = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  username: 'ada_9',
  displayName: 'Ada Obi',
  dateOfBirth: null,
  isMinor: false,
  accountStatus: 'active',
  isProfilePublic: false,
  guardian: null,
  bio: 'Winger',
  profileCountry: 'NG',
  avatarUrl: 'https://cdn/a.jpg',
  avatarKey: 'profile-media/t1/a.jpg',
  avatarStatus: 'approved',
  coverUrl: 'https://cdn/c.jpg',
  coverKey: 'profile-media/t1/c.jpg',
  coverStatus: 'approved',
  ...over,
});

describe('UsersService.getPublicProfile - Public profile toggle (B-060)', () => {
  it('a stranger sees the minimal card for a private profile: name, avatar, isPrivate; bio, country, cover, guardian nulled', async () => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue(row());
    const res = await service(prisma).getPublicProfile('t1', 'stranger');
    expect(res).toEqual({
      id: 't1',
      publicName: 'ada_9',
      guardianContact: null,
      bio: null,
      country: null,
      avatarUrl: 'https://cdn/a.jpg',
      coverUrl: null,
      isFollowing: false,
      viewerFollows: false,
      viewerHasBlocked: false,
      isPrivate: true,
    });
  });

  it('the owner and a follower see the full card with isPrivate false', async () => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue(row());
    const owner = await service(prisma).getPublicProfile('t1', 't1');
    expect(owner).toMatchObject({ isPrivate: false, bio: 'Winger', country: 'NG', coverUrl: 'https://cdn/c.jpg' });

    p(prisma).follow.findUnique.mockResolvedValue({ id: 'f1' });
    const follower = await service(prisma).getPublicProfile('t1', 'follower');
    expect(follower).toMatchObject({ isPrivate: false, bio: 'Winger', isFollowing: true, viewerFollows: true });
  });

  it('a public profile (column true, the default) is the full card for anyone', async () => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue(row({ isProfilePublic: true }));
    expect(await service(prisma).getPublicProfile('t1', 'stranger')).toMatchObject({ isPrivate: false, bio: 'Winger' });
  });

  it('an under-18 owner is always effectively public, even with the column false (the existing safeguarding rules decide)', async () => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue(
      row({ isMinor: true, guardian: { email: 'g@example.com', consentStatus: 'confirmed' } }),
    );
    const res = await service(prisma).getPublicProfile('t1', 'stranger');
    expect(res).toMatchObject({
      isPrivate: false,
      bio: 'Winger',
      guardianContact: { label: 'Guardian contact', email: 'g@example.com' },
    });
  });

  it('a restricted-pending minor is still the plain 404, regardless of the toggle', async () => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue(
      row({ isMinor: true, isProfilePublic: false, guardian: { email: 'g@example.com', consentStatus: 'pending' } }),
    );
    await expect(service(prisma).getPublicProfile('t1', 'stranger')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('the owner having blocked the viewer is still the 404, before the toggle matters', async () => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue(row());
    p(prisma).block.findMany.mockResolvedValue([{ blockerId: 't1', blockedId: 'stranger' }]);
    await expect(service(prisma).getPublicProfile('t1', 'stranger')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('UsersService followers / following - Public profile toggle (B-060)', () => {
  const lists = ['getFollowers', 'getFollowing'] as const;
  const target = (over: Record<string, unknown> = {}) => ({ id: 't1', isMinor: false, accountStatus: 'active', isProfilePublic: false, ...over });

  it.each(lists)('%s: a stranger gets the 404 for a private target and nothing is listed', async (method) => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue(target());
    await expect(service(prisma)[method]('t1', {}, 'stranger')).rejects.toBeInstanceOf(NotFoundException);
    expect(p(prisma).follow.findMany).not.toHaveBeenCalled();
  });

  it.each(lists)('%s: an anonymous call (no viewer id) is a stranger too', async (method) => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue(target());
    await expect(service(prisma)[method]('t1', {}, undefined)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each(lists)('%s: a follower and the owner can read the list', async (method) => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue(target());
    p(prisma).follow.findUnique.mockResolvedValue({ id: 'f1' });
    await expect(service(prisma)[method]('t1', {}, 'follower')).resolves.toEqual({ items: [], nextCursor: null });
    p(prisma).follow.findUnique.mockClear();
    await expect(service(prisma)[method]('t1', {}, 't1')).resolves.toEqual({ items: [], nextCursor: null });
    expect(p(prisma).follow.findUnique).not.toHaveBeenCalled(); // the owner needs no follow lookup
  });

  it.each(lists)('%s: a public target does no follow lookup at all (nothing changes by default)', async (method) => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue(target({ isProfilePublic: true }));
    await service(prisma)[method]('t1', {}, 'stranger');
    expect(p(prisma).follow.findUnique).not.toHaveBeenCalled();
  });

  it.each(lists)('%s: an under-18 target with the column false is still listable', async (method) => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue(target({ isMinor: true }));
    p(prisma).guardian.findUnique.mockResolvedValue({ consentStatus: 'confirmed' });
    await expect(service(prisma)[method]('t1', {}, 'stranger')).resolves.toEqual({ items: [], nextCursor: null });
  });
});

describe('UsersService.updateOwnSettings - isProfilePublic (B-060)', () => {
  const settingsRow = (over: Record<string, unknown> = {}) => ({
    dmPermission: 'everyone',
    mediaSensitive: false,
    readReceipts: null,
    isProfilePublic: true,
    isMinor: false,
    ...over,
  });

  it('an adult can switch it off; a FRESH read of isMinor is made first', async () => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue({ isMinor: false });
    p(prisma).user.update.mockResolvedValue(settingsRow({ isProfilePublic: false }));
    const res = await service(prisma).updateOwnSettings('u1', { isProfilePublic: false });
    expect(res.isProfilePublic).toBe(false);
    expect(p(prisma).user.findUnique).toHaveBeenCalledWith({ where: { id: 'u1' }, select: { isMinor: true } });
    expect(p(prisma).user.update.mock.calls[0][0].data).toEqual({ isProfilePublic: false });
  });

  it.each([true, false])('an under-18 account gets the 403 with its stable code for %s, and nothing at all is written', async (value) => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue({ isMinor: true });
    const err = await service(prisma)
      .updateOwnSettings('u1', { isProfilePublic: value, dmPermission: 'none' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({ code: PROFILE_VISIBILITY_NOT_AVAILABLE_CODE });
    expect(p(prisma).user.update).not.toHaveBeenCalled();
  });

  it('other settings do not trigger the extra isMinor read', async () => {
    const prisma = buildPrisma();
    p(prisma).user.update.mockResolvedValue(settingsRow({ dmPermission: 'none' }));
    await service(prisma).updateOwnSettings('u1', { dmPermission: 'none' });
    expect(p(prisma).user.findUnique).not.toHaveBeenCalled();
  });

  it('a vanished account is a 404', async () => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue(null);
    await expect(service(prisma).updateOwnSettings('u1', { isProfilePublic: false })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('GET reads the EFFECTIVE value: true for an under-18 account even if the column holds false', async () => {
    const prisma = buildPrisma();
    p(prisma).user.findUnique.mockResolvedValue(settingsRow({ isProfilePublic: false, isMinor: true }));
    expect((await service(prisma).getOwnSettings('u1')).isProfilePublic).toBe(true);
    p(prisma).user.findUnique.mockResolvedValue(settingsRow({ isProfilePublic: false, isMinor: false }));
    expect((await service(prisma).getOwnSettings('u1')).isProfilePublic).toBe(false);
  });
});
