import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildTestDobEncryption } from '../../crypto/test-dob-encryption';
import { PrismaService } from '../../prisma/prisma.service';
import { policyStub } from './test-username-policy';
import { UsersService } from './users.service';

// B-061 (Decision Log #472 (d) and (i)): GET / PATCH /users/me/settings in UsersService.
function build() {
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
  } as unknown as PrismaService;
  const service = new UsersService(prisma, buildTestDobEncryption(), policyStub());
  return { prisma, service };
}

const SELECT = { dmPermission: true, mediaSensitive: true, readReceipts: true, isProfilePublic: true, isMinor: true };

describe('UsersService own settings (B-061)', () => {
  it('reads the two settings fresh, keyed on the caller id only', async () => {
    const { prisma, service } = build();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ dmPermission: 'following', mediaSensitive: true, readReceipts: null, isMinor: false });
    await expect(service.getOwnSettings('u1')).resolves.toEqual({ dmPermission: 'following', mediaSensitive: true, readReceipts: true, isProfilePublic: true });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u1' }, select: SELECT });
  });

  it('returns the defaults for an account that never changed them', async () => {
    const { prisma, service } = build();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ dmPermission: 'everyone', mediaSensitive: false, readReceipts: null, isMinor: false });
    await expect(service.getOwnSettings('u1')).resolves.toEqual({ dmPermission: 'everyone', mediaSensitive: false, readReceipts: true, isProfilePublic: true });
  });

  it('404s when the account no longer exists', async () => {
    const { prisma, service } = build();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.getOwnSettings('u1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a partial update writes only the field sent (dmPermission)', async () => {
    const { prisma, service } = build();
    (prisma.user.update as jest.Mock).mockResolvedValue({ dmPermission: 'none', mediaSensitive: false, readReceipts: null, isMinor: false });
    await expect(service.updateOwnSettings('u1', { dmPermission: 'none' })).resolves.toEqual({
      dmPermission: 'none',
      mediaSensitive: false,
      readReceipts: true,
      isProfilePublic: true,
    });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { dmPermission: 'none' }, select: SELECT });
  });

  it('a partial update writes only the field sent (mediaSensitive, including false)', async () => {
    const { prisma, service } = build();
    (prisma.user.update as jest.Mock).mockResolvedValue({ dmPermission: 'everyone', mediaSensitive: false, readReceipts: null, isMinor: false });
    await service.updateOwnSettings('u1', { mediaSensitive: false });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { mediaSensitive: false }, select: SELECT });
  });

  it('both fields in one request are written together', async () => {
    const { prisma, service } = build();
    (prisma.user.update as jest.Mock).mockResolvedValue({ dmPermission: 'following', mediaSensitive: true, readReceipts: null, isMinor: false });
    await service.updateOwnSettings('u1', { dmPermission: 'following', mediaSensitive: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { dmPermission: 'following', mediaSensitive: true },
      select: SELECT,
    });
  });

  it('an empty body writes nothing and returns the current values (DEFAULT, founder-veto-able)', async () => {
    const { prisma, service } = build();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ dmPermission: 'none', mediaSensitive: true, readReceipts: null, isMinor: false });
    await expect(service.updateOwnSettings('u1', {})).resolves.toEqual({ dmPermission: 'none', mediaSensitive: true, readReceipts: true, isProfilePublic: true });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('maps a vanished account (P2025) to a 404', async () => {
    const { prisma, service } = build();
    (prisma.user.update as jest.Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2025', clientVersion: 'x' }),
    );
    await expect(service.updateOwnSettings('u1', { dmPermission: 'none' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rethrows any other database error untouched', async () => {
    const { prisma, service } = build();
    const boom = new Error('db down');
    (prisma.user.update as jest.Mock).mockRejectedValue(boom);
    await expect(service.updateOwnSettings('u1', { mediaSensitive: true })).rejects.toBe(boom);
  });

  // Read receipts (Decision Log #472, founder decision 2026-11-08). The GET returns the EFFECTIVE boolean.
  describe('read receipts', () => {
    const row = (readReceipts: boolean | null, isMinor: boolean) => ({
      dmPermission: 'everyone',
      mediaSensitive: false,
      readReceipts,
      isMinor,
    });

    it.each([
      [null, false, true], // adult, never chose: ON
      [null, true, false], // under 18, never chose: OFF
      [false, false, false], // adult chose off
      [true, true, true], // under 18 chose on
      [true, false, true],
      [false, true, false],
    ])('stored %s, isMinor %s -> effective %s', async (stored, isMinor, effective) => {
      const { prisma, service } = build();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(row(stored, isMinor));
      await expect(service.getOwnSettings('u1')).resolves.toMatchObject({ readReceipts: effective });
    });

    it('the age default follows the stored isMinor flag at read time: the same NULL flips when the flag does', async () => {
      const { prisma, service } = build();
      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(row(null, true));
      await expect(service.getOwnSettings('u1')).resolves.toMatchObject({ readReceipts: false });
      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(row(null, false));
      await expect(service.getOwnSettings('u1')).resolves.toMatchObject({ readReceipts: true });
    });

    it('PATCH stores an explicit true or false (never NULL) and returns the effective value', async () => {
      const { prisma, service } = build();
      (prisma.user.update as jest.Mock).mockResolvedValueOnce(row(true, true));
      await expect(service.updateOwnSettings('u1', { readReceipts: true })).resolves.toMatchObject({ readReceipts: true });
      expect(prisma.user.update).toHaveBeenLastCalledWith({ where: { id: 'u1' }, data: { readReceipts: true }, select: SELECT });
      (prisma.user.update as jest.Mock).mockResolvedValueOnce(row(false, false));
      await expect(service.updateOwnSettings('u1', { readReceipts: false })).resolves.toMatchObject({ readReceipts: false });
      expect(prisma.user.update).toHaveBeenLastCalledWith({ where: { id: 'u1' }, data: { readReceipts: false }, select: SELECT });
    });
  });
});
