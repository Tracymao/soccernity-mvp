import { PrismaService } from '../../prisma/prisma.service';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationPolicyService } from './notification-policy.service';

function build() {
  const prisma = {
    notificationPreference: { findUnique: jest.fn(), upsert: jest.fn(), findFirst: jest.fn() },
    follow: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    like: { findFirst: jest.fn() },
    comment: { findFirst: jest.fn() },
    message: { findFirst: jest.fn() },
  };
  return { prisma, settings: new NotificationSettingsService(prisma as unknown as PrismaService) };
}

describe('NotificationSettingsService', () => {
  it('no row means all four are false', async () => {
    const t = build();
    t.prisma.notificationPreference.findUnique.mockResolvedValue(null);
    expect(await t.settings.get('u1')).toEqual({
      qualityFilter: false,
      muteNonFollowing: false,
      muteNonFollowers: false,
      muteNewAccounts: false,
    });
    expect(t.prisma.notificationPreference.findUnique.mock.calls[0][0].where).toEqual({ userId: 'u1' });
  });

  it('returns the stored row', async () => {
    const t = build();
    const row = { qualityFilter: true, muteNonFollowing: false, muteNonFollowers: true, muteNewAccounts: false };
    t.prisma.notificationPreference.findUnique.mockResolvedValue(row);
    expect(await t.settings.get('u1')).toEqual(row);
  });

  it('a partial update upserts only the keys sent, scoped to the caller', async () => {
    const t = build();
    const row = { qualityFilter: true, muteNonFollowing: false, muteNonFollowers: false, muteNewAccounts: false };
    t.prisma.notificationPreference.upsert.mockResolvedValue(row);
    expect(await t.settings.update('u1', { qualityFilter: true })).toEqual(row);
    const args = t.prisma.notificationPreference.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ userId: 'u1' });
    expect(args.create).toEqual({ userId: 'u1', qualityFilter: true });
    expect(args.update).toEqual({ qualityFilter: true });
  });

  it('false is written, not skipped', async () => {
    const t = build();
    t.prisma.notificationPreference.upsert.mockResolvedValue({});
    await t.settings.update('u1', { muteNewAccounts: false, muteNonFollowers: true });
    expect(t.prisma.notificationPreference.upsert.mock.calls[0][0].update).toEqual({
      muteNewAccounts: false,
      muteNonFollowers: true,
    });
  });

  it('an empty body writes nothing and returns the current values', async () => {
    const t = build();
    t.prisma.notificationPreference.findUnique.mockResolvedValue(null);
    expect(await t.settings.update('u1', {})).toEqual({
      qualityFilter: false,
      muteNonFollowing: false,
      muteNonFollowers: false,
      muteNewAccounts: false,
    });
    expect(t.prisma.notificationPreference.upsert).not.toHaveBeenCalled();
  });
});

describe('NotificationPolicyService', () => {
  it('delegates to the one rule', async () => {
    const t = build();
    t.prisma.notificationPreference.findUnique.mockResolvedValue({
      qualityFilter: false,
      muteNonFollowing: true,
      muteNonFollowers: false,
      muteNewAccounts: false,
    });
    t.prisma.follow.findUnique.mockResolvedValue(null);
    const service = new NotificationPolicyService(t.prisma as unknown as PrismaService);
    expect(await service.shouldCreate('recipient', 'actor', 'follow')).toBe(false);
    expect(await service.shouldCreate('recipient', 'actor', 'message')).toBe(true);
  });
});
