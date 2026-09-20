import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthenticatedRequest } from './authenticated-request';

// sprint-1/under-16-restrictions (counsel's ToS/Privacy review). A NEW,
// separate tier layered ON TOP OF GuardianConsentGuard, never a
// replacement: list it AFTER JwtAuthGuard (needs request.user) and next
// to GuardianConsentGuard. Its error is deliberately distinct from
// GuardianConsentGuard's `guardian_consent_pending` -- an under-16 with
// CONFIRMED consent is still blocked here, and the frontend must not
// render a "waiting on your guardian" state for it.
//
// Section 5.7: isUnder16 is read fresh from Postgres on every request,
// never from the token (which carries only { sub, role }).
export const UNDER_16_RESTRICTED_CODE = 'under_16_restricted';

export type Under16Feature = 'messaging' | 'banter' | 'community_groups';

const UNDER_16_KEY = 'under16Feature';

export const RestrictUnder16 = (feature: Under16Feature) => SetMetadata(UNDER_16_KEY, feature);

export const UNDER_16_MESSAGES: Record<Under16Feature, string> = {
  messaging: 'Direct messaging is not available for accounts under 16.',
  banter: 'Bants (Banter Rooms) are not available for accounts under 16.',
  community_groups: 'Accounts under 16 have read-only access to Community Groups.',
};

@Injectable()
export class Under16RestrictionGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<Under16Feature | undefined>(UNDER_16_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Fail closed on a wiring mistake: the guard without a feature tag
    // would otherwise silently allow everyone.
    if (!feature) {
      throw new Error('Under16RestrictionGuard used without @RestrictUnder16(feature)');
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { isUnder16: true },
    });

    // A since-deleted account is not this guard's concern (same stance as
    // GuardianConsentGuard).
    if (!user || !user.isUnder16) {
      return true;
    }

    throw new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      code: UNDER_16_RESTRICTED_CODE,
      feature,
      message: UNDER_16_MESSAGES[feature],
    });
  }
}
