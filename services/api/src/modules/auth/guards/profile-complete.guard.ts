import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { isProfileComplete } from '../onboarding-state.util';
import { AuthenticatedRequest } from './authenticated-request';

// B-027 (Decision Log #369, #392 item 9): "Until Create Profile is complete an
// account is shown to others under a neutral placeholder name, cannot post, and
// is redirected to Create Profile on every login." This is the "cannot post"
// half. The placeholder name lives in users/public-name.util.ts; the redirect is
// the `nextStep` field on the login / own-profile responses.
//
// A profile is complete when a username has been chosen (isProfileComplete).
// Legacy accounts that never chose one are INSIDE the gate (#392 item 9): they
// cannot post again until they pick one, which they do through PATCH
// /users/:id -- deliberately NOT behind this guard, since that is how an
// incomplete profile becomes complete.
//
// Composable alongside JwtAuthGuard, never a replacement: list JwtAuthGuard
// FIRST in @UseGuards() so request.user is attached by the time this runs.
// Same Section 5.7 discipline as the sibling guards: the access token carries
// only { sub, role }, so the username is read fresh from Postgres on every
// request this guard protects.
//
// FAIL-SAFE, like EmailVerifiedGuard: a missing row (account deleted behind a
// still-valid token) refuses, because this guards a precondition.
//
// WHICH ROUTES: the ones that publish content or send a message under the
// user's identity -- posts, comments, Bants rooms / room posts / topics,
// Community Group creation, DMs, Contest entries. NOT likes, saves, follows,
// club joins, Grassroots team records (the team page exposes no organiser
// identity) or reports/appeals: those either show the user only as the
// placeholder or are safety routes that must stay open. The full table, with
// the reasoning, is in docs/backend-w3-gates-report.md and pinned by
// write-route-guards.spec.ts.
export const PROFILE_INCOMPLETE_CODE = 'profile_incomplete';

@Injectable()
export class ProfileCompleteGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { sub: userId } = request.user;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });

    if (user && isProfileComplete(user)) {
      return true;
    }

    // A distinct, machine-readable `code` so the frontend can send the user to
    // Create Profile rather than treating this as an auth failure.
    throw new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      code: PROFILE_INCOMPLETE_CODE,
      message: 'Complete your profile (choose a username) to continue.',
    });
  }
}
