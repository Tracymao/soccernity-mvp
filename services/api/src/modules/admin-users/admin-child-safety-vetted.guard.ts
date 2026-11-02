import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedAdminRequest } from '../admin/guards/authenticated-admin-request';
import { assertAdminChildSafetyVetted } from '../moderation/child-safety-vetting.util';

// backend/b280-withhold-guardian-notices (B-280; Decision Log #458). The child-safety-vetting gate as a GUARD, so it
// runs after AdminJwtAuthGuard and AdminRolesGuard and BEFORE the validation pipe, the route parameters and the
// service: an unvetted admin (whatever their role, an unvetted superadmin included) gets the same coded 403 for
// every account and every body, and so learns nothing about any account (not even whether it exists or is a minor).
//
// Read FRESH from Postgres on every request (the shared isAdminChildSafetyVetted rule); AdminAccessTokenPayload
// carries only { sub, role, aud }, so a stale page loaded while the admin was vetted is refused the moment they are
// not. MUST sit after AdminJwtAuthGuard in the @UseGuards(...) list (it reads request.admin).
@Injectable()
export class AdminChildSafetyVettedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedAdminRequest>();
    await assertAdminChildSafetyVetted(this.prisma, request.admin?.sub);
    return true;
  }
}
