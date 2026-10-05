import { buildTestDobEncryption } from '../../crypto/test-dob-encryption';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from './users.service';

const CLUB_ID = '11111111-1111-4111-8111-111111111111';

function buildPrismaMock() {
  return {
    clubPage: { findFirst: jest.fn() },
    user: { update: jest.fn().mockResolvedValue({ representedClub: null }) },
  } as unknown as PrismaService;
}

describe('UsersService.setRepresentedClub (Decision Log #74)', () => {
  it('represents a club the caller is a member of, checking membership against ClubPage.members', async () => {
    const prisma = buildPrismaMock();
    (prisma.clubPage.findFirst as jest.Mock).mockResolvedValue({ id: CLUB_ID });
    (prisma.user.update as jest.Mock).mockResolvedValue({ representedClub: { id: CLUB_ID, name: 'Ikoyi Rovers FC' } });

    const result = await new UsersService(prisma, buildTestDobEncryption()).setRepresentedClub('user-1', CLUB_ID);

    expect(prisma.clubPage.findFirst).toHaveBeenCalledWith({
      where: { id: CLUB_ID, members: { some: { id: 'user-1' } } },
      select: { id: true },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { representedClubId: CLUB_ID },
      select: { representedClub: { select: { id: true, name: true } } },
    });
    expect(result).toEqual({ representedClub: { id: CLUB_ID, name: 'Ikoyi Rovers FC' } });
  });

  it('rejects a club the caller has not joined with a 400, and writes nothing', async () => {
    const prisma = buildPrismaMock();
    (prisma.clubPage.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(new UsersService(prisma, buildTestDobEncryption()).setRepresentedClub('user-1', CLUB_ID)).rejects.toThrow(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('treats a non-existent club id the same as an un-joined one: 400, not 404', async () => {
    const prisma = buildPrismaMock();
    (prisma.clubPage.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(new UsersService(prisma, buildTestDobEncryption()).setRepresentedClub('user-1', CLUB_ID)).rejects.toThrow(BadRequestException);
  });

  it('null unrepresents the club without any membership lookup', async () => {
    const prisma = buildPrismaMock();
    (prisma.user.update as jest.Mock).mockResolvedValue({ representedClub: null });

    const result = await new UsersService(prisma, buildTestDobEncryption()).setRepresentedClub('user-1', null);

    expect(prisma.clubPage.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { representedClubId: null } }));
    expect(result).toEqual({ representedClub: null });
  });
});
