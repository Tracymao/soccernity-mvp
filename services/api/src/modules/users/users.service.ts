import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

// Fields returned for the authenticated user's OWN profile. Notably:
//
// - passwordHash is never in this list, so there is no code path where it
//   is even pulled out of Postgres by this service, let alone serialized
//   into a response — this is a Prisma `select`, not a post-hoc `delete
//   result.passwordHash`, which would be one refactor away from a leak.
// - isMinor / verificationStatus ARE included, because this is a fresh
//   `findUnique`/`update` against Postgres on every single call — never
//   assembled from the JWT (which per token.types.ts carries only
//   { sub, role } and structurally cannot supply these fields anyway).
//   This satisfies the non-negotiable in CLAUDE.md and Build Plan
//   Section 5.7: safety-sensitive fields must come from a fresh DB read,
//   not a cached/trusted claim.
const OWN_PROFILE_SELECT = {
  id: true,
  email: true,
  phone: true,
  displayName: true,
  dateOfBirth: true,
  isMinor: true,
  role: true,
  verificationStatus: true,
  createdAt: true,
  clubAffiliationId: true,
} as const;

export type OwnProfile = {
  id: string;
  email: string;
  phone: string | null;
  displayName: string;
  dateOfBirth: Date;
  isMinor: boolean;
  role: string;
  verificationStatus: string;
  createdAt: Date;
  clubAffiliationId: string | null;
};

// The ONLY place request-body fields become a Prisma `data` object for
// this update. An explicit allowlist, not `{ ...dto }` — even if
// UpdateUserDto or the global ValidationPipe were ever loosened upstream,
// this function structurally cannot forward isMinor, role,
// verificationStatus, or any other field to Prisma, because it never
// reads them off `dto` in the first place.
function toUpdateData(dto: UpdateUserDto): { displayName?: string; phone?: string } {
  const data: { displayName?: string; phone?: string } = {};
  if (dto.displayName !== undefined) data.displayName = dto.displayName;
  if (dto.phone !== undefined) data.phone = dto.phone;
  return data;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getOwnProfile(userId: string): Promise<OwnProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: OWN_PROFILE_SELECT,
    });
    if (!user) {
      // A valid 15-minute access token for a since-deleted account is a
      // real (if rare) case, not a hypothetical — the token itself
      // can't know the account is gone.
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateOwnProfile(userId: string, dto: UpdateUserDto): Promise<OwnProfile> {
    const data = toUpdateData(dto);
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: OWN_PROFILE_SELECT,
    });
  }
}
