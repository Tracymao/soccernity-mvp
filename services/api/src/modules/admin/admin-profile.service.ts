import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminSummary, toAdminSummary } from './admin-response.mapper';
import { UpdateAdminProfileDto } from './dto/update-admin-profile.dto';

// GET/PATCH /admin/profile — backs the Admin Profile Figma screen (Full
// name, Email, Role, Phone; Edit Profile). Mirrors
// services/api/src/modules/users/users.service.ts's
// getOwnProfile/updateOwnProfile/toUpdateData pattern closely: a Prisma
// `select`-free approach is fine here since AdminSummary already excludes
// passwordHash via toAdminSummary()'s explicit field list (there is only
// ever one caller of this service, no separate "public view of another
// admin" concern the way UsersService's OWN_PROFILE_SELECT has to guard
// against), but the same "never spread the raw Prisma row into a
// response" and "explicit allowlist, not `{ ...dto }`" discipline is kept
// throughout.
@Injectable()
export class AdminProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getOwnProfile(adminId: string): Promise<AdminSummary> {
    const admin = await this.prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!admin) {
      // Same rare-but-real "valid access token for a since-removed admin
      // account" case UsersService.getOwnProfile calls out for User.
      throw new NotFoundException('Admin account not found');
    }
    return toAdminSummary(admin);
  }

  async updateOwnProfile(adminId: string, dto: UpdateAdminProfileDto): Promise<AdminSummary> {
    const data = this.toUpdateData(dto);
    const admin = await this.prisma.adminUser.update({ where: { id: adminId }, data });
    return toAdminSummary(admin);
  }

  // The ONLY place request-body fields become a Prisma `data` object for
  // this update — an explicit allowlist, not `{ ...dto }`, mirroring
  // UsersService.toUpdateData's exact discipline: even if
  // UpdateAdminProfileDto or the global ValidationPipe were ever loosened
  // upstream, this function structurally cannot forward `role`, `email`,
  // or `accountStatus` to Prisma, because it never reads them off `dto`
  // in the first place.
  private toUpdateData(dto: UpdateAdminProfileDto): { fullName?: string; phone?: string } {
    const data: { fullName?: string; phone?: string } = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.phone !== undefined) data.phone = dto.phone;
    return data;
  }
}
