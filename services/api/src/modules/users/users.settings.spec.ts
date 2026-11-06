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

const SELECT = { dmPermission: true, mediaSensitive: true };

describe('UsersService own settings (B-061)', () => {
  it('reads the two settings fresh, keyed on the caller id only', async () => {
    const { prisma, service } = build();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ dmPermission: 'following', mediaSensitive: true });
    await expect(service.getOwnSettings('u1')).resolves.toEqual({ dmPermission: 'following', mediaSensitive: true });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u1' }, select: SELECT });
  });

  it('returns the defaults for an account that never changed them', async () => {
    const { prisma, service } = build();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ dmPermission: 'everyone', mediaSensitive: false });
    await expect(service.getOwnSettings('u1')).resolves.toEqual({ dmPermission: 'everyone', mediaSensitive: false });
  });

  it('404s when the account no longer exists', async () => {
    const { prisma, service } = build();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.getOwnSettings('u1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a partial update writes only the field sent (dmPermission)', async () => {
    const { prisma, service } = build();
    (prisma.user.update as jest.Mock).mockResolvedValue({ dmPermission: 'none', mediaSensitive: false });
    await expect(service.updateOwnSettings('u1', { dmPermission: 'none' })).resolves.toEqual({
      dmPermission: 'none',
      mediaSensitive: false,
    });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { dmPermission: 'none' }, select: SELECT });
  });

  it('a partial update writes only the field sent (mediaSensitive, including false)', async () => {
    const { prisma, service } = build();
    (prisma.user.update as jest.Mock).mockResolvedValue({ dmPermission: 'everyone', mediaSensitive: false });
    await service.updateOwnSettings('u1', { mediaSensitive: false });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { mediaSensitive: false }, select: SELECT });
  });

  it('both fields in one request are written together', async () => {
    const { prisma, service } = build();
    (prisma.user.update as jest.Mock).mockResolvedValue({ dmPermission: 'following', mediaSensitive: true });
    await service.updateOwnSettings('u1', { dmPermission: 'following', mediaSensitive: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { dmPermission: 'following', mediaSensitive: true },
      select: SELECT,
    });
  });

  it('an empty body writes nothing and returns the current values (DEFAULT, founder-veto-able)', async () => {
    const { prisma, service } = build();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ dmPermission: 'none', mediaSensitive: true });
    await expect(service.updateOwnSettings('u1', {})).resolves.toEqual({ dmPermission: 'none', mediaSensitive: true });
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
});
